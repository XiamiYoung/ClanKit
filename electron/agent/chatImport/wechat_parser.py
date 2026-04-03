#!/usr/bin/env python3
"""
聊天记录解析器（微信 + iMessage）

支持平台：
  - 微信 PC 端（Windows）：解密后的 MSG*.db
  - iMessage（macOS）：~/Library/Messages/chat.db

用法：
  # 微信 — 从解密后的 db 目录提取
  python wechat_parser.py --db-dir ./decrypted/ --target "柳智敏" --output messages.txt

  # 微信 — 列出所有联系人
  python wechat_parser.py --db-dir ./decrypted/ --list-contacts

  # iMessage — 从 macOS chat.db 提取
  python wechat_parser.py --imessage --db ~/Library/Messages/chat.db \
      --target "+1xxxxxxxxxx" --output messages.txt

  # iMessage — 列出所有 iMessage 联系人
  python wechat_parser.py --imessage --db ~/Library/Messages/chat.db --list-contacts

  # 从导出的文本文件解析（通用）
  python wechat_parser.py --txt ./chat_export.txt --target "柳智敏" --output messages.txt

依赖：
  pip install sqlite3（标准库，无需额外安装）

iMessage 授权：
  macOS 需要在「系统偏好设置 → 隐私 → 完全磁盘访问权限」中添加终端/Python
"""

import sqlite3
import json
import re
import sys
import hashlib
import argparse
from pathlib import Path
from datetime import datetime


# ─── 微信 PC 数据库结构 ─────────────────────────────────────────────────────────

# MSG*.db 中的消息表结构（微信 3.x）
MSG_QUERY = """
SELECT
    m.localId,
    m.MsgSvrID,
    m.Type,
    m.IsSender,
    m.CreateTime,
    m.StrContent,
    n.UsrName AS talker_wxid
FROM MSG m
LEFT JOIN Name2ID n ON n.UsrName = (
    SELECT UsrName FROM Name2ID WHERE _id = m.TalkerId LIMIT 1
)
WHERE m.Type = 1  -- 1 = 文本消息
ORDER BY m.CreateTime ASC
"""

# 更通用的查询（兼容不同版本）
MSG_QUERY_SIMPLE = """
SELECT
    localId,
    Type,
    IsSender,
    CreateTime,
    StrContent
FROM MSG
WHERE Type = 1
ORDER BY CreateTime ASC
"""

# MicroMsg.db contact table (3.x)
CONTACT_QUERY = """
SELECT
    UserName,
    Alias,
    Remark,
    NickName,
    Type
FROM Contact
WHERE Type != 4   -- 4 = deleted
ORDER BY NickName
"""

# contact/contact.db contact table (4.x)
CONTACT_QUERY_V4 = """
SELECT
    username  AS UserName,
    alias     AS Alias,
    remark    AS Remark,
    nick_name AS NickName
FROM contact
WHERE delete_flag = 0
ORDER BY nick_name
"""


# ─── 数据库解析 ─────────────────────────────────────────────────────────────────

def open_db(db_path: str) -> sqlite3.Connection | None:
    """打开 SQLite 数据库（只读）"""
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        # 快速验证
        conn.execute("SELECT name FROM sqlite_master LIMIT 1")
        return conn
    except sqlite3.DatabaseError as e:
        print(f"无法打开数据库 {db_path}：{e}", file=sys.stderr)
        print("请确认数据库已解密（运行 wechat_decryptor.py）", file=sys.stderr)
        return None


def get_tables(conn: sqlite3.Connection) -> list[str]:
    """获取数据库中所有表名"""
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    return [row[0] for row in rows]


def _detect_v4_layout(db_dir: str) -> bool:
    """Return True if db_dir has WeChat 4.x layout (contact/contact.db + message/)."""
    p = Path(db_dir)
    return (p / "contact" / "contact.db").exists() and (p / "message").is_dir()


def _find_account_dirs(db_dir: str) -> list[str]:
    """If db_dir is a multi-account output container, return account subdirectory paths.

    E.g. wechat-decrypted/ contains xiami0409_833a/ and amyhuahua_0cd7/.
    Returns paths to subdirs that have 4.x layout. If db_dir itself has a valid
    layout, returns [db_dir].
    """
    if _detect_v4_layout(db_dir):
        return [db_dir]
    p = Path(db_dir)
    # Check for MicroMsg.db (3.x) — if found, this IS the right dir
    if (p / "MicroMsg.db").exists():
        return [db_dir]
    # Check subdirectories for 4.x layout
    acct_dirs = []
    if p.is_dir():
        for child in sorted(p.iterdir()):
            if child.is_dir() and _detect_v4_layout(str(child)):
                acct_dirs.append(str(child))
    return acct_dirs if acct_dirs else [db_dir]


