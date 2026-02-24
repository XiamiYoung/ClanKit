<template>
  <div class="h-full flex flex-col overflow-hidden mcp-page">

    <!-- Header -->
    <div class="catalog-header">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div>
          <h1 class="catalog-title">MCP Servers</h1>
          <p class="catalog-subtitle">
            Configure MCP servers to extend the AI agent with dynamic tools. Uses subprocess + stdio (JSON-RPC 2.0).
          </p>
        </div>
        <div class="flex items-center gap-2">
          <div class="catalog-count-badge">
            {{ mcpStore.servers.length }} server{{ mcpStore.servers.length !== 1 ? 's' : '' }}
          </div>
          <button class="catalog-add-btn" @click="openAdd">
            <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Server
          </button>
        </div>
      </div>

      <!-- Search bar -->
      <div class="catalog-search-wrap">
        <svg class="catalog-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search servers by name or description..."
          class="catalog-search-input"
        />
        <span v-if="searchQuery" class="catalog-search-clear" @click="searchQuery = ''">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </span>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="mcpStore.servers.length === 0" class="flex-1 flex items-center justify-center mcp-grid-bg">
      <div class="text-center" style="max-width:420px;">
        <div
          class="mx-auto mb-5 w-20 h-20 rounded-2xl flex items-center justify-center"
          style="background: linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%);"
        >
          <svg style="width:40px;height:40px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </div>
        <h2 style="font-family:'Figtree',sans-serif; font-size:var(--fs-section); font-weight:700; color:#1E293B; margin:0 0 8px;">
          No MCP servers configured
        </h2>
        <p style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); color:#64748B; line-height:1.6; margin:0;">
          Add an MCP server to connect external tools and services to the AI agent.
          Tools are discovered automatically from the server.
        </p>
      </div>
    </div>

    <!-- No search results -->
    <div v-else-if="filteredServers.length === 0 && searchQuery" class="flex-1 flex items-center justify-center mcp-grid-bg">
      <div class="text-center">
        <svg class="mx-auto" style="width:40px;height:40px;color:#94A3B8;margin-bottom:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <p style="font-family:'Figtree',sans-serif; font-size:var(--fs-body); font-weight:600; color:#475569; margin:0 0 4px;">No servers match "{{ searchQuery }}"</p>
        <p style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-secondary); color:#94A3B8; margin:0;">Try a different search term or clear the filter.</p>
      </div>
    </div>

    <!-- Server Grid -->
    <div v-else class="flex-1 overflow-y-auto mcp-grid-bg">
      <div style="padding:24px 32px;">
        <div class="mcp-grid">
          <div
            v-for="(server, idx) in filteredServers"
            :key="server.id"
            @click="openEdit(server)"
            class="mcp-card"
          >
            <!-- Gradient accent bar -->
            <div class="mcp-card-accent" :style="{ background: cardGradient(idx) }"></div>

            <div class="mcp-card-body">
              <!-- Icon + title row -->
              <div class="mcp-card-title-row">
                <div class="mcp-card-icon" :style="{ background: cardGradient(idx) }">
                  <svg style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </div>
                <div style="flex:1;min-width:0;">
                  <h3 class="mcp-card-name">{{ server.name }}</h3>
                </div>
                <!-- Runtime status -->
                <span
                  class="mcp-runtime-badge"
                  :class="mcpStore.runningStatus[server.id] ? 'running' : 'stopped'"
                >
                  <span class="mcp-runtime-dot"></span>
                  {{ mcpStore.runningStatus[server.id] ? 'Running' : 'Stopped' }}
                </span>
              </div>

              <!-- Description -->
              <p class="mcp-card-desc">{{ server.description || 'No description' }}</p>

              <!-- Footer -->
              <div class="mcp-card-footer">
                <span class="mcp-card-endpoint" :title="formatCommand(server)">
                  <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                  {{ truncateCommand(server) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Add/Edit Modal (PersonaWizard-style backdrop) ═══ -->
    <Teleport to="body">
      <div v-if="showModal" class="mcp-backdrop" @click.self="closeModal">
        <div class="mcp-modal">
          <!-- Modal header -->
          <div class="mcp-modal-header">
            <div class="mcp-modal-header-left">
              <div class="mcp-modal-header-icon">
                <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </div>
              <h2 class="mcp-modal-title">{{ editingServer ? 'Edit Server' : 'Add MCP Server' }}</h2>
            </div>
            <button class="mcp-modal-close" @click="closeModal">
              <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          <!-- Modal body -->
          <div class="mcp-modal-body">
            <!-- Server details -->
            <div class="form-group">
              <label class="form-label">Name *</label>
              <input v-model="form.name" type="text" class="form-input" placeholder="my-mcp-server" />
              <p class="form-hint">Unique server identifier (used as key in config)</p>
            </div>

            <div class="form-group">
              <label class="form-label">Description</label>
              <input v-model="form.description" type="text" class="form-input" placeholder="What this MCP server does" />
            </div>

            <div class="form-group">
              <label class="form-label">Command *</label>
              <input v-model="form.command" type="text" class="form-input" placeholder="npx" />
              <p class="form-hint">Executable to run (e.g., npx, node, python, uvx)</p>
            </div>

            <div class="form-group">
              <label class="form-label">Arguments</label>
              <textarea
                v-model="form.argsText"
                class="form-textarea"
                rows="3"
                placeholder="-y
@modelcontextprotocol/server-everything"
              ></textarea>
              <p class="form-hint">One argument per line</p>
            </div>

            <!-- Environment Variables -->
            <div class="env-section">
              <div class="env-header">
                <h3 class="env-title">Environment Variables</h3>
                <button class="env-add-btn" @click="addEnvVar">
                  <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add
                </button>
              </div>

              <div v-if="form.envVars.length === 0" class="env-empty">
                <p>No environment variables. Add if the server requires API keys or config.</p>
              </div>

              <div v-for="(ev, idx) in form.envVars" :key="idx" class="env-row">
                <input v-model="ev.key" type="text" class="form-input-sm" placeholder="KEY" style="flex:1;" />
                <input v-model="ev.value" type="text" class="form-input-sm" placeholder="value..." style="flex:2;" />
                <button class="env-remove-btn" @click="removeEnvVar(idx)">
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
            </div>

            <!-- Test Connection -->
            <div class="test-section">
              <button
                class="test-btn"
                @click="runTestConnection"
                :disabled="!form.command?.trim() || testStatus === 'testing'"
              >
                <svg v-if="testStatus !== 'testing'" style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <svg v-else class="spin" style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {{ testStatus === 'testing' ? 'Testing...' : 'Test Connection' }}
              </button>

              <!-- Test results -->
              <div v-if="testStatus === 'success'" class="test-result success">
                <p class="test-result-title">Connection successful - {{ testTools.length }} tool{{ testTools.length !== 1 ? 's' : '' }} discovered:</p>
                <div class="test-tools-list">
                  <div v-for="t in testTools" :key="t.name" class="test-tool-item">
                    <span class="test-tool-name">{{ t.name }}</span>
                    <span v-if="t.description" class="test-tool-desc">{{ t.description }}</span>
                  </div>
                </div>
              </div>
              <div v-if="testStatus === 'error'" class="test-result error">
                <p class="test-result-title">Connection failed:</p>
                <p class="test-result-error">{{ testError }}</p>
              </div>
            </div>
          </div>

          <!-- Modal footer -->
          <div class="mcp-modal-footer">
            <div v-if="editingServer" style="flex:1;">
              <button class="modal-delete-btn" @click="confirmDelete">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                Delete
              </button>
            </div>
            <button class="modal-cancel-btn" @click="closeModal">Cancel</button>
            <button class="modal-save-btn" @click="saveForm" :disabled="!form.name?.trim() || !form.command?.trim()">Save</button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMcpStore } from '../stores/mcp'

const mcpStore = useMcpStore()

let statusPollInterval = null

onMounted(async () => {
  await mcpStore.loadServers()
  await mcpStore.loadStatus()
  statusPollInterval = setInterval(() => mcpStore.loadStatus(), 5000)
})

onUnmounted(() => {
  if (statusPollInterval) {
    clearInterval(statusPollInterval)
    statusPollInterval = null
  }
})

const searchQuery = ref('')
const showModal = ref(false)
const editingServer = ref(null)

const testStatus = ref('')   // '' | 'testing' | 'success' | 'error'
const testTools = ref([])
const testError = ref('')

const form = ref(emptyForm())

function emptyForm() {
  return {
    name: '',
    description: '',
    command: '',
    argsText: '',
    envVars: [],
  }
}

const filteredServers = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return mcpStore.servers
  return mcpStore.servers.filter(s =>
    s.name?.toLowerCase().includes(q) ||
    s.description?.toLowerCase().includes(q)
  )
})

