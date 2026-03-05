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
          <AppButton @click="refreshServers" :loading="refreshing">
            <svg v-if="!refreshing" style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh
          </AppButton>
          <AppButton @click="openAdd">
            <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Server
          </AppButton>
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
          style="background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);"
        >
          <svg style="width:40px;height:40px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </div>
        <h2 style="font-family:'Inter',sans-serif; font-size:var(--fs-section); font-weight:700; color:#1A1A1A; margin:0 0 8px;">
          No MCP servers configured
        </h2>
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF; line-height:1.6; margin:0;">
          Add an MCP server to connect external tools and services to the AI agent.
          Tools are discovered automatically from the server.
        </p>
      </div>
    </div>

    <!-- No search results -->
    <div v-else-if="filteredServers.length === 0 && searchQuery" class="flex-1 flex items-center justify-center mcp-grid-bg">
      <div class="text-center">
        <svg class="mx-auto" style="width:40px;height:40px;color:#9CA3AF;margin-bottom:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#6B7280; margin:0 0 4px;">No servers match "{{ searchQuery }}"</p>
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF; margin:0;">Try a different search term or clear the filter.</p>
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
              <!-- Default row — top of card body -->
              <div class="mcp-card-default-row" @click.stop>
                <span class="mcp-default-label">{{ isMcpDefault(server.id) ? 'Default' : 'Not default' }}</span>
                <label class="default-toggle" :title="isMcpDefault(server.id) ? 'Remove from defaults' : 'Add to defaults'">
                  <input type="checkbox" :checked="isMcpDefault(server.id)" @change="toggleMcpDefault(server.id)" />
                  <span class="default-toggle-track"><span class="default-toggle-thumb"></span></span>
                </label>
              </div>

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

    <!-- ═══ Add/Edit Modal ═══ -->
    <Teleport to="body">
      <div v-if="showModal" class="mcp-backdrop">
        <div class="mcp-modal" role="dialog" aria-modal="true">
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
            <div ref="testResultEl" class="test-section">
              <AppButton
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
              </AppButton>

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

          <!-- Save error -->
          <div v-if="saveError" class="save-error">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {{ saveError }}
          </div>

          <!-- Modal footer -->
          <div class="mcp-modal-footer">
            <div v-if="editingServer" style="flex:1;">
              <AppButton variant="danger-ghost" @click="confirmDelete">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                Delete
              </AppButton>
            </div>
            <AppButton variant="secondary" size="modal" @click="closeModal">Cancel</AppButton>
            <AppButton size="modal" @click="saveForm" :disabled="!form.name?.trim() || !form.command?.trim()">Save</AppButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Delete Modal -->
    <ConfirmModal
      v-if="showConfirmDelete && editingServer"
      title="Delete Server"
      :message="`Are you sure you want to delete &quot;${editingServer.name}&quot;? This action cannot be undone.`"
      confirm-text="Delete"
      confirm-class="danger"
      @confirm="executeDelete"
      @close="showConfirmDelete = false"
    />

  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useMcpStore } from '../stores/mcp'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import AppButton from '../components/common/AppButton.vue'
import { useConfigStore } from '../stores/config'

const mcpStore = useMcpStore()
const configStore = useConfigStore()
const refreshing = ref(false)

function isMcpDefault(serverId) {
  const ids = configStore.config.defaultMcpServerIds
  if (!ids) return true // null = all default
  return ids.includes(serverId)
}

function toggleMcpDefault(serverId) {
  const allIds = mcpStore.servers.map(s => s.id)
  let current = configStore.config.defaultMcpServerIds
  if (!current) {
    current = allIds.filter(id => id !== serverId)
  } else if (current.includes(serverId)) {
    current = current.filter(id => id !== serverId)
  } else {
    current = [...current, serverId]
  }
  const isAll = current.length === allIds.length && allIds.every(id => current.includes(id))
  configStore.saveConfig({ defaultMcpServerIds: isAll ? null : current })
}

async function refreshServers() {
  refreshing.value = true
  try {
    await mcpStore.loadServers()
    await mcpStore.loadStatus()
  } finally {
    refreshing.value = false
  }
}

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
  // Clean up modal listeners if component is destroyed while modal is open
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onModalKeydown, true)
})

const searchQuery = ref('')
const showModal = ref(false)
const editingServer = ref(null)
const saveError = ref('')

const testStatus = ref('')   // '' | 'testing' | 'success' | 'error'
const testTools = ref([])
const testError = ref('')
const testResultEl = ref(null)

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
  let list = mcpStore.servers
  if (q) {
    list = list.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q)
    )
  }
  // Sort defaults to front
  return [...list].sort((a, b) => {
    const aD = isMcpDefault(a.id) ? 0 : 1
    const bD = isMcpDefault(b.id) ? 0 : 1
    return aD - bD
  })
})

function resetTestState() {
  testStatus.value = ''
  testTools.value = []
  testError.value = ''
}

function openAdd() {
  editingServer.value = null
  form.value = emptyForm()
  saveError.value = ''
  resetTestState()
  showModal.value = true
}