def _find_micro_msg_db(db_dir: str):
    """Find MicroMsg.db (3.x) or contact.db (4.x), searching recursively."""
    p = Path(db_dir)
    # 4.x layout
    contact_db = p / "contact" / "contact.db"
    if contact_db.exists():
        return contact_db
    # 3.x layout
    micro = p / "MicroMsg.db"
    if micro.exists():
        return micro
    found = list(p.rglob("MicroMsg.db"))
    if found:
        return found[0]
    found = list(p.rglob("contact.db"))
    return found[0] if found else None


def _find_msg_dbs(db_dir: str):
    """Find message DB files (MSG*.db for 3.x, message/message_N.db for 4.x)."""
    db_path = Path(db_dir)
    # 4.x layout
    msg_dir = db_path / "message"
    if msg_dir.is_dir():
        dbs = sorted(msg_dir.glob("message_*.db"))
        if dbs:
            return dbs
    # 3.x layout
    dbs = sorted(db_path.glob("MSG*.db")) + sorted(db_path.glob("Multi/MSG*.db"))
    if not dbs:
        dbs = sorted(db_path.rglob("MSG*.db"))
    return dbs


def _load_avatars(db_dir: str) -> dict:
    """Load contact avatars from head_image.db. Returns {username: base64_jpeg}."""
    import base64
    avatars = {}
    acct_dirs = _find_account_dirs(db_dir)
    for ad in acct_dirs:
        p = Path(ad)
        head_db = p / "head_image" / "head_image.db"
        if not head_db.exists():
            head_db_list = list(p.rglob("head_image.db"))
            head_db = head_db_list[0] if head_db_list else None
        if not head_db:
            continue
        conn = open_db(str(head_db))
        if not conn:
            continue
        try:
            for row in conn.execute("SELECT username, image_buffer FROM head_image WHERE length(image_buffer) > 0"):
                uname = row[0]
                buf = row[1]
                if uname and buf and isinstance(buf, bytes) and len(buf) > 100:
                    avatars[uname] = "data:image/jpeg;base64," + base64.b64encode(buf).decode("ascii")
        except Exception:
            pass
        finally:
            conn.close()
    return avatars


def list_contacts(db_dir: str) -> list[dict]:
    """List contacts from MicroMsg.db (3.x) or contact/contact.db (4.x).

    If db_dir is a multi-account container, searches account subdirectories.
    """
    # Auto-detect account subdirectories
    acct_dirs = _find_account_dirs(db_dir)
    micro_db = None
    for ad in acct_dirs:
        micro_db = _find_micro_msg_db(ad)
        if micro_db:
            break
    if not micro_db:
        print(f"Contact database not found.", file=sys.stderr)
        return []

    conn = open_db(str(micro_db))
    if not conn:
        return []

    try:
        tables = get_tables(conn)
        # 4.x: table "contact" (lowercase), 3.x: table "Contact" (capitalized)
        if "contact" in tables:
            query = CONTACT_QUERY_V4
        elif "Contact" in tables:
            query = CONTACT_QUERY
        else:
            print(f"No contact table found in {micro_db}", file=sys.stderr)
            return []

        contacts = []
        for row in conn.execute(query):
            contacts.append({
                "wxid": row["UserName"],
                "alias": row["Alias"] or "",
                "remark": row["Remark"] or "",
                "nickname": row["NickName"] or "",
            })
        return contacts
    except Exception as e:
        print(f"Failed to read contacts: {e}", file=sys.stderr)
        return []
    finally:
        conn.close()


def count_messages_by_contact(db_dir: str) -> dict:
    """Count messages per contact wxid across MSG/message DBs. Returns {wxid: count}."""
    counts = {}
    acct_dirs = _find_account_dirs(db_dir)
    for ad in acct_dirs:
        sub_counts = _count_messages_in_dir(ad)
        for wxid, cnt in sub_counts.items():
            counts[wxid] = counts.get(wxid, 0) + cnt
    return counts