function openAdd() {
  editingServer.value = null
  form.value = emptyForm()
  testStatus.value = ''
  testTools.value = []
  testError.value = ''
  showModal.value = true
}

function openEdit(server) {
  editingServer.value = server
  form.value = {
    id: server.id,
    name: server.name || '',
    description: server.description || '',
    command: server.command || '',
    argsText: (server.args || []).join('\n'),
    envVars: Object.entries(server.env || {}).map(([key, value]) => ({ key, value })),
  }
  testStatus.value = ''
  testTools.value = []
  testError.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingServer.value = null
}

function addEnvVar() {
  form.value.envVars.push({ key: '', value: '' })
}

function removeEnvVar(idx) {
  form.value.envVars.splice(idx, 1)
}

async function saveForm() {
  const args = form.value.argsText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const env = Object.fromEntries(
    form.value.envVars
      .filter(ev => ev.key.trim())
      .map(ev => [ev.key.trim(), ev.value])
  )

  const serverData = {
    id: editingServer.value ? editingServer.value.id : form.value.name.trim(),
    name: form.value.name.trim(),
    description: form.value.description.trim(),
    command: form.value.command.trim(),
    args,
    env,
  }

  await mcpStore.saveServer(serverData)
  closeModal()
}

async function runTestConnection() {
  testStatus.value = 'testing'
  testTools.value = []
  testError.value = ''

  const args = form.value.argsText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const env = Object.fromEntries(
    form.value.envVars
      .filter(ev => ev.key.trim())
      .map(ev => [ev.key.trim(), ev.value])
  )

  try {
    const result = await mcpStore.testConnection({
      name: form.value.name || 'test',
      command: form.value.command.trim(),
      args,
      env,
    })

    if (result.success) {
      testStatus.value = 'success'
      testTools.value = result.tools || []
    } else {
      testStatus.value = 'error'
      testError.value = result.error || 'Unknown error'
    }
  } catch (err) {
    testStatus.value = 'error'
    testError.value = err.message || 'Failed to test connection'
  }
}

