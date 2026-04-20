<template>
  <div class="h-full flex flex-col overflow-hidden mcp-page">

    <!-- Header -->
    <div class="catalog-header">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div>
          <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <h1 class="catalog-title">{{ t('mcp.title') }}</h1>
            <span class="catalog-count-badge">{{ mcpStore.servers.length }}</span>
            <span class="catalog-assignment-hint">
              <svg class="catalog-assignment-hint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span class="catalog-assignment-hint-text">{{ t('mcp.needsAssignmentInfo') }}</span>
              <router-link to="/agents" class="catalog-assignment-hint-link">{{ t('common.goAssign') }} &rarr;</router-link>
            </span>
          </div>
          <p class="catalog-subtitle">
            {{ t('mcp.subtitle') }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <AppTooltip :text="t('common.refresh')">
            <AppButton size="icon" @click="refreshServers" :loading="refreshing">
              <svg v-if="!refreshing" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </AppButton>
          </AppTooltip>
          <AppTooltip :text="t('mcp.addServer')">
            <AppButton size="icon" @click="openAdd">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </AppButton>
          </AppTooltip>
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
          :placeholder="t('mcp.searchServers')"
          class="catalog-search-input"
        />
        <span v-if="searchQuery" class="catalog-search-clear" @click="searchQuery = ''">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </span>
      </div>

    </div>

    <!-- Empty state -->
    <div v-if="mcpStore.servers.length === 0" class="flex-1 flex items-center justify-center mcp-grid-bg">
      <EmptyStateGuide
        :title="t('mcp.noServers')"
        :description="t('mcp.emptyGuideDesc')"
        :useCases="[t('mcp.emptyGuideUseCase1'), t('mcp.emptyGuideUseCase2'), t('mcp.emptyGuideUseCase3')]"
        :ctaLabel="t('mcp.createViaChat')"
        @create="startChatGuide(t('mcp.emptyGuideChatMsg'), t('mcp.title'))"
      >
        <template #icon>
          <svg style="width:1.5rem;height:1.5rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </template>
      </EmptyStateGuide>
    </div>

    <!-- No search results -->
    <div v-else-if="filteredServers.length === 0 && searchQuery" class="flex-1 flex items-center justify-center mcp-grid-bg">
      <div class="text-center">
        <svg class="mx-auto" style="width:40px;height:40px;color:#9CA3AF;margin-bottom:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#6B7280; margin:0 0 4px;">{{ t('mcp.noServersMatch', { query: searchQuery }) }}</p>
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF; margin:0;">{{ t('skills.clearSearch') }}</p>
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

              <!-- Test connection row -->
              <div class="mcp-card-test-row">
                <template v-if="cardTests[server.id]?.status === 'testing'">
                  <span class="mcp-card-countdown">
                    <svg class="spin" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    {{ cardTests[server.id].countdown }}s
                  </span>
                  <button class="mcp-card-stop-btn" @click="stopCardTest(server.id, $event)">
                    <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                    {{ t('common.stop') }}
                  </button>
                </template>
                <button v-else class="mcp-card-test-btn" @click="runCardTest(server, $event)">
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  {{ t('mcp.testConnection') }}
                </button>
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
              <h2 class="mcp-modal-title">{{ editingServer ? t('mcp.editServerTitle') : t('mcp.addServer') }}</h2>
            </div>
            <button class="mcp-modal-close" @click="closeModal">
              <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          <!-- Modal body -->
          <div class="mcp-modal-body">
            <!-- Server details -->
            <div class="form-group">
              <label class="form-label">{{ t('mcp.formName') }} *</label>
              <input v-model="form.name" type="text" class="form-input" placeholder="my-mcp-server" />
              <p class="form-hint">{{ t('mcp.formNameHint') }}</p>
            </div>

            <div class="form-group">
              <label class="form-label">{{ t('mcp.formDescription') }}</label>
            </div>
            <section class="mcp-modal-desc-section">
              <textarea v-model="form.description" class="form-textarea mcp-modal-desc-textarea" :placeholder="t('mcp.formDescriptionPlaceholder')"></textarea>
            </section>

            <!-- Transport type toggle -->
            <div class="form-group">
              <label class="form-label">{{ t('mcp.formTransport') }}</label>
              <div class="transport-toggle">
                <button
                  class="transport-btn"
                  :class="{ active: form.transportType === 'stdio' }"
                  @click="form.transportType = 'stdio'"
                  type="button"
                >
                  <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                  stdio
                </button>
                <button
                  class="transport-btn"
                  :class="{ active: form.transportType === 'http' }"
                  @click="form.transportType = 'http'"
                  type="button"
                >
                  <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  HTTP / SSE
                </button>
              </div>
              <p class="form-hint">{{ t('mcp.formTransportHint') }}</p>
            </div>

            <!-- HTTP: URL field -->
            <div v-if="form.transportType === 'http'" class="form-group">
              <label class="form-label">{{ t('mcp.formUrl') }} *</label>
              <input v-model="form.url" type="url" class="form-input" placeholder="https://your-mcp-server.example.com/mcp" />
              <p class="form-hint">{{ t('mcp.formUrlHint') }}</p>
            </div>

            <!-- stdio: Command + Args -->
            <template v-if="form.transportType === 'stdio'">
              <div class="form-group">
                <label class="form-label">{{ t('mcp.formCommand') }} *</label>
                <input v-model="form.command" type="text" class="form-input" placeholder="npx" />
                <p class="form-hint">{{ t('mcp.formCommandHint') }}</p>
              </div>

              <div class="form-group">
                <label class="form-label">{{ t('mcp.formArgs') }}</label>
                <textarea
                  v-model="form.argsText"
                  class="form-textarea"
                  rows="3"
                  placeholder="-y
@modelcontextprotocol/server-everything"
                ></textarea>
                <p class="form-hint">{{ t('mcp.formArgsHint') }}</p>
              </div>
            </template>

            <!-- Environment Variables -->
            <div class="env-section">
              <div class="env-header">
                <h3 class="env-title">{{ t('mcp.formEnvVars') }}</h3>
                <button class="env-add-btn" @click="addEnvVar">
                  <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {{ t('common.add') }}
                </button>
              </div>

              <div v-if="form.envVars.length === 0" class="env-empty">
                <p>{{ t('mcp.formEnvEmpty') }}</p>
              </div>

              <div v-for="(ev, idx) in form.envVars" :key="idx" class="env-row">
                <input v-model="ev.key" type="text" class="form-input-sm" placeholder="KEY" style="flex:1;" />
                <input v-model="ev.value" type="text" class="form-input-sm" placeholder="value..." style="flex:2;" />
                <button class="env-remove-btn" @click="removeEnvVar(idx)">
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
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
                {{ t('common.delete') }}
              </AppButton>
            </div>
            <AppButton variant="secondary" size="modal" @click="closeModal">{{ t('common.cancel') }}</AppButton>
            <AppButton size="modal" @click="saveForm" :disabled="!form.name?.trim() || (form.transportType === 'http' ? !form.url?.trim() : !form.command?.trim())">{{ t('common.save') }}</AppButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Test Result Dialog (from card-level test) -->
    <Teleport to="body">
      <div v-if="testResultDialogId && cardTests[testResultDialogId]" class="mcp-backdrop">
        <div class="mcp-test-dialog" role="dialog" aria-modal="true">
          <div class="mcp-test-dialog-header">
            <h3 class="mcp-test-dialog-title">{{ t('mcp.testConnection') }}</h3>
            <button class="mcp-modal-close" @click="closeTestResultDialog">
              <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <div class="mcp-test-dialog-body">
            <div v-if="cardTests[testResultDialogId]?.status === 'success'" class="test-result success">
              <p class="test-result-title">{{ t('mcp.testSuccess') }} - {{ cardTests[testResultDialogId].tools.length }} {{ t('mcp.toolsDiscovered') }}:</p>
              <div class="test-tools-list">
                <div v-for="tool in cardTests[testResultDialogId].tools" :key="tool.name" class="test-tool-item">
                  <span class="test-tool-name">{{ tool.name }}</span>
                  <span v-if="tool.description" class="test-tool-desc">{{ tool.description }}</span>
                </div>
              </div>
            </div>
            <div v-if="cardTests[testResultDialogId]?.status === 'error'" class="test-result error">
              <p class="test-result-title">{{ t('mcp.testFailed') }}</p>
              <p class="test-result-error">{{ cardTests[testResultDialogId].error }}</p>
            </div>
          </div>
          <div class="mcp-test-dialog-footer">
            <AppButton variant="secondary" size="modal" @click="closeTestResultDialog">{{ t('common.close') }}</AppButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Delete Modal -->
    <ConfirmModal
      v-if="showConfirmDelete && editingServer"
      :visible="showConfirmDelete && editingServer"
      :title="t('mcp.deleteServer')"
      :message="t('mcp.deleteServerConfirm', { name: editingServer.name })"
      confirm-text="Delete"
      confirm-class="danger"
      @confirm="executeDelete"
      @close="showConfirmDelete = false"
    />

  </div>

  <!-- Preview limit modal -->
  <PreviewLimitModal
    :visible="showPreviewLimitModal"
    :message="previewLimitMessage"
    @close="showPreviewLimitModal = false"
  />
</template>

<script setup>
defineOptions({ inheritAttrs: false })
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
import { useMcpStore } from '../stores/mcp'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import PreviewLimitModal from '../components/common/PreviewLimitModal.vue'
import AppButton from '../components/common/AppButton.vue'
import AppTooltip from '../components/common/AppTooltip.vue'
import { useConfigStore } from '../stores/config'
import { useI18n } from '../i18n/useI18n'
import EmptyStateGuide from '../components/common/EmptyStateGuide.vue'
import { useChatToCreate } from '../composables/useChatToCreate'
import { PREVIEW_LIMITS, isLimitEnforced } from '../utils/guestLimits'

const { t } = useI18n()
const { startChatGuide } = useChatToCreate()

const mcpStore = useMcpStore()
const configStore = useConfigStore()
const refreshing = ref(false)
const showPreviewLimitModal = ref(false)
const previewLimitMessage = ref('')

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

// ── Card-level test connection state (per-server, concurrent) ──
const MCP_TEST_TIMEOUT = 60
const cardTests = reactive({})
const testResultDialogId = ref(null)

const form = ref(emptyForm())

function emptyForm() {
  return {
    name: '',
    description: '',
    transportType: 'stdio',  // 'stdio' | 'http'
    command: '',
    argsText: '',
    url: '',
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
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
})


function openAdd() {
  if (isLimitEnforced() && mcpStore.servers.length >= PREVIEW_LIMITS.maxMcpServers) {
    previewLimitMessage.value = t('limits.maxMcpServers')
    showPreviewLimitModal.value = true
    return
  }
  editingServer.value = null
  form.value = emptyForm()
  saveError.value = ''
  showModal.value = true
}

function openEdit(server) {
  editingServer.value = server
  saveError.value = ''
  form.value = {
    id: server.id,
    name: server.name || '',
    description: server.description || '',
    transportType: server.url ? 'http' : 'stdio',
    command: server.command || '',
    argsText: (server.args || []).join('\n'),
    url: server.url || '',
    envVars: Object.entries(server.env || {}).map(([key, value]) => ({ key, value })),
  }

  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingServer.value = null

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
  const env = Object.fromEntries(
    form.value.envVars
      .filter(ev => ev.key.trim())
      .map(ev => [ev.key.trim(), ev.value])
  )

  const isHttp = form.value.transportType === 'http'
  const args = isHttp ? [] : form.value.argsText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const serverData = {
    id: editingServer.value ? editingServer.value.id : form.value.name.trim(),
    name: form.value.name.trim(),
    description: form.value.description.trim(),
    command: isHttp ? '' : form.value.command.trim(),
    args,
    url: isHttp ? form.value.url.trim() : '',
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

// ── Card-level test functions ──
function _clearCardTimer(id) {
  const t = cardTests[id]
  if (t?.timerId) { clearInterval(t.timerId); t.timerId = null }
}

async function runCardTest(server, event) {
  event.stopPropagation()
  const id = server.id
  if (cardTests[id]?.status === 'testing') return
  cardTests[id] = { status: 'testing', countdown: MCP_TEST_TIMEOUT, tools: [], error: '', timerId: null, rejected: false }
  cardTests[id].timerId = setInterval(() => {
    const t = cardTests[id]
    if (!t || t.status !== 'testing') { _clearCardTimer(id); return }
    t.countdown -= 1
    if (t.countdown <= 0) {
      _clearCardTimer(id)
      t.rejected = true
      t.status = 'error'
      t.error = `Connection timed out after ${MCP_TEST_TIMEOUT}s`
      testResultDialogId.value = id
    }
  }, 1000)
  const s = JSON.parse(JSON.stringify(server))
  const isHttp = !!s.url
  const connConfig = isHttp
    ? { name: s.name || 'test', url: (s.url || '').trim(), env: s.env || {} }
    : { name: s.name || 'test', command: (s.command || '').trim(), args: s.args || [], env: s.env || {} }
  try {
    const result = await mcpStore.testConnection(connConfig)
    const t = cardTests[id]
    if (!t || t.rejected) return
    _clearCardTimer(id)
    if (result.success) { t.status = 'success'; t.tools = result.tools || [] }
    else { t.status = 'error'; t.error = result.error || 'Unknown error' }
    testResultDialogId.value = id
  } catch (err) {
    const t = cardTests[id]
    if (!t || t.rejected) return
    _clearCardTimer(id)
    t.status = 'error'
    t.error = err.message || 'Failed to test connection'
    testResultDialogId.value = id
  }
}

function stopCardTest(serverId, event) {
  event.stopPropagation()
  const t = cardTests[serverId]
  if (!t) return
  _clearCardTimer(serverId)
  t.rejected = true
  testResultDialogId.value = null
  delete cardTests[serverId]
}

function stopAllCardTests() {
  for (const id of Object.keys(cardTests)) { _clearCardTimer(id); delete cardTests[id] }
  testResultDialogId.value = null
}

function closeTestResultDialog() {
  const id = testResultDialogId.value
  testResultDialogId.value = null
  if (id && cardTests[id]) delete cardTests[id]
}

onBeforeUnmount(() => stopAllCardTests())

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
  padding: 1rem 1.5rem 0.875rem;
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
  margin: 0.25rem 0 0 0;
}
.catalog-assignment-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  background: #FEF3C7;
  border: 1px solid #FCD34D;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 500;
  color: #92400E;
  line-height: 1.3;
  white-space: nowrap;
}
.catalog-assignment-hint-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: #B45309;
}
.catalog-assignment-hint-text {
  white-space: nowrap;
}
.catalog-assignment-hint-link {
  padding: 0.0625rem 0.375rem;
  margin-left: 0.125rem;
  border-radius: 9999px;
  color: #92400E;
  text-decoration: none;
  font-weight: 600;
  transition: background 0.15s;
}
.catalog-assignment-hint-link:hover {
  background: rgba(180, 83, 9, 0.18);
}
.catalog-count-badge {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  padding: 0.1875rem 0.5rem;
  border-radius: 9999px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  line-height: 1.4;
}
/* ── Search bar ────────────────────────────────────────────────────────────── */
.catalog-search-wrap {
  position: relative;
  margin-top: 0.875rem;
}
.catalog-search-icon {
  position: absolute;
  left: 0.875rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.125rem;
  height: 1.125rem;
  color: #9CA3AF;
  pointer-events: none;
  transition: color 0.2s;
}
.catalog-search-input {
  width: 100%;
  padding: 0.6875rem 2.625rem 0.6875rem 2.625rem;
  border-radius: 0.75rem;
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
  border-color: #1A1A1A;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
}
.catalog-search-wrap:focus-within .catalog-search-icon { color: #1A1A1A; }
.catalog-search-clear {
  position: absolute;
  right: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.625rem;
  height: 1.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
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
  grid-template-columns: repeat(4, 1fr);
  gap: 1.25rem;
}
@media (max-width: 1100px) { .mcp-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 800px) { .mcp-grid { grid-template-columns: repeat(2, 1fr); } }

/* ── Card ──────────────────────────────────────────────────────────────────── */
.mcp-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 1rem;
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
  transform: translateY(-0.1875rem);
  border-color: #D1D1D6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.mcp-card:active { transform: translateY(-0.0625rem); transition-duration: 0.1s; }
.mcp-card-accent { height: 4px; width: 100%; flex-shrink: 0; }
.mcp-card-body { padding: 1.25rem 1.25rem 1rem; display: flex; flex-direction: column; flex: 1; }

.mcp-card-title-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.875rem; }
.mcp-card-icon {
  width: 2.25rem; height: 2.25rem;
  border-radius: 0.75rem;
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
  gap: 0.25rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 0.375rem;
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
  width: 0.375rem;
  height: 0.375rem;
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
  margin: 0 0 0.875rem;
  flex: 1;
}