def _count_messages_in_dir(db_dir: str) -> dict:
    """Count messages per wxid in a single directory. Returns {wxid: count}."""
    counts = {}
    is_v4 = _detect_v4_layout(db_dir)
    msg_dbs = _find_msg_dbs(db_dir)
    for db_file in msg_dbs:
        conn = open_db(str(db_file))
        if not conn:
            continue
        try:
            tables = get_tables(conn)
            if is_v4:
                # 4.x: each wxid has Msg_<md5(wxid)> table, Name2Id maps wxid -> rowid
                name2id = {}
                if "Name2Id" in tables:
                    for row in conn.execute("SELECT rowid, user_name FROM Name2Id"):
                        name2id[row[0]] = row[1]
                for tbl in tables:
                    if not tbl.startswith("Msg_"):
                        continue
                    try:
                        cnt = conn.execute(
                            f'SELECT COUNT(*) FROM [{tbl}] WHERE local_type = 1'
                        ).fetchone()[0]
                        if cnt > 0:
                            # Reverse-map: find wxid whose md5 matches this table
                            tbl_hash = tbl[4:]  # strip "Msg_"
                            wxid = None
                            for _rid, uname in name2id.items():
                                if hashlib.md5(uname.encode()).hexdigest() == tbl_hash:
                                    wxid = uname
                                    break
                            if wxid:
                                counts[wxid] = counts.get(wxid, 0) + cnt
                    except Exception:
                        pass
            elif "Name2ID" in tables and "MSG" in tables:
                # 3.x: single MSG table with TalkerId -> Name2ID
                rows = conn.execute("""
                    SELECT n.UsrName, COUNT(*) as cnt
                    FROM MSG m
                    JOIN Name2ID n ON n._id = m.TalkerId
                    WHERE m.Type = 1
                    GROUP BY n.UsrName
                """).fetchall()
                for row in rows:
                    wxid = row[0]
                    counts[wxid] = counts.get(wxid, 0) + row[1]
        except Exception:
            pass
        finally:
            conn.close()
    return counts


def find_contact_wxid(db_dir: str, target_name: str) -> str | None:
    """根据名称（微信名/备注名/wxid）找到 wxid"""
    contacts = list_contacts(db_dir)
    target_lower = target_name.lower()

    # 精确匹配
    for c in contacts:
        if (target_lower == c["wxid"].lower() or
                target_lower == c["remark"].lower() or
                target_lower == c["nickname"].lower() or
                target_lower == c["alias"].lower()):
            return c["wxid"]

    # 模糊匹配
    for c in contacts:
        if (target_lower in c["wxid"].lower() or
                target_lower in c["remark"].lower() or
                target_lower in c["nickname"].lower()):
            print(f"模糊匹配到联系人：{c['remark'] or c['nickname']} ({c['wxid']})")
            return c["wxid"]

    return None


def _extract_messages_v4(db_path: str, target_wxid: str, my_wxid: str | None = None) -> list[dict]:
    """Extract text messages from a 4.x message_N.db for a specific target wxid."""
    conn = open_db(db_path)
    if not conn:
        return []

    table_hash = hashlib.md5(target_wxid.encode()).hexdigest()
    table_name = f"Msg_{table_hash}"

    tables = get_tables(conn)
    if table_name not in tables:
        conn.close()
        return []

    messages = []
    try:
        # Build Name2Id reverse map to determine sender
        my_rowid = None
        if "Name2Id" in tables and my_wxid:
            for row in conn.execute("SELECT rowid, user_name FROM Name2Id"):
                if row[1] == my_wxid:
                    my_rowid = row[0]
                    break

        rows = conn.execute(f"""
            SELECT local_type, real_sender_id, create_time, message_content
            FROM [{table_name}]
            WHERE local_type = 1
            ORDER BY create_time ASC
        """).fetchall()

        for row in rows:
            content = row[3] or ""
            if isinstance(content, bytes):
                continue  # Skip compressed/binary content
            if not content.strip():
                continue
            if content.strip() in ["[图片]", "[语音]", "[文件]", "[视频]", "[撤回了一条消息]", ""]:
                continue
            if content.strip().startswith("<"):
                content = _extract_text_from_xml(content)
                if not content:
                    continue

            ts = row[2] or 0
            try:
                timestamp = datetime.fromtimestamp(int(ts)).strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                timestamp = str(ts)

            sender_id = row[1]
            is_me = (my_rowid is not None and sender_id == my_rowid)

            messages.append({
                "sender": "me" if is_me else "them",
                "content": content.strip(),
                "timestamp": timestamp,
                "talker_wxid": target_wxid,
            })
    except Exception as e:
        print(f"Failed to read messages from {table_name} ({db_path}): {e}", file=sys.stderr)
    finally:
        conn.close()

    return messages