async function confirmDelete() {
  if (!editingServer.value) return
  if (confirm(`Delete server "${editingServer.value.name}"?`)) {
    await mcpStore.deleteServer(editingServer.value.id)
    closeModal()
  }
}

function formatCommand(server) {
  return `${server.command || ''} ${(server.args || []).join(' ')}`.trim()
}

function truncateCommand(server) {
  const cmd = formatCommand(server)
  return cmd.length > 45 ? cmd.slice(0, 42) + '...' : cmd
}

const GRADIENTS = [
  'linear-gradient(135deg, #8B5CF6, #6366F1)',
  'linear-gradient(135deg, #3B82F6, #2563EB)',
  'linear-gradient(135deg, #10B981, #059669)',
  'linear-gradient(135deg, #F59E0B, #D97706)',
  'linear-gradient(135deg, #EC4899, #DB2777)',
  'linear-gradient(135deg, #14B8A6, #0D9488)',
  'linear-gradient(135deg, #EF4444, #DC2626)',
  'linear-gradient(135deg, #0EA5E9, #0284C7)',
]

function cardGradient(idx) {
  return GRADIENTS[idx % GRADIENTS.length]
}
</script>

<style scoped>
/* ── Page shell ────────────────────────────────────────────────────────────── */
.mcp-page {
  background: #F8FAFC;
}

/* ── Header ────────────────────────────────────────────────────────────────── */
.catalog-header {
  flex-shrink: 0;
  padding: 16px 24px 14px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(226, 232, 240, 0.5);
}
.catalog-title {
  font-family: 'Figtree', sans-serif;
  font-size: var(--fs-page-title);
  font-weight: 700;
  color: #0F172A;
  margin: 0;
}
.catalog-subtitle {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
  color: #475569;
  margin: 4px 0 0 0;
}
.catalog-count-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #64748B;
  background: rgba(241, 245, 249, 0.8);
  padding: 5px 12px;
  border-radius: 9999px;
  border: 1px solid rgba(226, 232, 240, 0.5);
}
.catalog-add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  background: #6366F1;
  color: #fff;
  border: none;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
}
.catalog-add-btn:hover {
  background: #4F46E5;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
}
.catalog-add-btn:active {
  transform: scale(0.97);
}