.mcp-modal-desc-section {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
}
.mcp-modal-desc-textarea {
  flex: 1;
  min-height: 10.5vh;
  resize: vertical;
  font-size: var(--fs-body);
  background: #18181A;
  color: #fff;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  padding: 1rem;
  box-sizing: border-box;
  overflow-y: auto;
  font-family: 'Inter', sans-serif;
  line-height: 1.6;
}
/* ── Card test row ─────────────────────────────────────────────────────────── */
.mcp-card-test-row {
  border-top: 1px solid #E5E5EA; padding-top: 0.5rem; margin-top: auto;
  display: flex; align-items: center; justify-content: flex-end; gap: 0.75rem;
}
.mcp-card-test-btn {
  display: inline-flex; align-items: center; gap: 0.375rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 600;
  color: #fff; background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none; cursor: pointer; padding: 0.3125rem 0.875rem; border-radius: 0.5rem;
  transition: all 0.15s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.mcp-card-test-btn:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); box-shadow: 0 2px 12px rgba(0,0,0,0.18); }
.mcp-card-test-btn:active { transform: scale(0.97); }
.mcp-card-countdown {
  display: inline-flex; align-items: center; gap: 0.375rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: var(--fs-caption); font-weight: 600; color: #6B7280;
}
.mcp-card-stop-btn {
  display: inline-flex; align-items: center; gap: 0.375rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 600;
  color: #fff; background: #dc2626; border: none; cursor: pointer;
  padding: 0.3125rem 0.875rem; border-radius: 0.5rem;
  transition: all 0.15s ease; box-shadow: 0 2px 8px rgba(220,38,38,0.2);
}
.mcp-card-stop-btn:hover { background: #b91c1c; box-shadow: 0 2px 12px rgba(220,38,38,0.3); }
.mcp-card-stop-btn:active { transform: scale(0.97); }

/* ── Test Result Dialog ────────────────────────────────────────────────────── */
.mcp-test-dialog {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: min(32rem, 90vw); max-height: 70vh;
  display: flex; flex-direction: column;
  background: #FFFFFF; border-radius: 1rem;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2), 0 8px 20px rgba(0,0,0,0.12); overflow: hidden;
}
.mcp-test-dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.25rem; border-bottom: 1px solid #E5E5EA;
}
.mcp-test-dialog-title { font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 600; color: #1A1A1A; margin: 0; }
.mcp-test-dialog-body { flex: 1; overflow-y: auto; padding: 1rem 1.25rem; }
.mcp-test-dialog-footer { display: flex; justify-content: flex-end; padding: 0.75rem 1.25rem; border-top: 1px solid #E5E5EA; }

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
  width: min(40rem, 95vw); height: 85vh; max-height: 85vh;
  background: #0F0F0F; border: 1px solid #2A2A2A; border-radius: 1.25rem;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column; overflow: hidden;
  position: relative;
  animation: mcp-modal-in 0.2s ease-out;
}
@keyframes mcp-modal-in {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.mcp-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.25rem; border-bottom: 1px solid #1F1F1F;
}
.mcp-modal-header-left { display: flex; align-items: center; gap: 0.625rem; }
.mcp-modal-header-icon {
  width: 1.875rem; height: 1.875rem; border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.mcp-modal-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-subtitle);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.mcp-modal-close {
  width: 2rem; height: 2rem; border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #6B7280;
  cursor: pointer; transition: all 0.15s;
}
.mcp-modal-close:hover { background: #1F1F1F; color: #FFFFFF; }
.mcp-modal-body {
  flex: 1; min-height: 0; overflow-y: auto; padding: 1.5rem;
   
}
.save-error {
  display: flex; align-items: center; gap: 0.5rem; margin: 0 1.5rem 0;
  padding: 0.625rem 0.875rem; border-radius: var(--radius-sm, 8px);
  background: rgba(255,59,48,0.1); border: 1px solid rgba(255,59,48,0.3);
  color: #FF6B6B; font-size: var(--fs-secondary, 0.875rem); font-family: 'Inter', sans-serif;
}
.mcp-modal-footer {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: flex-end; gap: 0.625rem;
  padding: 1rem 1.5rem; border-top: 1px solid #1F1F1F; background: #0A0A0A;
}
/* ── Form fields ───────────────────────────────────────────────────────────── */
.form-group { margin-bottom: 1rem; }
.form-label {
  display: block; font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary); font-weight: 600; color: #9CA3AF; margin-bottom: 0.375rem;
}
.form-input {
  width: 100%; padding: 0.5625rem 0.75rem; border-radius: 0.5rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  color: #FFFFFF; outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-input:focus { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(75, 85, 99, 0.2); }
.form-input::placeholder { color: #4B5563; }
.form-input-sm {
  width: 100%; padding: 0.4375rem 0.625rem; border-radius: 0.375rem;
  border: 1px solid #2A2A2A; background: #111111;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #FFFFFF; outline: none; transition: border-color 0.15s;
}
.form-input-sm:focus { border-color: #4B5563; }
.form-input-sm::placeholder { color: #4B5563; }
.form-textarea {
  width: 100%; padding: 0.5rem 0.625rem; border-radius: 0.375rem;
  border: 1px solid #2A2A2A; background: #111111;
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: var(--fs-small);
  color: #FFFFFF; outline: none; resize: vertical; transition: border-color 0.15s;
  max-height: 20rem;
}
.form-textarea:focus { border-color: #4B5563; }
.form-textarea::placeholder { color: #4B5563; }
.form-hint {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  color: #4B5563; margin: 0.25rem 0 0;
}

/* ── Transport toggle ──────────────────────────────────────────────────────── */
.transport-toggle {
  display: flex;
  gap: 0.375rem;
  background: #111111;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  padding: 0.25rem;
}
.transport-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.3125rem;
  border: none;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #4B5563;
  cursor: pointer;
  transition: all 0.15s;
}
.transport-btn:hover { color: #9CA3AF; }
.transport-btn.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}

/* ── Environment variables ─────────────────────────────────────────────────── */
.env-section { margin-top: 0.5rem; padding-top: 1rem; border-top: 1px solid #1F1F1F; }
.env-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;
}
.env-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.env-add-btn {
  display: flex; align-items: center; gap: 0.25rem;
  padding: 0.3125rem 0.75rem; border-radius: 0.375rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 600;
  background: #1A1A1A; color: #9CA3AF; border: 1px solid #2A2A2A;
  cursor: pointer; transition: all 0.15s;
}
.env-add-btn:hover { background: #222222; color: #FFFFFF; border-color: #374151; }
.env-empty {
  padding: 1.25rem; border-radius: 0.625rem;
  background: #1A1A1A; border: 1.5px dashed #2A2A2A; text-align: center;
}
.env-empty p {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: #4B5563; margin: 0;
}
.env-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
.env-remove-btn {
  width: 1.75rem; height: 1.75rem;
  display: flex; align-items: center; justify-content: center;
  border-radius: 0.375rem; border: none; background: none;
  color: #4B5563; cursor: pointer; flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.env-remove-btn:hover { background: rgba(239,68,68,0.15); color: #EF4444; }

/* ── Test Connection ───────────────────────────────────────────────────────── */

.test-result { margin-top: 0.75rem; padding: 0.75rem 0.875rem; border-radius: 0.625rem; box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); }
.test-result.success { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); }
.test-result.error { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.test-result-title { font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600; margin: 0 0 0.5rem; }
.test-result.success .test-result-title { color: #FFFFFF; }
.test-result.error .test-result-title { color: #FF6B6B; }
.test-result-error {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #FF6B6B; margin: 0; word-break: break-word;
}
.test-tools-list { display: flex; flex-direction: column; gap: 0.25rem; }
.test-tool-item { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.25rem 0; }
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

/* ── Reduced motion ─────────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .mcp-card { transition: none; }
  .mcp-card:hover { transform: none; }
  .spin { animation: none; }
  .mcp-backdrop, .mcp-modal { animation: none; }
}
</style>