def extract_messages_from_db(db_path: str, target_wxid: str | None = None) -> list[dict]:
    """Extract text messages from a single 3.x MSG*.db."""
    conn = open_db(db_path)
    if not conn:
        return []

    tables = get_tables(conn)
    messages = []

    try:
        if "MSG" not in tables:
            return []

        try:
            if "Name2ID" in tables:
                rows = conn.execute("""
                    SELECT
                        m.localId,
                        m.Type,
                        m.IsSender,
                        m.CreateTime,
                        m.StrContent,
                        n.UsrName AS talker_wxid
                    FROM MSG m
                    LEFT JOIN Name2ID n ON n._id = m.TalkerId
                    WHERE m.Type = 1
                    ORDER BY m.CreateTime ASC
                """).fetchall()
            else:
                rows = conn.execute(MSG_QUERY_SIMPLE).fetchall()
                rows = [dict(r) | {"talker_wxid": None} for r in rows]
        except Exception:
            rows = conn.execute(MSG_QUERY_SIMPLE).fetchall()
            rows = [dict(r) | {"talker_wxid": None} for r in rows]

        for row in rows:
            if isinstance(row, sqlite3.Row):
                row = dict(row)

            talker = row.get("talker_wxid") or ""
            if target_wxid:
                if not talker:
                    continue
                if talker != target_wxid:
                    continue

            content = row.get("StrContent", "") or ""
            if not content.strip():
                continue
            if content.strip() in ["[图片]", "[语音]", "[文件]", "[视频]", "[撤回了一条消息]", ""]:
                continue
            if content.strip().startswith("<"):
                content = _extract_text_from_xml(content)
                if not content:
                    continue

            ts = row.get("CreateTime", 0) or 0
            try:
                timestamp = datetime.fromtimestamp(int(ts)).strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                timestamp = str(ts)

            messages.append({
                "sender": "me" if row.get("IsSender", 0) == 1 else "them",
                "content": content.strip(),
                "timestamp": timestamp,
                "talker_wxid": talker or "",
            })

    except Exception as e:
        print(f"Failed to read messages ({db_path}): {e}", file=sys.stderr)
    finally:
        conn.close()

    return messages


def _extract_text_from_xml(xml_content: str) -> str:
    """从微信 XML 富文本消息中提取可读文字"""
    # 提取 <title> 标签内容
    m = re.search(r"<title[^>]*>([^<]+)</title>", xml_content)
    if m:
        return f"[分享] {m.group(1).strip()}"
    # 提取 <des> 标签内容
    m = re.search(r"<des[^>]*>([^<]+)</des>", xml_content)
    if m:
        return f"[分享] {m.group(1).strip()}"
    return ""


def _detect_my_wxid(db_dir: str) -> str | None:
    """Detect the logged-in user's wxid from the directory name or name2id table."""
    # 4.x directory name pattern: <wxid>_<hash>/db_storage
    p = Path(db_dir)
    # Walk up to find xwechat_files/<account>/db_storage
    if p.name == "db_storage":
        acct = p.parent.name  # e.g. "xiami0409_833a"
    elif p.parent.name and not p.name.startswith("MSG"):
        acct = p.name
    else:
        return None
    # Account dir name is wxid + "_" + short hash, but wxid may contain underscores
    # Try to find it in Name2Id of the first message db
    msg_dbs = _find_msg_dbs(db_dir)
    if msg_dbs:
        conn = open_db(str(msg_dbs[0]))
        if conn:
            try:
                tables = get_tables(conn)
                if "Name2Id" in tables:
                    for row in conn.execute("SELECT user_name FROM Name2Id"):
                        uname = row[0] or ""
                        if uname and acct.startswith(uname):
                            return uname
            except Exception:
                pass
            finally:
                conn.close()
    return None


def extract_messages_from_dir(db_dir: str, target_wxid: str | None = None) -> list[dict]:
    """Extract messages from all DB files in directory, merged and sorted by time.

    Auto-detects multi-account containers and 4.x layout.
    """
    all_messages = []

    # Auto-detect account subdirectories
    acct_dirs = _find_account_dirs(db_dir)

    for ad in acct_dirs:
        is_v4 = _detect_v4_layout(ad)
        db_files = _find_msg_dbs(ad)
        if not db_files:
            continue

        if is_v4 and target_wxid:
            my_wxid = _detect_my_wxid(ad)
            for db_file in db_files:
                msgs = _extract_messages_v4(str(db_file), target_wxid, my_wxid)
                all_messages.extend(msgs)
                if msgs:
                    print(f"  {db_file.name}: {len(msgs)} messages", file=sys.stderr)
        else:
            for db_file in db_files:
                msgs = extract_messages_from_db(str(db_file), target_wxid)
                all_messages.extend(msgs)
                if msgs:
                    print(f"  {db_file.name}: {len(msgs)} messages", file=sys.stderr)

    if not all_messages:
        print(f"No message DB files found in {db_dir}", file=sys.stderr)

    all_messages.sort(key=lambda x: x["timestamp"])
    return all_messages


