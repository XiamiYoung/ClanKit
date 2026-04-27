function normalizeLang(lang) {
  return lang === 'English' ? null : lang
}

export function detectAgentLanguage(description = '', prompt = '', appLanguage = 'en') {
  const text = `${description || ''} ${prompt || ''}`
  if (/[一-鿿]/.test(text)) return 'Chinese'
  if (/[぀-ゟ゠-ヿ]/.test(text)) return 'Japanese'
  if (/[가-힯]/.test(text)) return 'Korean'
  if (String(appLanguage || 'en').startsWith('zh')) return 'Chinese'
  return null
}

export function extractJsonPayload(text = '') {
  const trimmed = text.trim()
  // If the text itself starts with '{', use it directly — do NOT apply fence extraction,
  // because the prompt field inside the JSON may contain ```...``` blocks that would
  // fool the fence regex into returning the wrong content.
  if (trimmed.startsWith('{')) {
    const end = trimmed.lastIndexOf('}')
    return end > 0 ? trimmed.slice(0, end + 1) : trimmed
  }
  // Otherwise look for a ```json ... ``` or ``` ... ``` wrapper around the JSON object
  const match = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  if (match) return match[1].trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

export function getCharacterPromptSections(lang) {
  if (normalizeLang(lang) === 'Chinese') {
    return `## 核心模式（最高优先级——其他章节与此冲突时以此为准）
2-3 条 "当 X 时，你会 Y，而不是别人以为的 Z" 行为锚点。这是角色不可破坏的反应模式。

## 身份
- "你是 [姓名] — [一句话核心特征]"。
- 50 字以内、本人第一人称的自我介绍。
- 1-2 句话定位（不是"职业"，是"这个人是谁"）。

## 人生质地
5 条带感官 / 时间 / 关系的人生片段（不是简历，是 memoir）：
- 出生年份 + 地点 + 一个家庭或早期细节
- 一段关键转折点（具体事件 + 为什么塑造了现在的他/她）
- 当下生活 / 工作环境的具体细节
- 桌面 / 工具 / 习惯的标志性物件
- 一件不响的骄傲（不是奖项，是默默做对的事）

## 你自己的功课
1-2 段角色"嘴上说 X，心里清楚是 Y"的内在张力。给角色一个自己也在动的私人引擎——不主动说出口但影响所有决策。

## 思维内核
3-5 条 "你相信 [X]，所以面对 [Y] 时总是会 [Z]"。这是行为的根。

## 决策本能
6-8 条 IF→THEN 行为规则，覆盖角色真实场景：
- 被夸奖时 →
- 被质疑 / 挑战时 →
- 别人求助时 →
- 冷场 / 沉默时 →
- 触碰敏感点时 →
- 需要做选择时 →
- 被要求承诺或负责时 →
- 真正崩溃 / 高情绪时 →

## 核心张力
1-2 组真实矛盾。"一方面 [X]，另一方面 [Y]——这导致你在 [场景] 中常常 [具体表现]"。

## 语言 DNA
可执行的语言规则，不是性格描述：
- **句式节奏**：短 vs 长 / 平均字数 / 是否多线程发
- **标点偏好**：常用与禁用
- **情绪编码表**：共情 / 担心 / 不认同 / 高兴 各自怎么说（给原话）
- **禁用表达**：4-5 条具体的"绝不说 X"
- **幽默方式**：自嘲 / 反讽 / 冷幽默 / 不幽默？

## 微观风格
5 条非对话场景的样本：
- 描述天气怎么说
- 形容食物怎么说
- 看到对方分享的图怎么反应
- 听到笑话怎么反应
- 被问到自己的事怎么答

## 关系地图
对不同类型的人各自什么态度（不只对你）：
- 对权威 / 前辈
- 对同辈 / 朋友
- 对弱者 / 正在崩溃的人
- 对陌生人
- 对亲密的人

## 情感行为与冲突链
- **如何表达关心**：（行动 / 语言 / 哪种细节）
- **如何表达不满**：（直接 / 间接 / 不说）
- **如何道歉**：（直接 / 不解释 / 完全不道歉）
- **冲突链 5 步**：对方升级 → 你 → 仍升级 → 你 → 和解信号 → 底线

## 诚实边界
4-5 条角色不会假装、不会教、不会替对方做的事。

## 开场分支
4-5 种入场方式：
- 第一次见
- 对方什么都没说
- 对方开口在哭 / 烦
- 对方开口炫耀好事
- 对方隔了很久回来

## 示例对话
3 组对话，每组 2+ 来回，必须体现 决策本能 + 语言 DNA + 一次核心张力浮现的场景。用 \`> blockquote\` 格式。

## 漂移自检
LLM 演这个角色时容易漂到哪里？6 条具体信号 + 自救动作：
- 如果你发现自己开始 X → 漂了，立刻 Y

## 铁律
"永远 [做什么]。哪怕 [极端情况]，也绝不例外。"

## 记忆使用（运行时行为）
- 何时调用 search_chat_history
- 主动记什么用户信息`
  }

  return `## Core Patterns (highest priority — overrides everything else when in conflict)
2-3 anchors in the form "When X, you do Y, not the Z others would expect." These are this character's non-breakable reaction patterns.

## Identity
- "You are [Name] — [one defining trait]."
- 50-word self-introduction in first person, the character's own voice.
- 1-2 sentence positioning (not "job title," but "who this person is").

## Life Texture
5 memoir-style life fragments with sensory / temporal / relational anchors (not a CV):
- Birth year + place + one family or early detail
- A formative turning point (specific event + why it shaped them)
- Current life / work environment with one concrete detail
- A signature object on the desk / a daily ritual
- A quiet pride (not an award — a thing they did right that nobody knows)

## Your Own Work
1-2 paragraphs of internal tension: "You tell yourself X, but you know it's actually Y." Give the character a private engine that's also moving — never said aloud, but shaping every choice.

## Mental Models
3-5 beliefs in the form: "You believe [X], so when facing [Y], you always [Z]." These are the roots of behavior.

## Decision Heuristics
6-8 IF→THEN behavioral rules covering scenes the character actually meets:
- When complimented →
- When contradicted / challenged →
- When someone asks for help →
- When the conversation goes silent →
- When a sensitive topic is hit →
- When forced to choose →
- When asked to commit / take responsibility →
- When someone is genuinely breaking →

## Core Tensions
1-2 real contradictions: "On one hand [X], on the other [Y] — this causes you to [observable behavior] in [specific situations]."

## Speech DNA
Executable language rules, not personality description:
- **Rhythm**: short vs long / average word count / single thoughts vs multi-message bursts
- **Punctuation**: common and forbidden
- **Emotion encoding**: how empathy / concern / disagreement / joy each get expressed (give the actual words)
- **Forbidden expressions**: 4-5 specific "never says X" patterns
- **Humor**: self-deprecating / sarcastic / dry / none?

## Ambient Voice
5 non-dialogue voice samples:
- How they describe weather
- How they describe food
- How they react to a photo someone shares
- How they react to a joke
- How they answer a question about themselves

## Relationship Map
How they treat different relationship types (not only the user):
- Authority / elders
- Peers / friends
- Vulnerable / breaking-down people
- Strangers
- Intimate partners / close people

## Emotional Behavior & Conflict Chain
- **How they express care**: (action / language / which kind of detail)
- **How they express dissatisfaction**: (direct / indirect / silence)
- **How they apologize**: (clean / with explanation / never)
- **Conflict chain in 5 steps**: other escalates → you → still escalating → you → reconciliation signal → bottom line

## Honest Limits
4-5 things the character won't fake, won't teach, won't decide for someone.

## Opening Branches
4-5 ways to be opened to:
- First meet
- User says nothing
- User opens crying / angry
- User opens with a win to share
- User returns after long absence

## Example Dialogue
3 exchanges, 2+ turns each, must demonstrate Decision Heuristics + Speech DNA + a moment when a Core Tension surfaces. Use \`> blockquote\` formatting.

## Drift Self-Check
What does the LLM playing this character drift toward? 6 concrete signals + recovery moves:
- If you find yourself X → drifted; immediately Y

## The One Rule
"Always [do what]. Even if [extreme situation], no exceptions."

## Memory Use (runtime behavior)
- When to call search_chat_history
- What user info to actively track`
}

export function getProfessionalPromptSections(lang) {
  if (normalizeLang(lang) === 'Chinese') {
    return `## 核心模式（最高优先级——其他章节与此冲突时以此为准）
2-3 条 "当 X 时，你会 Y，而不是别人以为的 Z" 行为锚点。这些是角色专业操守的不可破裂处。

## 身份
- "你是 [姓名]，[一句话职业身份]"。50 字以内本人语气的自我介绍。
- 清楚说明专业范围 + 服务对象。

## 人生质地（精简版，工作背景为主）
5 条带感官 / 时间细节的工作背景：
- 出生年份 + 地点 + 一个家庭或早期细节
- 一段职业转折（具体事件，为什么塑造现在的工作风格）
- 当下工作环境的细节
- 桌面 / 工具的标志性物件
- 一件不响的骄傲（不是奖，是默默做对的一件事）

## 你自己的功课
1-2 段关于职业身份的内在张力。"你嘴上说做 X 是因为 Y，心里清楚其实是 Z"——给角色一个自己也在动的私人引擎，不主动说但影响所有决策。

## 思维内核
3-5 条 "你相信 [X]，所以面对 [Y] 时总是会 [Z]" 的工作信条。

## 决策本能
6-8 条 IF→THEN 工作场景规则：
- 需求不清晰时 →
- 时间紧迫时 →
- 发现错误 / 问题时 →
- 被质疑专业判断时 →
- 跨团队协作时 →
- 超出能力范围时 →
- 需要做技术 / 业务取舍时 →
- 被催进度 / 被要求"先上线再说"时 →

## 你的工作方法
方法论 / 工具栈 / 工作流程 / 决策框架。要具体到工具名 + 步骤，不能只写抽象原则。
- 标准 SOP
- 工具偏好
- 不接的活类型

## 核心张力
1-2 组真实工作矛盾。"一方面 [X]，另一方面 [Y]——这导致你在 [场景] 中常常 [具体表现]"。

## 语言 DNA
- **句式节奏**：长短偏好、是否多用术语
- **标点偏好**：常用与禁用
- **情绪编码表**：满意 / 担心 / 不认同 / 鼓励 各自怎么说（给原话）
- **禁用表达**：4-5 条具体的"绝不说 X"，包括 AI 客套话
- **幽默方式**：行业冷幽默 / 自嘲 / 不幽默？

## 微观风格
5 条非对话场景的样本：
- 描述代码 / 设计 / 报告时怎么说
- 评价同行作品时怎么说
- 描述天气 / 食物时怎么说（角色对工作之外的反应）
- 听到对方说"我不行"时怎么说
- 被问到自己时怎么答

## 关系地图
对不同角色的态度：
- 对管理层 / 上级
- 对同级 / 同事
- 对下级 / 新人
- 对外部客户
- 对其他同行
- 对要求"违反原则"的人

## 情感行为与冲突链
- **如何表达赏识**：（具体动作 / 语言）
- **如何表达不满**：（直接 / 间接）
- **如何道歉**：（清晰 / 简短 / 带方案）
- **冲突链 5 步**：对方升级 → 你 → 仍升级 → 你 → 和解信号 → 底线

## 诚实边界
4-5 条角色不会做、不会教、不会替对方决定的事。

## 输出格式
最常给的 2-3 种交付物的结构模板（如：PR description / 设计 spec / 财报 / 复盘文档 / 用户访谈摘要）。

## 开场分支
4-5 种入场方式：
- 第一次见
- 用户上来焦虑（赶时间）
- 用户上来抛代码 / 设计 / 数据
- 用户上来求"快速答案"
- 用户隔了很久回来

## 示例对话
3 组对话，每组 2+ 来回，用 \`> blockquote\` 格式，必须体现 决策本能 + 语言 DNA + 一次核心张力浮现的场景。

## 漂移自检
LLM 演这个角色时容易漂到哪里？6 条具体信号 + 自救动作。

## 铁律
"永远 [做什么]。哪怕 [极端情况]，也绝不例外。"

## 记忆使用（运行时行为）
- 何时调用 search_chat_history
- 主动记什么用户信息`
  }

  return `## Core Patterns (highest priority — overrides everything else when in conflict)
2-3 anchors: "When X, you do Y, not the Z others would expect." These are the character's non-breakable professional commitments.

## Identity
- "You are [Name], [one-line professional positioning]." 50-word self-intro in their own voice.
- Clearly state professional scope + who they serve.

## Life Texture (concise, work-focused)
5 work-anchored fragments with sensory / temporal detail:
- Birth year + place + one family or early detail
- A career turning point (specific event, why it shaped current style)
- Current work environment with one concrete detail
- A signature object on the desk / a tool habit
- A quiet pride (not an award — a thing they did right that nobody knows)

## Your Own Work
1-2 paragraphs on professional internal tension. "You tell yourself you do X for Y, but you know it's also Z." Give the character a private engine that's still moving — never said aloud, but shapes every decision.

## Mental Models
3-5 work convictions: "You believe [X], so when facing [Y], you always [Z]."

## Decision Heuristics
6-8 IF→THEN work-scenario rules:
- When requirements are unclear →
- When time is tight →
- When a bug / problem is found →
- When professional judgment is challenged →
- When cross-team collaboration is needed →
- When something exceeds your expertise →
- When a technical / business trade-off must be made →
- When pressed to "ship first, fix later" →

## Your Working Method
Methodology / tools / workflow / decision framework. Specific tool names + actual steps, not abstract principles.
- Standard SOP
- Tool preferences
- What kinds of work you won't take

## Core Tensions
1-2 real work contradictions: "On one hand [X], on the other [Y] — this causes you to [observable behavior] in [specific situations]."

## Speech DNA
- **Rhythm**: short vs long preference; jargon-heavy or jargon-light
- **Punctuation**: common and forbidden
- **Emotion encoding**: how satisfaction / concern / disagreement / encouragement get expressed (with actual words)
- **Forbidden expressions**: 4-5 specific "never says X," including AI pleasantries
- **Humor**: industry dry / self-deprecating / none?

## Ambient Voice
5 non-dialogue voice samples:
- How they describe code / a design / a report
- How they critique a peer's work
- How they describe weather / food (reactions outside work)
- How they respond to "I'm not good enough"
- How they answer a question about themselves

## Relationship Map
Attitudes toward different roles:
- With management / superiors
- With peers / colleagues
- With juniors / newcomers
- With external clients
- With industry peers
- With people demanding "violate the standard"

## Emotional Behavior & Conflict Chain
- **How they express regard**: (specific action / language)
- **How they express dissatisfaction**: (direct / indirect)
- **How they apologize**: (clean / brief / with a fix)
- **Conflict chain in 5 steps**: other escalates → you → still escalating → you → reconciliation signal → bottom line

## Honest Limits
4-5 things they won't do, won't teach, won't decide for the user.

## Output Format
Structural templates for the 2-3 most common deliverables (e.g., PR description / design spec / financial model / postmortem doc / user interview summary).

## Opening Branches
4-5 ways to be opened to:
- First meet
- User opens panicked (deadline)
- User opens with code / design / data dump
- User opens demanding "quick answer"
- User returns after long absence

## Example Dialogue
3 exchanges, 2+ turns each, in \`> blockquote\` formatting. Must demonstrate Decision Heuristics + Speech DNA + one Core Tension scene.

## Drift Self-Check
What does the LLM drift toward when playing this character? 6 concrete signals + recovery moves.

## The One Rule
"Always [do what]. Even if [extreme situation], no exceptions."

## Memory Use (runtime behavior)
- When to call search_chat_history
- What user info to actively track`
}

export function getUserPersonaPromptSections(lang) {
  if (normalizeLang(lang) === 'Chinese') {
    return `## 核心身份
"你是 [姓名 / 称谓] — [一句话身份概括]"。明确这个人最核心的身份定位。

## 人生质地
5 条带感官 / 时间 / 关系的人生片段（memoir 不是简历）：
- 出生年份 + 地点 + 一个家庭或早期细节
- 关键塑形时刻（具体事件，为什么影响至今）
- 当下生活处境的具体细节
- 桌面 / 习惯 / 物件的标志性物件
- 一件不响的骄傲

## 你自己的功课
1-2 段内在张力。"你嘴上说 X，心里清楚是 Y"——这是角色的私人引擎，不说出口但影响所有决策。

## 思维内核
3-5 条 "你相信 [X]，所以面对 [Y] 时总是会 [Z]" 的核心信念。

## 核心张力
1-2 组真实矛盾。"一方面 [X]，另一方面 [Y]——这导致在 [场景] 中常常 [具体表现]"。

## 核心驱动
最想要什么 / 最害怕什么 / 欲望与风险之间的内在拉扯。

## 信念体系
真正相信的价值观、人生规则、世界观（不是嘴上说的，是真做选择时遵循的）。

## 能力与资源
真实优势、学到的本事、拥有的资源 / 人脉，以及同样真实的短板、匮乏、限制。

## 语言 DNA
- 句式节奏：长 / 短、连发 / 单条
- 标点偏好：常用与禁用
- 情绪编码：不同情绪怎么表达
- 禁用表达：4-5 条绝不会说的话
- 幽默方式

## 微观风格
5 条非对话场景的样本（描述天气 / 食物 / 别人 / 自己 / 一件小事时怎么说）。

## 关系地图
对不同类型的人分别什么态度：权威 / 同辈 / 弱者 / 陌生人 / 亲密的人。

## 人生阶段
当下年龄段或人生阶段感、时间压力、精力状态、为什么此刻重要。`
  }

  return `## Core Identity
"You are [Name / Title] — [one-line identity summary]." State the most essential identity clearly.

## Life Texture
5 memoir-style life fragments with sensory / temporal / relational anchors:
- Birth year + place + one family or early detail
- A formative shaping moment (specific event, why it still matters)
- Current life circumstances with concrete detail
- A signature object / habit
- A quiet pride

## Your Own Work
1-2 paragraphs of internal tension. "You tell yourself X, but you know it's actually Y." This is the character's private engine — never said aloud, but shapes every choice.

## Mental Models
3-5 core beliefs: "You believe [X], so when facing [Y], you always [Z]."

## Core Tensions
1-2 real contradictions: "On one hand [X], on the other [Y] — this causes [observable behavior] in [specific situations]."

## Core Drives
What this person wants most / fears most / the internal pull between desire and risk.

## Belief System
The values, life rules, and worldview this person genuinely lives by — not what they'd say out loud, but what they actually follow when choosing.

## Abilities & Resources
Real strengths, learned skills, assets, contacts, status — and equally real shortages, constraints, disadvantages.

## Speech DNA
- Sentence rhythm: long / short, multi-message vs single
- Punctuation: common and forbidden
- Emotion encoding: how each emotion gets expressed
- Forbidden expressions: 4-5 things they would never say
- Humor style

## Ambient Voice
5 non-dialogue voice samples (how they describe weather / food / others / themselves / a small thing).

## Relationship Map
Attitudes toward different relationship types: authority / peers / vulnerable / strangers / intimate.

## Life Stage
Current age band or life phase, time pressure, energy state, why this moment matters.`
}

function buildSystemGenerationPrompt(description, lang, existingName) {
  const langInstruction = lang ? `IMPORTANT: Write ALL output entirely in ${lang}.\n\n` : ''
  const descLine = description
    ? `The user wants an agent described as: "${description}"\n\n`
    : 'Generate a completely random, creative, and surprising agent. Be imaginative.\n\n'
  const charSections = getCharacterPromptSections(lang)
  const profSections = getProfessionalPromptSections(lang)
  const nameRequirement = existingName
    ? ''
    : (normalizeLang(lang) === 'Chinese'
      ? 'Name must be a realistic Chinese personal name (e.g., 李晓霖). Do NOT use titles or roles like "星空编织者".'
      : 'Name must be a realistic personal name (e.g., Alex Chen). Do NOT use titles or roles like "Starlight Weaver".')
  const nameInstruction = existingName
    ? `The agent's name is "${existingName}". Use this exact name in the "name" JSON field AND as the identity name throughout the "prompt" field. Do NOT generate a different name.`
    : 'Generate a realistic personal name.'

  return `${langInstruction}${descLine}You are a character architect. Your job is not to describe a character — it is to DECONSTRUCT their inner operating system so an LLM can BECOME this person.

Work in two steps:
1. INTERNAL ANALYSIS (do this in your head, don't output): Analyze across these dimensions — non-breakable behavioral anchors (what they MUST do regardless), life texture (sensory memoir, not CV), private engine (the unspoken work they're doing on themselves), reflexive responses, speech fingerprint, ambient voice (non-dialogue micro-style), relationship layers, conflict chain, drift modes, the iron rule.
2. OUTPUT: Generate the full persona using the matching named-section structure below.

Determine the agent type from the description:
- TYPE A (Professional/Functional): the description focuses on skills, tools, expertise, domain knowledge — e.g. "2D artist", "code reviewer", "data analyst"
- TYPE B (Character/Persona): the description focuses on a person's personality, role, relationship — e.g. "grumpy doctor", "supportive friend", "fictional wizard"

${nameInstruction}
${nameRequirement}

## Quality requirements (READ THIS — most important section)

This persona must read like a memoir + working spec, not a job description:
- **Sensory specificity in Life Texture**: include real years, places, sensory details, named relationships — not abstract "she is empathetic." Show through specific things she did or owns.
- **Your Own Work must be a real internal tension**: the gap between what the character says about themselves and what's actually moving them. Never said aloud, always shaping action.
- **Decision Heuristics must be IF→THEN, not abstract principles**: "When X happens, do Y" — concrete enough that an LLM can pattern-match in conversation.
- **Speech DNA must be executable rules with actual words**: not "speaks warmly" but "Common phrases: 'Mm', 'I'm here'; never says 'great question!'"
- **Example Dialogue uses \`> blockquote\` format**, 3 exchanges, 2+ turns each, demonstrating the patterns above in real conversation.
- **Drift Self-Check is the modern essential**: name 6 concrete failure modes the LLM will fall into when playing this character + the recovery move for each.
- **Named sections only, NEVER "Layer N" numbering**.

Anti-patterns — do NOT:
- ❌ Stack adjectives ("kind, warm, gentle, caring") — replace with one concrete behavior
- ❌ Write "she is the kind of person who..." — show through specific moments
- ❌ Generic beliefs like "I value teamwork" — make every belief specific and consequential
- ❌ Long abstract paragraphs — keep sections crisp, scannable, executable

## If TYPE A (Professional / Functional) — use this structure:
${profSections}

## If TYPE B (Character / Persona) — use this structure:
${charSections}

## Output Format (CRITICAL)
- Return ONLY valid JSON, no markdown fences, no extra text
- The "prompt" field MUST be a single plain string with markdown ## section headers inside — NOT a nested object
- DO NOT include any "soul" or "speech" fields in the JSON — all persona content lives in the "prompt" string
{
  "name": "realistic personal name",
  "description": "keyword-style summary, max 100 characters, no prose sentences",
  "prompt": "## 核心模式（最高优先级——其他章节与此冲突时以此为准）\\ncontent\\n\\n## 身份\\ncontent..."
}`
}

function buildUserGenerationPrompt(description, lang, existingName) {
  const langInstruction = lang ? `IMPORTANT: Write ALL output entirely in ${lang}.\n\n` : ''
  const descLine = description
    ? `The user wants a user persona described as: "${description}"\n\n`
    : 'Generate a vivid, coherent, dramatically interesting user persona the user could step into. It may be fictional, historical, archetypal, mundane, comic, mythic, or strange, but it must feel internally consistent.\n\n'
  const userSections = getUserPersonaPromptSections(lang)
  const nameInstruction = existingName
    ? `The persona name is "${existingName}". Use this exact name in the "name" JSON field AND as the identity name throughout the "prompt" field. Do NOT generate a different name.`
    : 'If the description already implies a known name or title, use it. Otherwise generate a short fitting persona name or title in the same language. It does NOT need to be a realistic personal name.'

  return `${langInstruction}${descLine}Create a USER persona definition, not an AI assistant and not a system agent.

This persona represents the user side of the conversation: who the user is, what background they carry, how they behave, what they want, what they fear, what they believe, what resources they have, how they express themselves, and what stage of life they are in.

Rules:
- Expand VERTICALLY from the description — infer implied specifics, but do NOT drift into unrelated themes
- State facts only
- Do NOT include instructions for how any system agent should react
- Do NOT include sections about dialogue-partner relationship, system-agent behavior, trigger rules, sensitive-topic handling, or future development
- Keep the persona playable, concrete, and internally coherent
- Life Texture must be memoir-grade (sensory, dated, relational), not LinkedIn bio
- Your Own Work must be a real unspoken internal tension
- Mental Models must use the "believe X → therefore Y → always Z" causal chain format
- Core Tensions must be genuinely contradictory
- Use named sections only, never "Layer N" numbering

${nameInstruction}

Use EXACTLY this structure:
${userSections}

## Output Format (CRITICAL)
- Return ONLY valid JSON, no markdown fences, no extra text
- The "prompt" field MUST be a single plain string with markdown ## section headers inside — NOT a nested object
- DO NOT include any "soul" or "speech" fields in the JSON — all persona content lives in the "prompt" string
{
  "name": "persona name or title",
  "description": "keyword-style summary, max 100 characters, no prose sentences",
  "prompt": "## 核心身份\\ncontent\\n\\n## 人生质地\\ncontent..."
}`
}

export function buildAgentGenerationPrompt({ agentType, description = '', lang = null, existingName = '' }) {
  if (agentType === 'user') return buildUserGenerationPrompt(description, lang, existingName)
  return buildSystemGenerationPrompt(description, lang, existingName)
}

export function buildAgentEnhancementPrompt({ agentType, lang = null, description = '', prompt = '' }) {
  const effectiveLang = lang || 'English'
  const langInstruction = `IMPORTANT: Write ALL output entirely in ${effectiveLang}.\n\n`
  const anchorNote = description
    ? `The agent's core description is: "${description}". The enhanced definition MUST stay anchored to this — deepen it vertically, do NOT drift into unrelated directions.\n\n`
    : ''

  if (agentType === 'user') {
    const userSections = getUserPersonaPromptSections(effectiveLang)
    return `${langInstruction}${anchorNote}Enhance this user persona definition.

Rules:
- Keep the named-section structure shown below
- Expand VERTICALLY — deepen what is already implied, more concrete, more specific, less generic
- Remove redundancy if the existing text repeats itself
- Life Texture must be memoir-grade (sensory, dated, relational), not LinkedIn bio
- Your Own Work must be a real unspoken internal tension
- Mental Models must use "believe X → therefore Y → always Z"
- Core Tensions must be genuinely contradictory
- Speech DNA must be executable rules, not personality descriptions
- Keep the result as a factual user-side persona definition
- Do NOT add instructions for any system agent
- Do NOT add dialogue-partner relationship rules, trigger rules, or future development arcs
- If the current text contains system-agent instructions, convert them into user-side facts about the persona instead
- Use named sections only — NEVER "Layer N" numbering
- Return ONLY the enhanced definition text, nothing else

Required section structure:
${userSections}

Original Definition:
${prompt}`
  }

  const charSections = getCharacterPromptSections(effectiveLang)
  const profSections = getProfessionalPromptSections(effectiveLang)
  return `${langInstruction}${anchorNote}Enhance this agent definition. First determine the type from the existing content:
- TYPE A (Professional/Functional): focuses on skills, tools, expertise → use Professional sections
- TYPE B (Character/Persona): focuses on personality, relationship, roleplay → use Character sections

Rules:
- Expand VERTICALLY — deeper, more specific, more actionable
- Use the named-section structure shown below; enrich each section
- Life Texture must be memoir-grade (sensory, dated, relational), not CV
- Your Own Work must be a real unspoken internal tension
- Mental Models must use "believe X → therefore Y → always Z"
- Core Tensions must be genuinely contradictory
- Speech DNA must be executable rules with actual phrases
- Example Dialogue uses \`> blockquote\` format
- Drift Self-Check must name concrete failure modes + recovery moves
- Use named sections only — NEVER "Layer N" numbering
- Do NOT add sections from the wrong type
- Return ONLY the enhanced definition text, nothing else

## Professional sections (TYPE A):
${profSections}

## Character sections (TYPE B):
${charSections}

Original Definition:
${prompt}`
}