/* ── Search bar ────────────────────────────────────────────────────────────── */
.catalog-search-wrap {
  position: relative;
  margin-top: 14px;
}
.catalog-search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: #94A3B8;
  pointer-events: none;
  transition: color 0.2s;
}
.catalog-search-input {
  width: 100%;
  padding: 11px 42px 11px 42px;
  border-radius: 12px;
  border: 1px solid #E2E8F0;
  background: rgba(255, 255, 255, 0.8);
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
  color: #1E293B;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}
.catalog-search-input::placeholder { color: #94A3B8; font-weight: 400; }
.catalog-search-input:hover { border-color: #94A3B8; }
.catalog-search-input:focus {
  border-color: #6366F1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12), 0 1px 3px rgba(15, 23, 42, 0.06);
}
.catalog-search-wrap:focus-within .catalog-search-icon { color: #6366F1; }
.catalog-search-clear {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: #94A3B8;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.catalog-search-clear:hover { background: #F1F5F9; color: #475569; }

/* ── Grid background ───────────────────────────────────────────────────────── */
.mcp-grid-bg {
  background:
    radial-gradient(ellipse at 15% 10%, rgba(139, 92, 246, 0.10) 0%, transparent 50%),
    radial-gradient(ellipse at 85% 20%, rgba(99, 102, 241, 0.08) 0%, transparent 45%),
    radial-gradient(ellipse at 50% 80%, rgba(16, 185, 129, 0.06) 0%, transparent 50%),
    #F8FAFC;
}

/* ── Grid ──────────────────────────────────────────────────────────────────── */
.mcp-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
@media (max-width: 1200px) { .mcp-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 900px)  { .mcp-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px)  { .mcp-grid { grid-template-columns: 1fr; } }

/* ── Card ──────────────────────────────────────────────────────────────────── */
.mcp-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(226, 232, 240, 0.6);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease, border-color 0.25s ease;
  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.06),
    0 8px 24px rgba(15, 23, 42, 0.03),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
.mcp-card:hover {
  transform: translateY(-5px);
  background: rgba(255, 255, 255, 0.78);
  border-color: rgba(99, 102, 241, 0.35);
  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.06),
    0 12px 32px rgba(15, 23, 42, 0.08),
    0 4px 16px rgba(99, 102, 241, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}
.mcp-card:active { transform: translateY(-1px); transition-duration: 0.1s; }
.mcp-card-accent { height: 3px; width: 100%; flex-shrink: 0; }
.mcp-card-body { padding: 20px 20px 16px; display: flex; flex-direction: column; flex: 1; }
.mcp-card-title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.mcp-card-icon {
  width: 36px; height: 36px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.12);
}
.mcp-card-name {
  font-family: 'Figtree', sans-serif;
  font-size: var(--fs-body);
  font-weight: 700;
  color: #1E293B;
  margin: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mcp-runtime-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'Noto Sans', sans-serif;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
}
.mcp-runtime-badge.running {
  background: #F0FDF4;
  color: #059669;
}
.mcp-runtime-badge.stopped {
  background: #F1F5F9;
  color: #94A3B8;
}
.mcp-runtime-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.mcp-runtime-badge.running .mcp-runtime-dot {
  background: #10B981;
}
.mcp-runtime-badge.stopped .mcp-runtime-dot {
  background: #CBD5E1;
}
.mcp-card-desc {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  color: #475569;
  line-height: 1.55;
  margin: 0 0 14px;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mcp-card-footer {
  border-top: 1px solid rgba(226, 232, 240, 0.5);
  padding-top: 12px;
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mcp-card-endpoint {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-caption);
  color: #94A3B8;
  display: flex; align-items: center; gap: 5px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 100%;
}

/* ═══ Modal — PersonaWizard-style backdrop ═══════════════════════════════════ */
.mcp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mcp-modal {
  width: min(640px, 95vw);
  max-height: 85vh;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 20px;
  box-shadow:
    0 25px 60px rgba(0, 0, 0, 0.18),
    0 8px 32px rgba(99, 102, 241, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mcp-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #E2E8F0;
}
.mcp-modal-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mcp-modal-header-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: #6366F1;
}
.mcp-modal-title {
  font-family: 'Figtree', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #0F172A;
  margin: 0;
}
.mcp-modal-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #64748B;
  cursor: pointer;
  transition: background 0.15s;
}
.mcp-modal-close:hover { background: #F1F5F9; }
.mcp-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  scrollbar-width: thin;
}
.mcp-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid #E2E8F0;
}
.modal-cancel-btn {
  padding: 8px 18px;
  border-radius: 8px;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
  font-weight: 500;
  background: #F1F5F9;
  color: #475569;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}
.modal-cancel-btn:hover { background: #E2E8F0; }
.modal-save-btn {
  padding: 8px 22px;
  border-radius: 8px;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  background: #6366F1;
  color: #fff;
  border: none;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.25);
}
.modal-save-btn:hover { background: #4F46E5; }
.modal-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.modal-delete-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  border-radius: 8px;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  background: #FEF2F2;
  color: #DC2626;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}
.modal-delete-btn:hover { background: #FEE2E2; }

/* ── Form fields ───────────────────────────────────────────────────────────── */
.form-group { margin-bottom: 16px; }
.form-label {
  display: block;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}
.form-input {
  width: 100%;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid #E2E8F0;
  background: #fff;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
  color: #1E293B;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-input:focus {
  border-color: #6366F1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}
.form-input-sm {
  width: 100%;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid #E2E8F0;
  background: #FAFBFC;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  color: #1E293B;
  outline: none;
  transition: border-color 0.15s;
}
.form-input-sm:focus { border-color: #6366F1; }
.form-textarea {
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #E2E8F0;
  background: #FAFBFC;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: #1E293B;
  outline: none;
  resize: vertical;
  transition: border-color 0.15s;
}
.form-textarea:focus { border-color: #6366F1; }
.form-hint {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-caption);
  color: #94A3B8;
  margin: 4px 0 0;
}

/* ── Environment variables section ─────────────────────────────────────────── */
.env-section {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid #E2E8F0;
}
.env-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.env-title {
  font-family: 'Figtree', sans-serif;
  font-size: var(--fs-body);
  font-weight: 700;
  color: #1E293B;
  margin: 0;
}
.env-add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 6px;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  background: #EEF2FF;
  color: #6366F1;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}
.env-add-btn:hover { background: #E0E7FF; }
.env-empty {
  padding: 20px;
  border-radius: 10px;
  background: #F8FAFC;
  border: 1.5px dashed #CBD5E1;
  text-align: center;
}
.env-empty p {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  color: #94A3B8;
  margin: 0;
}
.env-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.env-remove-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  border: none; background: none;
  color: #94A3B8; cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.env-remove-btn:hover { background: #FEE2E2; color: #DC2626; }

/* ── Test Connection ───────────────────────────────────────────────────────── */
.test-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #E2E8F0;
}
.test-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 8px;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  background: #F0FDF4;
  color: #059669;
  border: 1px solid #BBF7D0;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.test-btn:hover { background: #DCFCE7; border-color: #86EFAC; }
.test-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.test-result {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 10px;
}
.test-result.success {
  background: #F0FDF4;
  border: 1px solid #BBF7D0;
}
.test-result.error {
  background: #FEF2F2;
  border: 1px solid #FECACA;
}
.test-result-title {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  margin: 0 0 8px;
}
.test-result.success .test-result-title { color: #059669; }
.test-result.error .test-result-title { color: #DC2626; }
.test-result-error {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  color: #991B1B;
  margin: 0;
  word-break: break-word;
}
.test-tools-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.test-tool-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
}
.test-tool-name {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  font-weight: 600;
  color: #065F46;
  flex-shrink: 0;
}
.test-tool-desc {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-caption);
  color: #64748B;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
.spin {
  animation: spin 1s linear infinite;
}

/* ── Reduced motion ─────────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .mcp-card, .catalog-add-btn { transition: none; }
  .mcp-card:hover { transform: none; }
  .spin { animation: none; }
}
</style>