def parse_txt_export(file_path: str, target_name: str) -> list[dict]:
    """解析手动导出的文本格式（兼容多种格式）"""
    messages = []

    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    # 尝试匹配格式：2024-01-01 10:00 发送人：消息
    pattern_datetime_sender = re.compile(
        r"^(?P<time>\d{4}[-/]\d{1,2}[-/]\d{1,2}[\s\d:]+)\s+(?P<sender>.+?)[:：]\s*(?P<content>.+)$"
    )
    # 也兼容 "发送人 2024-01-01 10:00" 格式
    pattern_sender_datetime = re.compile(
        r"^(?P<sender>.+?)\s+(?P<time>\d{4}[-/]\d{1,2}[-/]\d{1,2}[\s\d:]+)\s*$"
    )

    current_sender = None
    current_time = None
    pending_content_lines = []

    def flush_pending():
        if current_sender and pending_content_lines:
            content = " ".join(pending_content_lines).strip()
            if content and content not in ["[图片]", "[语音]", "[文件]", "[视频]"]:
                is_target = target_name.lower() in (current_sender or "").lower()
                messages.append({
                    "sender": "them" if is_target else "me",
                    "content": content,
                    "timestamp": current_time or "",
                    "talker_wxid": "",
                })
        return []

    for line in lines:
        line = line.rstrip("\n")
        m = pattern_datetime_sender.match(line)
        if m:
            pending_content_lines = flush_pending()
            current_time = m.group("time").strip()
            current_sender = m.group("sender").strip()
            pending_content_lines = [m.group("content").strip()]
        elif line.strip() and current_sender:
            # 多行消息的续行
            pending_content_lines.append(line.strip())

    flush_pending()
    return messages


# ─── iMessage 解析 ────────────────────────────────────────────────────────────

def list_imessage_contacts(db_path: str) -> list[dict]:
    """列出 iMessage 数据库中的所有联系人"""
    conn = open_db(db_path)
    if not conn:
        return []
    try:
        rows = conn.execute("""
            SELECT DISTINCT
                h.id AS handle_id,
                COUNT(m.ROWID) AS message_count
            FROM handle h
            LEFT JOIN message m ON m.handle_id = h.ROWID
            GROUP BY h.id
            ORDER BY message_count DESC
        """).fetchall()
        return [{"handle": row["handle_id"], "count": row["message_count"]} for row in rows]
    except Exception as e:
        print(f"读取 iMessage 联系人失败：{e}", file=sys.stderr)
        return []
    finally:
        conn.close()