function openEdit(server) {
  editingServer.value = server
  saveError.value = ''
  form.value = {
    id: server.id,
    name: server.name || '',
    description: server.description || '',
    command: server.command || '',
    argsText: (server.args || []).join('\n'),
    envVars: Object.entries(server.env || {}).map(([key, value]) => ({ key, value })),
  }
  resetTestState()
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingServer.value = null
  resetTestState()
}

// Lock body scroll & handle ESC when modal is open
watch(showModal, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onModalKeydown, true)
  } else {
    document.body.style.overflow = ''
    document.removeEventListener('keydown', onModalKeydown, true)
  }
})

function onModalKeydown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    closeModal()
  }
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

  try {
    await mcpStore.saveServer(serverData)
  } catch (err) {
    saveError.value = err.message || 'Failed to save server'
    return
  }
  closeModal()
}

async function runTestConnection() {
  resetTestState()
  testStatus.value = 'testing'

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
  nextTick(() => testResultEl.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
}

const showConfirmDelete = ref(false)

function confirmDelete() {
  if (!editingServer.value) return
  showConfirmDelete.value = true
}

async function executeDelete() {
  if (!editingServer.value) return
  showConfirmDelete.value = false
  await mcpStore.deleteServer(editingServer.value.id)
  closeModal()
}

function formatCommand(server) {
  return `${server.command || ''} ${(server.args || []).join(' ')}`.trim()
}

function truncateCommand(server) {
  const cmd = formatCommand(server)
  return cmd.length > 45 ? cmd.slice(0, 42) + '...' : cmd
}

function cardGradient() {
  return 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)'
}
</script>

<style scoped>
/* ── Page shell ────────────────────────────────────────────────────────────── */
.mcp-page {
  background: #F2F2F7;
}

