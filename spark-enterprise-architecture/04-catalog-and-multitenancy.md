# Catalog Architecture & Multi-Tenancy

## The Catalog Concept

### Two-Tier Model

```
┌─────────────────────────────────────────────────────────────┐
│                    TENANT CATALOG                            │
│  (Managed by admins, shared across all 4000 users)          │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Personas │  │  Tools   │  │MCP Servers│  │  Skills  │   │
│  │  (30+)   │  │ (100+)   │  │  (20+)   │  │  (50+)  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  Status: draft → published → deprecated                      │
│  Versioned, audited, RBAC-controlled                        │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Users SELECT from catalog
                          │ + provide their own credentials
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 USER WORKSPACE (per user)                     │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ Selected Items  │  │ Personal Items  │                  │
│  │ (from catalog)  │  │ (user-created)  │                  │
│  │                 │  │                 │                  │
│  │ • Persona refs  │  │ • My personas   │                  │
│  │ • Tool instances│  │ • My tools      │                  │
│  │ • MCP instances │  │ • My skills     │                  │
│  │   (w/ my keys)  │  │                 │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   My Config     │  │ My Knowledge    │                  │
│  │ (API keys, etc) │  │ (docs, indexes) │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ My Soul Memory  │  │  My Chat Hist   │                  │
│  └─────────────────┘  └─────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### Catalog Item Lifecycle

```
Admin creates tool          User browses catalog
        │                          │
        ▼                          ▼
   ┌─────────┐              ┌─────────────┐
   │  DRAFT  │              │   CATALOG   │◄── Only "published" items visible
   └────┬────┘              │   BROWSER   │
        │ publish           └──────┬──────┘
        ▼                          │ select
   ┌───────────┐                   ▼
   │ PUBLISHED │            ┌─────────────┐
   └─────┬─────┘            │  SELECTION  │─── Links user to catalog item
         │ deprecate         │  + secrets  │    User provides own API keys
         ▼                   └─────────────┘
   ┌────────────┐
   │ DEPRECATED │──── Users see warning, existing configs still work
   └────────────┘
```

### Key Design Decisions

1. **Catalog personas define the prompt, model defaults, and enabled tools/skills**
   - Users CANNOT modify the prompt (ensures governance)
   - Users CAN override: model selection, provider
   - Users CAN: pin, reorder, enable/disable

2. **Catalog tools define the interface; users provide credentials**
   - Tool definition (endpoint, method, template) is shared
   - API keys and tokens are per-user in Secrets Manager
   - `requiredSecrets` field tells the UI what to ask the user for

3. **MCP servers are templates; users instantiate with their keys**
   - Catalog: "GitHub MCP needs GITHUB_TOKEN"
   - User: "Here's my GITHUB_TOKEN" → stored in Secrets Manager
   - Runtime: merge catalog template + user secrets to build MCP config

4. **Skills are read-only content from catalog**
   - Markdown stored in S3 (can be large)
   - Versioned — update doesn't break existing persona configs
   - Users select which skills to enable on their personas

## Multi-Tenancy Isolation

### Tenant Isolation Model: Silo-in-Pool

```
                    ┌───────────────────┐
                    │  DynamoDB Tables   │
                    │  (shared infra)    │
                    └───────┬───────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
       ┌──────┴──────┐ ┌───┴────┐  ┌─────┴─────┐
       │ Tenant ACME │ │Tenant B│  │ Tenant C  │
       │ PK prefix:  │ │PK:     │  │PK:        │
       │ TENANT#acme │ │TENANT# │  │TENANT#    │
       └──────┬──────┘ └───┬────┘  └─────┬─────┘
              │             │             │
        ┌─────┴─────┐      │             │
        │ Users     │ (each tenant's users only see
        │ u1,u2,u3  │  their tenant's catalog +
        └───────────┘  their own personal data)
```

### Isolation Enforced At:

| Layer | Mechanism |
|-------|-----------|
| **API Gateway** | JWT contains `tenantId` + `userId`, validated on every request |
| **Application** | Middleware injects `tenantId` into every DynamoDB query PK |
| **DynamoDB** | PK prefix ensures no cross-tenant data leakage |
| **IAM** | DynamoDB fine-grained access control (condition: `LeadingKeys` matches tenant) |
| **Secrets Manager** | Resource policy per tenant; secret path: `spark/{tenantId}/{userId}/...` |

### DynamoDB IAM Policy for Tenant Isolation
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem"],
    "Resource": "arn:aws:dynamodb:ap-southeast-1:*:table/SparkMain",
    "Condition": {
      "ForAllValues:StringLike": {
        "dynamodb:LeadingKeys": [
          "TENANT#${aws:PrincipalTag/tenantId}#*",
          "USER#${aws:PrincipalTag/userId}#*"
        ]
      }
    }
  }]
}
```

## RBAC Model

### Roles
```
OWNER   — Full control, manage billing, delete tenant
ADMIN   — Manage catalog (CRUD personas/tools/MCP/skills), manage members
USER    — Browse catalog, select items, create personal items, chat
VIEWER  — Read-only access, can view but not create
```

### Permission Matrix
| Action | Owner | Admin | User | Viewer |
|--------|-------|-------|------|--------|
| Manage tenant settings | ✅ | ❌ | ❌ | ❌ |
| Manage members & roles | ✅ | ✅ | ❌ | ❌ |
| Create/edit catalog items | ✅ | ✅ | ❌ | ❌ |
| Publish/deprecate catalog | ✅ | ✅ | ❌ | ❌ |
| Browse catalog | ✅ | ✅ | ✅ | ✅ |
| Select catalog items | ✅ | ✅ | ✅ | ❌ |
| Create personal personas/tools | ✅ | ✅ | ✅ | ❌ |
| Configure own API keys | ✅ | ✅ | ✅ | ❌ |
| Chat | ✅ | ✅ | ✅ | ❌ |
| View own chat history | ✅ | ✅ | ✅ | ✅ |
| View usage analytics | ✅ | ✅ | ❌ | ❌ |
| Export audit logs | ✅ | ✅ | ❌ | ❌ |
| PDPA data subject request | ✅ | ✅ | Own only | Own only |
