# Database Choice: DynamoDB + Supporting Services

## Why DynamoDB (Primary) — Not RDS

### Arguments FOR DynamoDB:
1. **Access patterns are key-value / key-range** — Every query is "get by PK" or "list by PK + filter/sort by SK"
2. **No complex joins needed** — Personas reference toolIds[] as arrays; resolution is done application-side (or via BatchGetItem)
3. **Variable schema** — Tools have 3 different shapes (HTTP, code snippet, prompt template); DynamoDB handles this natively
4. **Scale characteristics** — 4000 users × ~50 chats/user × ~100 messages/chat = 20M messages. DynamoDB handles this without provisioning headaches
5. **Soul memory is document-shaped** — Sections, entries, free-form text. Perfect for DynamoDB's document model
6. **Cost at this scale** — On-demand pricing for bursty reads, provisioned for predictable patterns. Much cheaper than RDS for this access pattern
7. **Operational simplicity** — No connection pooling, no read replicas to manage, no maintenance windows

### Arguments AGAINST RDS:
1. **Connection limits** — 4000 users would require connection pooling (RDS Proxy), adds complexity and cost
2. **Schema rigidity** — Tools/personas have variable shapes; would need JSONB columns anyway (defeating the purpose of relational)
3. **Overkill** — We never do: cross-table joins, aggregation queries, or complex WHERE clauses in the hot path
4. **Cost** — db.r6g.xlarge Multi-AZ ≈ $700/mo + storage + RDS Proxy ≈ $200/mo. DynamoDB on-demand will be less (see cost section)

### Where DynamoDB falls short (and our mitigation):
| Gap | Solution |
|-----|----------|
| Full-text search on chats | OpenSearch Serverless (async indexing via DynamoDB Streams) |
| Analytics / reporting | DynamoDB → S3 export → Athena |
| Complex RBAC queries | Small RDS/Aurora Serverless v2 for IAM/RBAC tables OR DynamoDB with GSIs |
| Audit log querying | DynamoDB Streams → Kinesis → S3 → Athena |

## Final Architecture:
- **DynamoDB** — All operational data (single-table design with overflow tables for chat messages)
- **AWS Secrets Manager** — All API keys and MCP server credentials
- **S3** — Knowledge documents, skill file content, chat exports
- **OpenSearch Serverless** — Chat search (Phase 2)
- **DynamoDB Streams + EventBridge** — Audit trail pipeline