/* ── Header ────────────────────────────────────────────────────────────────── */
.catalog-header {
  flex-shrink: 0;
  padding: 16px 24px 14px;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
}
.catalog-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-page-title);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.catalog-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #6B7280;
  margin: 4px 0 0 0;
}
.catalog-count-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #9CA3AF;
  background: rgba(241, 245, 249, 0.8);
  padding: 5px 12px;
  border-radius: 9999px;
  border: 1px solid rgba(229, 229, 234, 0.5);
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
  color: #9CA3AF;
  pointer-events: none;
  transition: color 0.2s;
}
.catalog-search-input {
  width: 100%;
  padding: 11px 42px 11px 42px;
  border-radius: 12px;
  border: 1px solid #E5E5EA;
  background: rgba(255, 255, 255, 0.8);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #1A1A1A;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.catalog-search-input::placeholder { color: #9CA3AF; font-weight: 400; }
.catalog-search-input:hover { border-color: #9CA3AF; }
.catalog-search-input:focus {
  border-color: #007AFF;
  box-shadow: 0 0 0 3px rgba(0,122,255,0.1);
}
.catalog-search-wrap:focus-within .catalog-search-icon { color: #007AFF; }
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
  color: #9CA3AF;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.catalog-search-clear:hover { background: #F5F5F5; color: #6B7280; }

/* ── Grid background ───────────────────────────────────────────────────────── */
.mcp-grid-bg {
  background: #F2F2F7;
}

/* ── Grid ──────────────────────────────────────────────────────────────────── */
.mcp-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}
@media (min-width: 1920px) { .mcp-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 2560px) { .mcp-grid { grid-template-columns: repeat(4, 1fr); } }

/* ── Card ──────────────────────────────────────────────────────────────────── */
.mcp-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.mcp-card:hover {
  transform: translateY(-3px);
  border-color: #D1D1D6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.mcp-card:active { transform: translateY(-1px); transition-duration: 0.1s; }
.mcp-card-accent { height: 4px; width: 100%; flex-shrink: 0; }
.mcp-card-body { padding: 20px 20px 16px; display: flex; flex-direction: column; flex: 1; }

/* ── Default row — top of card body ───────────────────────────────────────── */
.mcp-card-default-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid #E5E5EA;
}
.mcp-default-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: #9CA3AF;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.mcp-card-title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.mcp-card-icon {
  width: 36px; height: 36px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.mcp-card-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mcp-runtime-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
}
.mcp-runtime-badge.running {
  background: #E8F8EF;
  color: #248A3D;
}
.mcp-runtime-badge.stopped {
  background: #F5F5F5;
  color: #9CA3AF;
}
.mcp-runtime-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.mcp-runtime-badge.running .mcp-runtime-dot {
  background: #34C759;
}
.mcp-runtime-badge.stopped .mcp-runtime-dot {
  background: #D1D1D6;
}

.mcp-card-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #6B7280;
  line-height: 1.55;
  margin: 0 0 14px;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mcp-card-footer {
  border-top: 1px solid #E5E5EA;
  padding-top: 12px;
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mcp-card-endpoint {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-caption);
  color: #9CA3AF;
  display: flex; align-items: center; gap: 5px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 100%;
}

/* ═══ Modal ═══════════════════════════════════════════════════════════════════ */
.mcp-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  animation: mcp-backdrop-in 0.2s ease-out;
}
@keyframes mcp-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
.mcp-modal {
  width: min(640px, 95vw); max-height: 85vh;
  background: #0F0F0F; border: 1px solid #2A2A2A; border-radius: 20px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column; overflow: hidden;
  animation: mcp-modal-in 0.2s ease-out;
}
@keyframes mcp-modal-in {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.mcp-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid #1F1F1F;
}
.mcp-modal-header-left { display: flex; align-items: center; gap: 10px; }
.mcp-modal-header-icon {
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.mcp-modal-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-subtitle);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.mcp-modal-close {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #6B7280;
  cursor: pointer; transition: all 0.15s;
}
.mcp-modal-close:hover { background: #1F1F1F; color: #FFFFFF; }
.mcp-modal-body {
  flex: 1; overflow-y: auto; padding: 24px;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.save-error {
  display: flex; align-items: center; gap: 8px; margin: 0 24px 0;
  padding: 10px 14px; border-radius: var(--radius-sm, 8px);
  background: rgba(255,59,48,0.1); border: 1px solid rgba(255,59,48,0.3);
  color: #FF6B6B; font-size: var(--fs-secondary, 0.875rem); font-family: 'Inter', sans-serif;
}
.mcp-modal-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  padding: 16px 24px; border-top: 1px solid #1F1F1F; background: #0A0A0A;
}
/* ── Form fields ───────────────────────────────────────────────────────────── */
.form-group { margin-bottom: 16px; }
.form-label {
  display: block; font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary); font-weight: 600; color: #9CA3AF; margin-bottom: 6px;
}
.form-input {
  width: 100%; padding: 9px 12px; border-radius: 8px;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  color: #FFFFFF; outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-input:focus { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(75, 85, 99, 0.2); }
.form-input::placeholder { color: #4B5563; }
.form-input-sm {
  width: 100%; padding: 7px 10px; border-radius: 6px;
  border: 1px solid #2A2A2A; background: #111111;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #FFFFFF; outline: none; transition: border-color 0.15s;
}
.form-input-sm:focus { border-color: #4B5563; }
.form-input-sm::placeholder { color: #4B5563; }
.form-textarea {
  width: 100%; padding: 8px 10px; border-radius: 6px;
  border: 1px solid #2A2A2A; background: #111111;
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: var(--fs-small);
  color: #FFFFFF; outline: none; resize: vertical; transition: border-color 0.15s;
}
.form-textarea:focus { border-color: #4B5563; }
.form-textarea::placeholder { color: #4B5563; }
.form-hint {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  color: #4B5563; margin: 4px 0 0;
}

/* ── Environment variables ─────────────────────────────────────────────────── */
.env-section { margin-top: 8px; padding-top: 16px; border-top: 1px solid #1F1F1F; }
.env-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
}
.env-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.env-add-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 12px; border-radius: 6px;
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 600;
  background: #1A1A1A; color: #9CA3AF; border: 1px solid #2A2A2A;
  cursor: pointer; transition: all 0.15s;
}
.env-add-btn:hover { background: #222222; color: #FFFFFF; border-color: #374151; }
.env-empty {
  padding: 20px; border-radius: 10px;
  background: #1A1A1A; border: 1.5px dashed #2A2A2A; text-align: center;
}
.env-empty p {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: #4B5563; margin: 0;
}
.env-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.env-remove-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px; border: none; background: none;
  color: #4B5563; cursor: pointer; flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.env-remove-btn:hover { background: rgba(239,68,68,0.15); color: #EF4444; }

/* ── Test Connection ───────────────────────────────────────────────────────── */
.test-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid #1F1F1F; }

.test-result { margin-top: 12px; padding: 12px 14px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); }
.test-result.success { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); }
.test-result.error { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.test-result-title { font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600; margin: 0 0 8px; }
.test-result.success .test-result-title { color: #FFFFFF; }
.test-result.error .test-result-title { color: #FF6B6B; }
.test-result-error {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #FF6B6B; margin: 0; word-break: break-word;
}
.test-tools-list { display: flex; flex-direction: column; gap: 4px; }
.test-tool-item { display: flex; align-items: baseline; gap: 8px; padding: 4px 0; }
.test-tool-name {
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: var(--fs-small);
  font-weight: 600; color: #FFFFFF; flex-shrink: 0;
}
.test-tool-desc {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); color: rgba(255,255,255,0.6);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }

/* ── Default toggle switch ──────────────────────────────────────────────────── */
.default-toggle {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}
.default-toggle input { display: none; }
.default-toggle-track {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 10px;
  background: #D1D1D6;
  transition: background 0.2s;
}
.default-toggle input:checked + .default-toggle-track {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
}
.default-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #FFFFFF;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: transform 0.2s;
}
.default-toggle input:checked + .default-toggle-track .default-toggle-thumb {
  transform: translateX(14px);
}

/* ── Reduced motion ─────────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .mcp-card { transition: none; }
  .mcp-card:hover { transform: none; }
  .spin { animation: none; }
  .mcp-backdrop, .mcp-modal { animation: none; }
  .default-toggle-track, .default-toggle-thumb { transition: none; }
}
</style>

