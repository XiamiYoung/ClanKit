# DynamoDB Table Design

## Design Philosophy: Hybrid Single-Table + Purpose Tables

**Why not pure single-table?** 
Pure single-table design for 9 entity types would make the code unmaintainable and GSI 
projections wasteful. Instead, we use **3 tables**:

1. **SparkMain** — Config, personas, tools, MCP servers, skills, knowledge (catalog + user data)
2. **SparkChat** — Chat history (highest volume, different lifecycle/TTL, separate scaling)
3. **SparkMemory** — Soul memory files (high frequency read/write, separate scaling)

Plus an **SparkAudit** table for compliance.

---

## Table 1: SparkMain

### Key Design
- **PK**: `{scope}#{entityType}` 
- **SK**: `{entityId}` or `{sortableAttribute}#{entityId}`

Where `scope` is:
- `TENANT#{tenantId}` — Catalog items shared across the org
- `USER#{userId}` — User-specific items

### Entity Patterns

#### User Configuration (was config.json)
```
PK: USER#u_abc123#CONFIG
SK: SETTINGS
Attributes: {
  providerId: "anthropic",
  modelId: "claude-sonnet-4-20250514",
  theme: "dark",
  newsFeeds: [...],
  paths: {...},
  createdAt, updatedAt
}
```
- API keys are NOT stored here → Secrets Manager (see section 05)

#### Catalog Personas (company-wide, admin-managed)
```
PK: TENANT#t_acme#PERSONA
SK: p_uuid
Attributes: {
  name: "Code Reviewer",
  type: "system",
  avatar: "👨‍💻",
  description: "...",
  prompt: "You are a senior code reviewer...",  // can be large
  providerId: "anthropic",
  modelId: "claude-sonnet-4-20250514",
  enabledToolIds: ["tl_abc", "tl_def"],
  enabledSkillIds: ["sk_001"],
  mcpServerIds: ["mcp_github"],
  status: "published",         // draft | published | deprecated
  version: 3,
  createdBy: "u_admin1",
  createdAt, updatedAt,
  GSI1PK: "TENANT#t_acme#PERSONA#published",  // for listing active personas
  GSI1SK: "p_uuid"
}
```

#### User-Created Personas (personal, not in catalog)
```
PK: USER#u_abc123#PERSONA
SK: p_uuid
Attributes: {
  // Same schema as catalog persona
  name: "My Custom Helper",
  type: "user",
  // ... all other fields
  GSI1PK: "USER#u_abc123#PERSONA",
  GSI1SK: "p_uuid"
}
```

#### User's Persona Selections + Overrides
```
PK: USER#u_abc123#PERSONA_SELECTION
SK: p_uuid                          // references catalog persona ID
Attributes: {
  catalogPersonaId: "p_uuid",
  enabled: true,
  overrides: {                       // user can override model, not prompt
    modelId: "claude-sonnet-4-20250514",
    providerId: "openrouter"
  },
  pinnedOrder: 1,                    // user's display ordering
  lastUsedAt: "2025-01-15T..."
}
```

#### Catalog Tools (was tools.json)
```
PK: TENANT#t_acme#TOOL
SK: tl_uuid
Attributes: {
  name: "Jira Create Ticket",
  type: "http",                     // http | code_snippet | prompt_template
  
  // Type-specific fields (DynamoDB schema flexibility)
  // For HTTP tools:
  method: "POST",
  endpoint: "https://jira.company.com/api/...",
  headers: { "Content-Type": "application/json" },
  bodyTemplate: "{ \"summary\": \"{{title}}\" ... }",
  
  // For code snippets:
  // language: "python", code: "..."
  
  // For prompt templates:
  // promptText: "..."
  
  status: "published",
  category: "project-management",    // for catalog browsing
  requiredSecrets: ["JIRA_API_TOKEN"], // what the user needs to configure
  createdBy, createdAt, updatedAt,
  GSI1PK: "TENANT#t_acme#TOOL#published",
  GSI1SK: "category#tl_uuid"
}
```

