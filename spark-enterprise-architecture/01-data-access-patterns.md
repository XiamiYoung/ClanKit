# Data Access Pattern Analysis

## Current Local File → Required Access Patterns

### config.json → User Configuration
- **Read**: On every app load, per user
- **Write**: When user changes settings (infrequent)
- **Pattern**: Key-value lookup by userId
- **Size**: ~2KB per user

### personas.json → Personas (Catalog + User)
- **Read**: App load (list all available), on chat start (load specific persona)
- **Write**: Admin creates/updates catalog personas; users create personal personas
- **Pattern**: List by tenant, list by user, get by ID
- **Size**: ~5-50KB per persona (prompt field is large)
- **Key insight**: Two-tier - catalog (shared) vs user-created (private)

### tools.json → Tools (Catalog + User)
- **Read**: When persona is loaded (resolve enabledToolIds), when executing tool
- **Write**: Admin CRUD on catalog tools; users may create personal tools
- **Pattern**: Get by ID, list by tenant, list by user
- **Size**: ~1-10KB per tool

### mcp-servers.json → MCP Server Configs
- **Read**: On persona load (resolve mcpServerIds), on tool execution
- **Write**: Admin manages catalog; users configure their own instances with API keys
- **Pattern**: Get by ID, list available, get user's configured instance
- **Size**: ~0.5-2KB per config (but env{} contains SECRETS)
- **Key insight**: Catalog defines the server template; user provides their own API keys/env

### knowledge.json + knowledge-docs.json → Knowledge Bases
- **Read**: On RAG query, on doc listing
- **Write**: Upload documents, configure indexes
- **Pattern**: List docs by user/tenant, get config
- **Size**: Metadata only in DB; actual docs in S3

### souls/ → Memory/Soul Files
- **Read**: On every chat message (context loading)
- **Write**: After AI learns something about user/persona (frequent)
- **Pattern**: Get by persona+user combo, append/update sections
- **Size**: 1-100KB, grows over time
- **Hot path**: This is the highest-frequency read/write

### chats/ → Chat History
- **Read**: Load conversation, search history
- **Write**: Every message (very frequent)
- **Pattern**: List chats by user, get messages by chatId, append message
- **Size**: 10KB-1MB per conversation, many conversations per user
- **Hot path**: Highest write volume

### skills → Skill Files
- **Read**: On persona load (resolve enabledSkillIds)
- **Write**: Admin CRUD (infrequent)
- **Pattern**: Get by ID, list all available
- **Size**: 1-50KB markdown files

## Access Pattern Summary

| Data | Read Frequency | Write Frequency | Size | Multi-tenant Pattern |
|------|---------------|-----------------|------|---------------------|
| Config | High (app load) | Low | Small | Per-user |
| Personas | Medium | Low | Medium | Catalog + User |
| Tools | Medium | Low | Medium | Catalog + User |
| MCP Servers | Medium | Low | Small (+secrets) | Catalog template + User instance |
| Knowledge Config | Low | Low | Small | Per-user/team |
| Knowledge Docs | Medium | Low | Metadata small | Per-user/team |
| Soul Memory | Very High | High | Growing | Per-user-persona |
| Chat History | High | Very High | Large, growing | Per-user |
| Skills | Medium | Low | Medium | Catalog + User |