def extract_imessage_messages(db_path: str, target_handle: str) -> list[dict]:
    """
    从 macOS iMessage chat.db 提取指定联系人的消息。

    chat.db 结构：
      - message 表：ROWID, text, is_from_me, date (Apple epoch), handle_id
      - handle 表：ROWID, id (phone/email)
      - chat_message_join / chat_handle_join：多对多关联

    Apple epoch = 秒数从 2001-01-01 起（比 Unix epoch 少 978307200 秒）
    """
    conn = open_db(db_path)
    if not conn:
        return []

    APPLE_EPOCH_OFFSET = 978307200  # 2001-01-01 00:00:00 UTC

    messages = []
    try:
        # 找到目标 handle 的 ROWID（支持模糊匹配）
        handle_rows = conn.execute(
            "SELECT ROWID, id FROM handle WHERE id LIKE ?",
            (f"%{target_handle}%",)
        ).fetchall()

        if not handle_rows:
            print(f"未找到联系人 '{target_handle}'，尝试模糊匹配...", file=sys.stderr)
            handle_rows = conn.execute("SELECT ROWID, id FROM handle").fetchall()
            handle_rows = [r for r in handle_rows if target_handle.lower() in r["id"].lower()]

        if not handle_rows:
            print(f"未找到 '{target_handle}'，使用 --list-contacts 查看所有联系人", file=sys.stderr)
            return []

        handle_ids = [r["ROWID"] for r in handle_rows]
        matched_handle = handle_rows[0]["id"]
        print(f"匹配到联系人：{matched_handle}（共 {len(handle_ids)} 个 handle）")

        placeholders = ",".join("?" * len(handle_ids))
        rows = conn.execute(f"""
            SELECT
                m.ROWID,
                m.text,
                m.is_from_me,
                m.date,
                m.date / 1000000000 AS date_sec,
                h.id AS handle_id
            FROM message m
            LEFT JOIN handle h ON h.ROWID = m.handle_id
            WHERE m.handle_id IN ({placeholders})
               OR (m.is_from_me = 1 AND m.ROWID IN (
                   SELECT message_id FROM chat_message_join
                   WHERE chat_id IN (
                       SELECT chat_id FROM chat_handle_join
                       WHERE handle_id IN ({placeholders})
                   )
               ))
            ORDER BY m.date ASC
        """, handle_ids + handle_ids).fetchall()

        for row in rows:
            text = row["text"] or ""
            if not text.strip():
                continue

            # 过滤系统消息（通常以特殊 unicode 字符开头）
            if text.startswith("\ufffc"):  # attachment placeholder
                continue

            # 计算时间戳
            raw_date = row["date"] or 0
            # iMessage date 在 iOS 11+ 是纳秒，早期是秒
            if raw_date > 1e12:
                unix_ts = raw_date / 1e9 + APPLE_EPOCH_OFFSET
            else:
                unix_ts = raw_date + APPLE_EPOCH_OFFSET

            try:
                timestamp = datetime.fromtimestamp(unix_ts).strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                timestamp = str(raw_date)

            messages.append({
                "sender": "me" if row["is_from_me"] else "them",
                "content": text.strip(),
                "timestamp": timestamp,
                "talker_wxid": row["handle_id"] or matched_handle,
            })

    except Exception as e:
        print(f"读取 iMessage 消息失败：{e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
    finally:
        conn.close()

    return messages


# ─── 消息分类 ──────────────────────────────────────────────────────────────────

CONFLICT_KEYWORDS = [
    # 中文
    "生气", "吵架", "分手", "算了", "随便", "不想说了", "烦", "你走",
    "不理你", "别找我", "不要了", "受够了", "够了", "不可能", "冷战",
    "对不起", "我错了", "不是那个意思", "误会", "委屈", "哭",
    # 英文（iMessage）
    "break up", "breakup", "i'm done", "we're done", "leave me alone",
    "i'm sorry", "sorry", "i was wrong", "stop texting", "don't text",
    "fighting", "argument", "upset", "angry", "hurt", "crying",
    "whatever", "fine", "nevermind", "forget it",
]

SWEET_KEYWORDS = [
    # 中文
    "想你", "喜欢你", "爱你", "宝", "亲爱的", "么么", "晚安",
    "早安", "吃了吗", "到家了吗", "在干嘛", "你在吗", "想见你",
    "好想", "心动", "开心", "幸福", "快乐",
    # 英文（iMessage）
    "miss you", "love you", "i love", "good morning", "good night",
    "thinking of you", "how are you", "are you okay", "cute", "sweet",
    "made me think of you", "can't stop thinking", "wanna see you",
]


def classify_messages(messages: list[dict], target_name: str = "them") -> dict:
    """将消息分类：长消息、冲突消息、甜蜜消息、日常消息"""
    # 只分析 TA 发的消息（sender == "them"）
    their_messages = [m for m in messages if m["sender"] == "them"]
    all_messages = messages  # 保留完整对话（包括你发的）

    long_msgs = []
    conflict_msgs = []
    sweet_msgs = []
    daily_msgs = []

    for msg in their_messages:
        content = msg["content"]

        if len(content) > 50:
            long_msgs.append(msg)
        elif any(kw in content for kw in CONFLICT_KEYWORDS):
            conflict_msgs.append(msg)
        elif any(kw in content for kw in SWEET_KEYWORDS):
            sweet_msgs.append(msg)
        else:
            daily_msgs.append(msg)

    return {
        "long_messages": long_msgs,
        "conflict_messages": conflict_msgs,
        "sweet_messages": sweet_msgs,
        "daily_messages": daily_msgs,
        "total_their_count": len(their_messages),
        "total_count": len(all_messages),
        "all_messages": all_messages,  # 完整对话（保留上下文用）
    }


def extract_conversation_threads(messages: list[dict], window_size: int = 10) -> list[list[dict]]:
    """
    提取有意义的对话片段（两人来回的连续消息）。
    用于分析冲突链和关系动态。
    """
    threads = []
    i = 0
    while i < len(messages):
        # 找到对话开始点（有来有回）
        chunk = messages[i : i + window_size]
        senders = set(m["sender"] for m in chunk)
        if len(senders) >= 2:  # 双向对话
            threads.append(chunk)
            i += window_size
        else:
            i += 1
    return threads


# ─── 输出格式化 ────────────────────────────────────────────────────────────────

def format_output(target_name: str, classified: dict, include_context: bool = True, source: str = "微信") -> str:
    """格式化输出供 AI 分析"""
    lines = [
        f"# {source}聊天记录提取结果",
        f"目标人物：{target_name}",
        f"TA 发送的消息数：{classified['total_their_count']}",
        f"对话总消息数：{classified['total_count']}",
        "",
        "---",
        "",
        "## 长消息（>50字，权重最高：观点/情绪/解释）",
        "",
    ]

    for msg in classified["long_messages"]:
        ts = f"[{msg['timestamp']}] " if msg.get("timestamp") else ""
        lines.append(f"{ts}{msg['content']}")
        lines.append("")

    lines += [
        "---",
        "",
        "## 冲突/情绪消息（争吵/道歉/分手/冷战相关）",
        "",
    ]

    for msg in classified["conflict_messages"]:
        ts = f"[{msg['timestamp']}] " if msg.get("timestamp") else ""
        lines.append(f"{ts}{msg['content']}")
        lines.append("")

    lines += [
        "---",
        "",
        "## 甜蜜消息（表白/想念/日常关心）",
        "",
    ]

    for msg in classified["sweet_messages"]:
        ts = f"[{msg['timestamp']}] " if msg.get("timestamp") else ""
        lines.append(f"{ts}{msg['content']}")
        lines.append("")

    lines += [
        "---",
        "",
        f"## 日常闲聊（风格参考，共 {len(classified['daily_messages'])} 条，全部输出）",
        "",
    ]

    for msg in classified["daily_messages"]:  # 不截断，全部输出
        ts = f"[{msg['timestamp']}] " if msg.get("timestamp") else ""
        lines.append(f"{ts}{msg['content']}")

    if include_context:
        all_msgs = classified["all_messages"]
        lines += [
            "",
            "---",
            "",
            f"## 完整对话（共 {len(all_msgs)} 条，按时间顺序，全部输出）",
            "（格式：[时间] 发送方: 内容）",
            "",
        ]
        for msg in all_msgs:  # 不截断，全部输出
            sender_label = target_name if msg["sender"] == "them" else "我"
            ts = f"[{msg['timestamp']}] " if msg.get("timestamp") else ""
            lines.append(f"{ts}{sender_label}: {msg['content']}")

    return "\n".join(lines)


def print_contact_list(contacts: list[dict], is_imessage: bool = False):
    """打印联系人列表"""
    if not contacts:
        print("未找到联系人数据")
        return
    if is_imessage:
        print(f"找到 {len(contacts)} 个 iMessage 联系人：\n")
        print(f"{'Handle (手机号/Apple ID)':<45} {'消息数':<10}")
        print("-" * 55)
        for c in contacts:
            print(f"{c['handle']:<45} {c['count']:<10}")
    else:
        print(f"找到 {len(contacts)} 个联系人：\n")
        print(f"{'微信ID':<30} {'备注名':<20} {'昵称':<20}")
        print("-" * 70)
        for c in contacts:
            print(f"{c['wxid']:<30} {c['remark']:<20} {c['nickname']:<20}")


# ─── 主程序 ───────────────────────────────────────────────────────────────────

def main():
    # Force UTF-8 stdout on Windows (handles emoji in contact names)
    if sys.stdout.encoding != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")
    if sys.stderr.encoding != "utf-8":
        sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        description="聊天记录解析器（微信 + iMessage）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例：
  # 微信 — 列出所有联系人
  python wechat_parser.py --db-dir ./decrypted/ --list-contacts

  # 微信 — 提取指定联系人消息
  python wechat_parser.py --db-dir ./decrypted/ --target "柳智敏" --output messages.txt

  # iMessage — 列出所有联系人（macOS）
  python wechat_parser.py --imessage --db ~/Library/Messages/chat.db --list-contacts

  # iMessage — 提取消息
  python wechat_parser.py --imessage --db ~/Library/Messages/chat.db \\
      --target "+1xxxxxxxxxx" --output messages.txt

  # 从文本导出解析（通用）
  python wechat_parser.py --txt ./chat.txt --target "柳智敏" --output messages.txt
        """
    )

    parser.add_argument("--imessage", action="store_true", help="使用 iMessage 模式（macOS chat.db）")
    parser.add_argument("--db-dir", help="解密后的微信数据库目录")
    parser.add_argument("--db", help="单个 .db 文件（微信或 iMessage）")
    parser.add_argument("--txt", help="手动导出的文本文件")
    parser.add_argument("--target", help="目标联系人名称（微信名/备注名，或 iMessage 手机号/Apple ID）")
    parser.add_argument("--output", default=None, help="输出文件路径（默认打印到 stdout）")
    parser.add_argument("--list-contacts", action="store_true", help="列出所有联系人")
    parser.add_argument("--no-context", action="store_true", help="不包含完整对话片段")
    parser.add_argument("--json", action="store_true", help="以 JSON 格式输出原始消息")
    parser.add_argument("--json-output", action="store_true", help="以 JSON 格式输出分类后的消息字典（供程序调用）")

    args = parser.parse_args()
    source_label = "iMessage" if args.imessage else "微信"

    # ── iMessage 模式 ──────────────────────────────────────────────────────────
    if args.imessage:
        if not args.db:
            # 默认路径
            default_path = Path.home() / "Library" / "Messages" / "chat.db"
            if default_path.exists():
                args.db = str(default_path)
                print(f"使用默认 iMessage 数据库：{args.db}")
            else:
                print("错误：未找到 iMessage 数据库，请用 --db 指定路径", file=sys.stderr)
                print("默认路径：~/Library/Messages/chat.db", file=sys.stderr)
                print("注意：需要在系统偏好设置中给终端授权「完全磁盘访问权限」", file=sys.stderr)
                sys.exit(1)

        if args.list_contacts:
            contacts = list_imessage_contacts(args.db)
            print_contact_list(contacts, is_imessage=True)
            return

        if not args.target:
            print("错误：请指定 --target（手机号或 Apple ID）", file=sys.stderr)
            sys.exit(1)

        print(f"从 iMessage 数据库提取：{args.db}")
        messages = extract_imessage_messages(args.db, args.target)

    # ── 微信模式 ───────────────────────────────────────────────────────────────
    else:
        # 列出联系人
        if args.list_contacts:
            if not args.db_dir:
                print("错误：--list-contacts 需要 --db-dir", file=sys.stderr)
                sys.exit(1)
            contacts = list_contacts(args.db_dir)
            if args.json_output:
                counts = count_messages_by_contact(args.db_dir)
                avatars = _load_avatars(args.db_dir)
                for c in contacts:
                    c["messageCount"] = counts.get(c["wxid"], 0)
                    if c["wxid"] in avatars:
                        c["avatar"] = avatars[c["wxid"]]
                # Filter out group chats (@chatroom) — only keep individual contacts
                contacts = [c for c in contacts if not c["wxid"].endswith("@chatroom")]
                # Contacts with messages first (sorted desc), then the rest
                with_msgs = sorted(
                    [c for c in contacts if c["messageCount"] > 0],
                    key=lambda x: x["messageCount"], reverse=True
                )
                no_msgs = [c for c in contacts if c["messageCount"] == 0][:50]
                print(json.dumps({"contacts": with_msgs + no_msgs}, ensure_ascii=False))
            else:
                print_contact_list(contacts, is_imessage=False)
            return

        if not args.target:
            print("错误：请指定 --target（目标联系人名称）", file=sys.stderr)
            sys.exit(1)

        messages = []

        if args.txt:
            print(f"从文本文件解析：{args.txt}")
            messages = parse_txt_export(args.txt, args.target)

        elif args.db:
            print(f"从单个数据库解析：{args.db}")
            target_wxid = find_contact_wxid(args.db_dir, args.target) if args.db_dir else None
            messages = extract_messages_from_db(args.db, target_wxid)

        elif args.db_dir:
            target_wxid = find_contact_wxid(args.db_dir, args.target)
            if target_wxid:
                print(f"找到联系人 wxid：{target_wxid}", file=sys.stderr)
            else:
                print(f"警告：未找到 '{args.target}' 的精确匹配", file=sys.stderr)
            print(f"从目录解析：{args.db_dir}", file=sys.stderr)
            messages = extract_messages_from_dir(args.db_dir, target_wxid)

        else:
            print("错误：请指定 --db-dir 或 --db 或 --txt（或加 --imessage 使用 iMessage 模式）", file=sys.stderr)
            sys.exit(1)

    target_name = args.target

    if not messages:
        print(f"警告：未找到消息", file=sys.stderr)
        if not args.imessage and args.db_dir:
            print("提示：", file=sys.stderr)
            print("  1. 运行 --list-contacts 查看所有联系人的精确名称", file=sys.stderr)
            print("  2. 确认数据库已正确解密（运行 wechat_decryptor.py）", file=sys.stderr)
        sys.exit(1)

    their_count = sum(1 for m in messages if m["sender"] == "them")
    print(f"\n提取完成：共 {len(messages)} 条消息，其中 TA 发出 {their_count} 条", file=sys.stderr)

    if their_count < 200:
        print(f"⚠️  警告：TA 的消息只有 {their_count} 条，样本偏少，生成的人格可信度较低", file=sys.stderr)

    # 输出
    if args.json_output:
        # Structured JSON output for programmatic consumption
        classified = classify_messages(messages, target_name)
        result = {
            "long_messages": classified.get("long_messages", []),
            "conflict_messages": classified.get("conflict_messages", []),
            "sweet_messages": classified.get("sweet_messages", []),
            "daily_messages": classified.get("daily_messages", []),
            "all_messages": classified.get("all_messages", []),
            "total_their_count": their_count,
            "total_count": len(messages),
            "target_name": target_name,
            "source": source_label,
        }
        print(json.dumps(result, ensure_ascii=False))
    elif args.json:
        output_content = json.dumps(messages, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output_content)
            print(f"已输出到：{args.output}")
        else:
            print(output_content)
    else:
        classified = classify_messages(messages, target_name)
        output_content = format_output(target_name, classified, include_context=not args.no_context, source=source_label)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output_content)
            print(f"已输出到：{args.output}")
        else:
            print(output_content)


if __name__ == "__main__":
    main()
