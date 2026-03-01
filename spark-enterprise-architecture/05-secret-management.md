# Secret Management Architecture

## Principle: NO secrets in DynamoDB. Ever.

All API keys, tokens, and credentials are stored in AWS Secrets Manager.
DynamoDB only stores the `secretArn` reference.

## Secret Hierarchy

```
spark/
├── tenant/{tenantId}/
│   ├── shared/                          # Tenant-wide shared secrets (if any)
│   │   └── pinecone-api-key             # Shared knowledge base
│   └── users/{userId}/
│       ├── provider-keys                 # User's LLM provider API keys
│       ├── tools/
│       │   ├── {toolId}                  # User's credentials for each tool
│       │   └── ...
│       └── mcp/
│           ├── {mcpServerId}            # User's env secrets for each MCP server
│           └── ...
```

## Secret Structures

### User Provider Keys
**Path**: `spark/tenant/t_acme/users/u_abc123/provider-keys`
```json
{
  "anthropic_api_key": "sk-ant-...",
  "openrouter_api_key": "sk-or-...",
  "openai_api_key": "sk-..."
}
```

### User Tool Credentials
**Path**: `spark/tenant/t_acme/users/u_abc123/tools/tl_jira`
```json
{
  "JIRA_API_TOKEN": "ATATT3xF...",
  "JIRA_USER_EMAIL": "user@acme.com"
}
```

### User MCP Server Credentials
**Path**: `spark/tenant/t_acme/users/u_abc123/mcp/mcp_github`
```json
{
  "GITHUB_TOKEN": "ghp_xxxx...",
  "GITHUB_ORG": "acme-corp"
}
```

## Access Patterns

### Writing Secrets (User configures their keys)
```
Client → API Gateway → Lambda → Secrets Manager
                                      │
                                 CreateSecret / UpdateSecret
                                      │
                                 Returns secretArn
                                      │
                              Lambda → DynamoDB (store secretArn reference)
```

### Reading Secrets (Runtime: executing a tool or MCP)
```
Chat Lambda needs to call Jira tool:
  1. Read tool config from DynamoDB (get secretArn)
  2. Read user's tool credentials from Secrets Manager
  3. Merge: tool template (DynamoDB) + credentials (SM)
  4. Execute HTTP call
  5. Credentials NEVER logged, NEVER cached beyond request
```

### MCP Server Startup
```
Need to start GitHub MCP for user:
  1. Read MCP catalog config from DynamoDB (command, args, requiredEnvVars)
  2. Read user's MCP credentials from Secrets Manager
  3. Build env{} = catalog non-secret env + user secret env
  4. Spawn MCP process with env{}
  5. Credentials passed as env vars to process (standard MCP pattern)
  6. On process end, env vars are gone
```

## Secrets Manager Configuration

### Resource Policy (Tenant Isolation)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TenantIsolation",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::role/SparkAppRole" },
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "*",
      "Condition": {
        "StringLike": {
          "secretsmanager:ResourceTag/tenantId": "${aws:PrincipalTag/tenantId}"
        }
      }
    },
    {
      "Sid": "UserOwnSecretsOnly",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::role/SparkAppRole" },
      "Action": ["secretsmanager:PutSecretValue", "secretsmanager:UpdateSecret"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "secretsmanager:ResourceTag/userId": "${aws:PrincipalTag/userId}"
        }
      }
    }
  ]
}
```

### Encryption
- All secrets encrypted with tenant-specific KMS key
- KMS key policy restricts access to tenant members
- Key rotation: automatic, every 365 days

### Secret Rotation
- Provider API keys: Manual (user updates when they rotate upstream)
- Shared tenant secrets: Automatic rotation via Lambda (if supported by provider)

## Cost Consideration

Secrets Manager pricing:
- $0.40 per secret per month
- $0.05 per 10,000 API calls

Per user (estimated):
- 1 provider-keys secret
- ~5 tool credential secrets
- ~3 MCP credential secrets
- = ~9 secrets per user

4000 users × 9 secrets = 36,000 secrets
Cost: 36,000 × $0.40 = **$14,400/month** ← THIS IS EXPENSIVE

### Optimization: Consolidate Secrets

Instead of 1 secret per tool per user, use **1 secret per user** with all their credentials:

**Path**: `spark/tenant/t_acme/users/u_abc123/all-credentials`
```json
{
  "provider_anthropic": "sk-ant-...",
  "provider_openrouter": "sk-or-...",
  "provider_openai": "sk-...",
  "tool_tl_jira_JIRA_API_TOKEN": "ATATT3xF...",
  "tool_tl_jira_JIRA_USER_EMAIL": "user@acme.com",
  "mcp_github_GITHUB_TOKEN": "ghp_xxxx...",
  "mcp_slack_SLACK_TOKEN": "xoxb-..."
}
```

4000 users × 1 secret = 4,000 secrets
Cost: 4,000 × $0.40 = **$1,600/month** ✅ Much better

API calls: ~20 reads per user per day × 4000 users × 30 days = 2.4M calls
Cost: 2.4M / 10,000 × $0.05 = **$12/month**

**Total Secrets Manager: ~$1,612/month**

### Alternative: Parameter Store (even cheaper)

AWS Systems Manager Parameter Store (SecureString):
- Advanced tier: $0.05 per parameter per month
- 4000 parameters × $0.05 = $200/month
- BUT: 8KB limit per parameter (may be tight), no automatic rotation
- Acceptable for most cases; fall back to Secrets Manager for large credential sets

**Recommendation**: Use Parameter Store SecureString for most users, Secrets Manager 
for tenant-shared secrets that need rotation.

**Revised cost: ~$200-400/month for secrets storage**

## PDPA Compliance for Secrets

1. **Data Residency**: Secrets Manager region = ap-southeast-1 (Singapore)
2. **Access Logging**: CloudTrail logs every GetSecretValue call
3. **Right to Erasure**: Delete user → delete their secret → purge from CloudTrail after retention
4. **Encryption**: AES-256 via KMS, tenant-scoped keys
5. **Breach Notification**: CloudWatch alarm on unusual GetSecretValue patterns