#### User Tool Instances (user's configured version of a catalog tool)
```
PK: USER#u_abc123#TOOL_INSTANCE
SK: tl_uuid
Attributes: {
  catalogToolId: "tl_uuid",
  secretArn: "arn:aws:secretsmanager:...",  // user's API key for this tool
  enabled: true,
  overrides: {
    endpoint: "https://my-jira.company.com/..."  // if user needs different endpoint
  }
}
```

#### Catalog MCP Servers (was mcp-servers.json)
```
PK: TENANT#t_acme#MCP
SK: mcp_uuid
Attributes: {
  name: "GitHub MCP",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  requiredEnvVars: ["GITHUB_TOKEN"],   // template: what the user must provide
  optionalEnvVars: ["GITHUB_ORG"],
  description: "Access GitHub repos, PRs, issues",
  status: "published",
  createdBy, createdAt, updatedAt,
  GSI1PK: "TENANT#t_acme#MCP#published",
  GSI1SK: "mcp_uuid"
}
```
**NOTE**: The `env{}` with actual secrets is NEVER in DynamoDB.
Each user's MCP credentials → Secrets Manager.

#### User MCP Server Instances
```
PK: USER#u_abc123#MCP_INSTANCE
SK: mcp_uuid
Attributes: {
  catalogMcpId: "mcp_uuid",
  secretArn: "arn:aws:secretsmanager:ap-southeast-1:...:secret:spark/u_abc123/mcp/mcp_uuid",
  enabled: true,
  envOverrides: {                   // non-secret overrides
    GITHUB_ORG: "acme-corp"
  },
  lastHealthCheck: "2025-01-15T...",
  healthStatus: "healthy"
}
```

#### Skills (was skills/ markdown files)
```
PK: TENANT#t_acme#SKILL
SK: sk_uuid
Attributes: {
  name: "API Design Review",
  description: "Reviews API design against company standards",
  contentS3Key: "skills/t_acme/sk_uuid/v3.md",  // large markdown → S3
  contentHash: "sha256:abc...",
  version: 3,
  status: "published",
  category: "engineering",
  createdBy, createdAt, updatedAt,
  GSI1PK: "TENANT#t_acme#SKILL#published",
  GSI1SK: "category#sk_uuid"
}
```

#### Knowledge Base Config (was knowledge.json)
```
PK: USER#u_abc123#KNOWLEDGE
SK: CONFIG
Attributes: {
  indexName: "user-abc123-index",
  embeddingModel: "text-embedding-3-small",
  embeddingDimension: 1536,
  pineconeSecretArn: "arn:aws:secretsmanager:...",
  createdAt, updatedAt
}
```

#### Knowledge Documents (was knowledge-docs.json)
```
PK: USER#u_abc123#KNOWLEDGE
SK: DOC#doc_uuid
Attributes: {
  filename: "architecture-guide.pdf",
  s3Key: "knowledge/u_abc123/doc_uuid/architecture-guide.pdf",
  contentType: "application/pdf",
  sizeBytes: 2456789,
  chunkCount: 45,
  status: "indexed",            // uploading | processing | indexed | failed
  uploadedAt, indexedAt
}
```

#### RBAC: Tenant Memberships
```
PK: TENANT#t_acme#MEMBER
SK: USER#u_abc123
Attributes: {
  userId: "u_abc123",
  role: "user",                 // owner | admin | user | viewer
  permissions: ["catalog:read", "persona:create", "chat:*"],
  joinedAt, updatedAt,
  GSI2PK: "USER#u_abc123#TENANTS",   // reverse lookup: user → tenants
  GSI2SK: "TENANT#t_acme"
}
```

### Global Secondary Indexes (GSIs)

**GSI1** — "Catalog Listing Index"
- PK: GSI1PK
- SK: GSI1SK
- Purpose: List published catalog items by type
- Example: PK=`TENANT#t_acme#TOOL#published`, SK begins_with `project-management#`

**GSI2** — "User Reverse Lookup Index"
- PK: GSI2PK
- SK: GSI2SK
- Purpose: Find all tenants for a user; find all items by user across types
- Example: PK=`USER#u_abc123#TENANTS`

---

## Table 2: SparkChat

Separate table because:
- Highest write volume (every message)
- Different TTL/retention policies
- Needs independent scaling
- May need DynamoDB Streams → OpenSearch for search

### Key Design
```
PK: USER#u_abc123
SK: CHAT#c_uuid#META                    // Chat metadata
Attributes: {
  chatId: "c_uuid",
  title: "Refactoring auth module",
  personaId: "p_uuid",
  personaName: "Code Reviewer",          // denormalized for display
  messageCount: 47,
  model: "claude-sonnet-4-20250514",
  createdAt, updatedAt,
  status: "active",                       // active | archived | deleted
  GSI1PK: "USER#u_abc123#CHAT#active",
  GSI1SK: "2025-01-15T10:30:00Z"         // sort by last activity
}
```

```
PK: CHAT#c_uuid
SK: MSG#2025-01-15T10:30:00Z#m_uuid     // Messages sorted by timestamp
Attributes: {
  messageId: "m_uuid",
  role: "user",                           // user | assistant | system | tool
  content: "Please review this code...",
  model: "claude-sonnet-4-20250514",
  tokenCount: { input: 150, output: 800 },
  toolCalls: [...],                       // if assistant used tools
  cost: 0.0045,                           // for usage tracking
  timestamp: "2025-01-15T10:30:00Z"
}
```

### GSIs
**GSI1** — "User Chat Listing"
- PK: GSI1PK (`USER#{userId}#CHAT#{status}`)
- SK: GSI1SK (timestamp)
- Purpose: List user's active chats sorted by recent activity

---

## Table 3: SparkMemory

Separate table because:
- Very frequent read/write (every chat turn)
- Small items, high throughput
- Different backup/retention needs

### Key Design
```
PK: PERSONA#p_uuid#USER#u_abc123        // One memory per persona-user pair
SK: SECTION#{sectionName}
Attributes: {
  sectionName: "Preferences",
  entries: [
    { text: "Prefers TypeScript over JavaScript", addedAt: "2025-01-10T...", source: "chat#c_123" },
    { text: "Uses vim keybindings", addedAt: "2025-01-12T...", source: "chat#c_456" }
  ],
  updatedAt
}
```

Alternative entry for system-level persona memory (shared across users):
```
PK: PERSONA#p_uuid#SYSTEM
SK: SECTION#Interaction Notes
Attributes: {
  entries: [
    { text: "Users frequently ask about deployment", addedAt: "...", source: "aggregated" }
  ]
}
```

---

## Table 4: SparkAudit

For PDPA compliance and enterprise audit requirements.

### Key Design
```
PK: TENANT#t_acme#2025-01               // Partition by tenant + month
SK: 2025-01-15T10:30:00.123Z#evt_uuid
Attributes: {
  eventId: "evt_uuid",
  actor: "u_abc123",
  action: "persona.create",
  resource: "PERSONA#p_uuid",
  resourceType: "persona",
  details: {
    name: "My Helper",
    // snapshot of relevant fields
  },
  ipAddress: "203.0.113.50",
  userAgent: "SparkAI/2.1.0",
  timestamp: "2025-01-15T10:30:00.123Z",
  
  // For PDPA data access auditing
  personalDataAccessed: false,
  dataSubjects: [],                      // if personal data was involved
  
  TTL: 1768176600                        // Auto-expire after retention period (e.g., 7 years)
}
```

### GSIs
**GSI1** — "Actor Lookup"
- PK: `ACTOR#u_abc123`
- SK: timestamp
- Purpose: "Show me everything user X did" (PDPA data subject access requests)

**GSI2** — "Resource Lookup"  
- PK: `RESOURCE#PERSONA#p_uuid`
- SK: timestamp
- Purpose: "Show me all changes to this persona"
