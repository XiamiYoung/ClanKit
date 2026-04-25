<template>
    <div v-show="panelOpen" class="ai-magic-panel" @keydown.escape.stop="onEscape">
      <!-- Selection context badge -->
      <div class="ai-magic-context" :class="{ 'ai-magic-context--selection': hasSelection }">
        <!-- Icon: scissors for selection, file for whole file -->
        <svg v-if="hasSelection" style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
          <line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/>
          <line x1="8.12" y1="8.12" x2="12" y2="12"/>
        </svg>
        <svg v-else style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
        <div class="ai-magic-context-body">
          <span class="ai-magic-context-text">{{ contextLabel }}</span>
          <span v-if="hasSelection" class="ai-magic-context-preview">{{ selectionPreview }}</span>
        </div>
        <button
          v-if="hasSelection"
          class="ai-magic-context-clear"
          @click="$emit('clear-selection')"
          :title="t('notes.clearSelection')"
        >
          <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Conversation area -->
      <div ref="conversationRef" class="ai-magic-conversation" @scroll="onConversationScroll">
        <div v-if="messages.length === 0" class="ai-magic-empty">
          <svg style="width:32px;height:32px;color:#374151;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M15 4V2m0 2v2m0-2h-2m2 0h2"/>
            <path d="M8.5 8.5L5 12l3.5 3.5"/>
            <path d="M9.5 14.5L13 11l-3.5-3.5"/>
            <path d="M20 9l-1.5 1.5"/>
            <path d="M14 15l-1.5 1.5"/>
            <path d="M21 2l-9.5 9.5"/>
          </svg>
          <p class="ai-magic-empty-title">{{ t('notes.askAnything') }}</p>
          <p class="ai-magic-empty-hint">{{ t('notes.askHint') }}</p>
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          class="ai-magic-msg"
          :class="[
            msg.role === 'user' ? 'ai-magic-msg-user' : 'ai-magic-msg-ai',
            msg.type === 'error' ? 'ai-magic-msg-error' : '',
          ]"
        >
          <!-- User message -->
          <div v-if="msg.role === 'user'" class="ai-magic-bubble-user">
            {{ msg.content }}
          </div>

          <!-- AI message -->
          <div v-else class="ai-magic-bubble-ai">
            <div class="ai-magic-ai-content" v-html="renderAiContent(msg.content)"></div>
            <!-- Tool calls + Permission prompts -->
            <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="ai-magic-tools">
              <template v-for="tc in msg.toolCalls" :key="tc._localKey || tc.id || tc.blockId">
                <!-- Permission gate block -->
                <div v-if="tc._permBlock" class="ai-magic-perm-block" :class="{ 'ai-magic-perm-resolved': tc.status !== 'pending' }">
                  <div class="ai-magic-perm-header">
                    <div class="ai-magic-perm-icon"><svg style="width:11px;height:11px;color:#FFFFFF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
                    <span class="ai-magic-perm-title">{{ t('notes.permissionRequired') }}</span>
                    <span v-if="tc.status !== 'pending'" class="ai-magic-perm-badge" :class="tc.status === 'rejected' ? 'badge-rejected' : 'badge-allowed'">
                      {{ tc.status === 'rejected' ? t('notes.rejected') : t('notes.allowed') }}
                    </span>
                  </div>
                  <div class="ai-magic-perm-body">
                    <span class="ai-magic-perm-tool">{{ tc.toolName }}</span>
                    <span v-if="tc.command" class="ai-magic-perm-cmd">{{ tc.command }}</span>
                  </div>
                  <div v-if="tc.status === 'pending'" class="ai-magic-perm-actions">
                    <button class="ai-magic-perm-btn ai-magic-perm-btn-primary" @click="onPermAllow(tc, 'allow_global')">{{ t('notes.allowAll') }}</button>
                    <button class="ai-magic-perm-btn ai-magic-perm-btn-secondary" @click="onPermAllow(tc, 'allow_chat')">{{ t('notes.allow') }}</button>
                    <button class="ai-magic-perm-btn ai-magic-perm-btn-danger" @click="onPermDeny(tc)">{{ t('notes.reject') }}</button>
                  </div>
                </div>
                <!-- Normal tool call -->
                <div v-else class="ai-magic-tool-call">
                  <div class="ai-magic-tool-header" @click="tc._expanded = !tc._expanded">
                    <svg style="width:11px;height:11px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    <span>{{ tc.name }}</span>
                    <svg style="width:10px;height:10px;margin-left:auto;flex-shrink:0;transition:transform 0.15s;" :style="tc._expanded ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                  <pre v-if="tc._expanded && tc.result" class="ai-magic-tool-result">{{ typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2) }}</pre>
                </div>
              </template>
            </div>
            <!-- Streaming cursor -->
            <span v-if="streaming && msg === lastAiMessage && !msg.replacement" class="ai-magic-cursor">|</span>

            <!-- Replacement preview -->
            <div v-if="msg.type === 'edit' && msg.replacement" class="ai-magic-replacement">
              <div class="ai-magic-replacement-header">
                <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                {{ t('notes.replacement') }}
              </div>
              <pre class="ai-magic-replacement-code">{{ msg.replacement }}</pre>
              <!-- Apply-failed hint (stale selection) -->
              <div v-if="msg.applyFailed" class="ai-magic-apply-failed">
                <svg style="width:11px;height:11px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{{ t('notes.applyFailedStale') }}</span>
              </div>
              <!-- Apply / Revert buttons -->
              <div class="ai-magic-replacement-actions">
                <button
                  v-if="!msg.applied"
                  class="ai-magic-apply-btn"
                  @click="$emit('apply', msg.id)"
                >
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {{ t('notes.applyToDoc') }}
                </button>
                <button
                  v-else
                  class="ai-magic-revert-btn"
                  @click="$emit('revert', msg.id)"
                >
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                  </svg>
                  {{ t('notes.revert') }}
                </button>
              </div>
            </div>

            <!-- Tool-edit pill: AI modified the file directly via file_operation -->
            <div v-if="msg.toolEdit" class="ai-magic-tool-edit">
              <div class="ai-magic-tool-edit-header">
                <svg style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <span>{{ msg.toolEdit.reverted ? t('notes.toolEditReverted') : t('notes.toolEditApplied') }}</span>
              </div>
              <div class="ai-magic-replacement-actions">
                <button
                  v-if="!msg.toolEdit.reverted"
                  class="ai-magic-revert-btn"
                  @click="$emit('tool-revert', msg.id)"
                >
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                  </svg>
                  {{ t('notes.revert') }}
                </button>
                <button
                  v-else
                  class="ai-magic-apply-btn"
                  @click="$emit('tool-reapply', msg.id)"
                >
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {{ t('notes.applyToDoc') }}
                </button>
              </div>
            </div>

            <!-- Error indicator -->
            <div v-if="msg.type === 'error'" class="ai-magic-error-badge">
              <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              {{ t('notes.error') }}
            </div>
          </div>
        </div>
      </div>

      <!-- Input area -->
      <div class="ai-magic-input-area">
        <div v-if="streaming" class="ai-magic-stop-row">
          <button class="ai-magic-stop-btn" @click="$emit('stop')">
            <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            {{ t('notes.stop') }}
          </button>
        </div>
        <div class="ai-magic-input-row">
          <textarea
            ref="inputRef"
            v-model="inputText"
            class="ai-magic-textarea"
            :placeholder="t('notes.messagePlaceholder')"
            rows="2"
            :disabled="streaming"
            @keydown.enter.exact.prevent="onSend"
            @input="autoGrow"
          />
          <button
            class="ai-magic-send-btn"
            :disabled="!inputText.trim() || streaming"
            @click="onSend"
            :title="t('notes.sendMessage')"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  panelOpen: { type: Boolean, default: false },
  streaming: { type: Boolean, default: false },
  selectionContext: { type: Object, default: () => ({}) },
  messages: { type: Array, default: () => [] },
  permissionMode: { type: String, default: 'allow_all' },
})

const emit = defineEmits(['close', 'send', 'stop', 'apply', 'revert', 'tool-revert', 'tool-reapply', 'permission-respond', 'clear-selection'])

function onPermAllow(tc, decision) {
  if (tc.status !== 'pending') return
  tc.status = decision === 'allow_global' ? 'allowed_global' : 'allowed'
  emit('permission-respond', { blockId: tc.blockId, decision, command: tc.command })
}

function onPermDeny(tc) {
  if (tc.status !== 'pending') return
  tc.status = 'rejected'
  emit('permission-respond', { blockId: tc.blockId, decision: 'reject', command: tc.command })
}

const inputRef = ref(null)
const conversationRef = ref(null)
const inputText = ref('')

// Auto-scroll state — mirrors the ChatWindow pattern.
// Default ON; user scrolling up disables it; returning to bottom re-enables.
const autoScroll = ref(true)
// Guards against our own programmatic scrolls flipping autoScroll off.
let _programmaticScroll = false
const NEAR_BOTTOM_PX = 24

function _isNearBottom() {
  const el = conversationRef.value
  if (!el) return true
  return (el.scrollHeight - el.scrollTop - el.clientHeight) <= NEAR_BOTTOM_PX
}

function _scrollToBottom() {
  const el = conversationRef.value
  if (!el) return
  _programmaticScroll = true
  el.scrollTop = el.scrollHeight
  // scroll event fires async — clear the flag on the next frame.
  requestAnimationFrame(() => { _programmaticScroll = false })
}

function onConversationScroll() {
  if (_programmaticScroll) return
  autoScroll.value = _isNearBottom()
}

const hasSelection = computed(() => {
  const ctx = props.selectionContext
  return !!(ctx.selectedText && !ctx.isWholeFile)
})

const contextLabel = computed(() => {
  const ctx = props.selectionContext
  if (!ctx.fileName) return ''
  if (!hasSelection.value) {
    const chars = ctx.fullFileContent ? ctx.fullFileContent.length : 0
    return `${t('notes.entireFile')}: ${ctx.fileName}${chars ? ` (${chars} ${t('notes.chars')})` : ''}`
  }
  const lines = ctx.selectedText.split('\n').length
  const chars = ctx.selectedText.length
  const lineStr = lines === 1 ? `1 ${t('notes.lines')}` : `${lines} ${t('notes.lines')}`
  return `${lineStr} · ${chars} ${t('notes.chars')} · ${ctx.fileName}`
})

const selectionPreview = computed(() => {
  const text = props.selectionContext.selectedText || ''
  const firstLine = text.split('\n').find(l => l.trim()) || text
  return firstLine.length > 80 ? firstLine.slice(0, 80) + '…' : firstLine
})

const lastAiMessage = computed(() => {
  for (let i = props.messages.length - 1; i >= 0; i--) {
    if (props.messages[i].role === 'ai') return props.messages[i]
  }
  return null
})

function renderAiContent(content) {
  if (!content) return ''
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

function onSend() {
  if (!inputText.value.trim() || props.streaming) return
  emit('send', inputText.value)
  inputText.value = ''
  nextTick(() => {
    if (inputRef.value) inputRef.value.style.height = 'auto'
  })
}

function onEscape() {
  if (props.streaming) {
    emit('stop')
  } else {
    emit('close')
  }
}

function autoGrow() {
  const ta = inputRef.value
  if (!ta) return
  ta.style.height = 'auto'
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
}


// When a NEW message arrives (array length changes), we want to stick to bottom
// regardless of prior autoScroll state — mirrors chat UX where a new turn
// re-engages follow mode.
watch(() => props.messages.length, async () => {
  autoScroll.value = true
  await nextTick()
  _scrollToBottom()
})

// During streaming (last AI message content grows), only follow if the user
// hasn't scrolled away. Re-entering the bottom area flips autoScroll back on
// via onConversationScroll.
watch(
  () => lastAiMessage.value?.content,
  async () => {
    if (!autoScroll.value) return
    await nextTick()
    _scrollToBottom()
  }
)

// Panel reopening — focus input, jump to bottom, reset follow mode.
watch(() => props.panelOpen, async (v) => {
  if (!v) return
  autoScroll.value = true
  await nextTick()
  inputRef.value?.focus()
  _scrollToBottom()
})

function focusInput() {
  nextTick(() => inputRef.value?.focus())
}

defineExpose({ focusInput })
</script>

<style>
/* ── AI Doc Panel ── */
.ai-magic-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  background: #0F0F0F;
  font-family: 'Inter', sans-serif;
  overflow: hidden;
  flex: 1;
  min-height: 0;
}

/* Selection context badge */
.ai-magic-context {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #1A1A1A;
  color: #6B7280;
  flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s;
}
/* Selection state — amber accent */
.ai-magic-context--selection {
  background: rgba(217, 119, 6, 0.08);
  border-bottom-color: rgba(217, 119, 6, 0.25);
  color: #D97706;
}
.ai-magic-context--selection svg {
  color: #F59E0B;
  margin-top: 2px;
}
.ai-magic-context-body {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  flex: 1;
}
.ai-magic-context-text {
  font-size: var(--fs-caption);
  font-weight: 600;
  color: #9CA3AF;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-magic-context--selection .ai-magic-context-text {
  color: #D97706;
}
.ai-magic-context-preview {
  font-size: 0.6875rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: #6B7280;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(217, 119, 6, 0.2);
  border-left: 2px solid #D97706;
  border-radius: 4px;
  padding: 0.2rem 0.4rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.ai-magic-context-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.125rem;
  height: 1.125rem;
  margin-top: 1px;
  border: 1px solid rgba(217, 119, 6, 0.3);
  border-radius: 9999px;
  background: rgba(217, 119, 6, 0.08);
  color: #D97706;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.ai-magic-context-clear:hover {
  background: rgba(217, 119, 6, 0.18);
  border-color: rgba(217, 119, 6, 0.5);
}

/* Conversation area */
.ai-magic-conversation {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  
  
}

/* Empty state */
.ai-magic-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem 1rem;
  gap: 0.5rem;
}
.ai-magic-empty-title {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #9CA3AF;
  margin: 0;
}
.ai-magic-empty-hint {
  font-size: var(--fs-caption);
  color: #6B7280;
  margin: 0;
  line-height: 1.5;
  max-width: 280px;
}

/* Message bubbles */
.ai-magic-msg { display: flex; }
.ai-magic-msg-user { justify-content: flex-end; }
.ai-magic-msg-ai { justify-content: flex-start; }

.ai-magic-bubble-user {
  max-width: 85%;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem 0.75rem 0.25rem 0.75rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-size: var(--fs-secondary);
  line-height: 1.5;
  word-break: break-word;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.ai-magic-bubble-ai {
  max-width: 90%;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem 0.75rem 0.75rem 0.25rem;
  background: #1A1A1A;
  color: #E5E5EA;
  font-size: var(--fs-secondary);
  line-height: 1.6;
  word-break: break-word;
}
.ai-magic-ai-content { white-space: pre-wrap; word-break: break-word; }

/* Streaming cursor */
.ai-magic-cursor {
  animation: aiMagicBlink 0.8s step-end infinite;
  color: #FFD700;
  font-weight: 700;
}
@keyframes aiMagicBlink { 50% { opacity: 0; } }

/* Replacement block */
.ai-magic-replacement {
  margin-top: 0.5rem;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  overflow: hidden;
}
.ai-magic-replacement-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: #161616;
  color: #9CA3AF;
  font-size: var(--fs-small);
  font-weight: 600;
  border-bottom: 1px solid #2A2A2A;
}
.ai-magic-replacement-code {
  padding: 0.5rem 0.625rem;
  margin: 0;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-caption);
  line-height: 1.6;
  color: #E5E5EA;
  background: #111111;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  
}
.ai-magic-replacement-actions {
  border-top: 1px solid #2A2A2A;
}
.ai-magic-apply-failed {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: rgba(251, 191, 36, 0.08);
  border-top: 1px solid rgba(251, 191, 36, 0.2);
  color: #FBBF24;
  font-size: var(--fs-small);
  line-height: 1.4;
}

/* Tool-edit pill (AI modified file via file_operation, not <replacement>) */
.ai-magic-tool-edit {
  margin-top: 0.5rem;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  overflow: hidden;
}
.ai-magic-tool-edit-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: #161616;
  color: #9CA3AF;
  font-size: var(--fs-small);
  font-weight: 600;
  border-bottom: 1px solid #2A2A2A;
}
.ai-magic-apply-btn,
.ai-magic-revert-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  width: 100%;
  padding: 0.5rem;
  border: none;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.ai-magic-apply-btn {
  background: rgba(16, 185, 129, 0.12);
  color: #10B981;
}
.ai-magic-apply-btn:hover {
  background: rgba(16, 185, 129, 0.22);
  color: #34D399;
}
.ai-magic-revert-btn {
  background: rgba(251, 191, 36, 0.10);
  color: #FBBF24;
}
.ai-magic-revert-btn:hover {
  background: rgba(251, 191, 36, 0.20);
  color: #FCD34D;
}

/* Error badge */
.ai-magic-msg-error .ai-magic-bubble-ai {
  border: 1px solid rgba(239, 68, 68, 0.3);
}
.ai-magic-error-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.375rem;
  font-size: var(--fs-small);
  color: #FF6B6B;
}

/* Input area */
.ai-magic-input-area {
  padding: 0.625rem 0.75rem;
  border-top: 1px solid #2A2A2A;
  background: #0A0A0A;
  flex-shrink: 0;
}
.ai-magic-stop-row { display: flex; justify-content: center; margin-bottom: 0.5rem; }
.ai-magic-stop-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  background: rgba(239, 68, 68, 0.15);
  color: #FF6B6B;
  border: 1px solid rgba(239, 68, 68, 0.3);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.ai-magic-stop-btn:hover { background: rgba(239, 68, 68, 0.25); color: #FF8888; }

.ai-magic-input-row { display: flex; align-items: center; gap: 0.5rem; }
.ai-magic-textarea {
  flex: 1;
  padding: 0.6rem 0.75rem;
  min-height: 3rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  line-height: 1.5;
  resize: none;
  outline: none;
  transition: border-color 0.15s;
  max-height: 120px;
}
.ai-magic-textarea:focus { border-color: #4B5563; }
.ai-magic-textarea::placeholder { color: #4B5563; }
.ai-magic-textarea:disabled { opacity: 0.5; }

.ai-magic-send-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none;
  color: #FFD700;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.ai-magic-send-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.ai-magic-send-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* ── Permission prompt blocks ── */
.ai-magic-perm-block {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  overflow: hidden;
  background: #2C2C2E;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}
.ai-magic-perm-resolved { opacity: 0.55; }
.ai-magic-perm-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem 0.5rem;
}
.ai-magic-perm-icon {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.4375rem;
  background: #FF9F0A;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ai-magic-perm-title {
  font-size: var(--fs-small);
  font-weight: 600;
  color: #FFFFFF;
  flex: 1;
  letter-spacing: -0.01em;
}
.ai-magic-perm-badge {
  font-size: 0.625rem;
  font-weight: 500;
  padding: 0.0625rem 0.375rem;
  border-radius: 9999px;
}
.ai-magic-perm-badge.badge-allowed {
  background: rgba(48, 209, 88, 0.18);
  color: #30D158;
}
.ai-magic-perm-badge.badge-rejected {
  background: rgba(255, 69, 58, 0.15);
  color: #FF453A;
}
.ai-magic-perm-body {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0 0.75rem 0.625rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-small);
  flex-wrap: wrap;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0 0 0 0;
  margin: 0 0.5rem 0.5rem;
  border-radius: 0.375rem;
  padding: 0.375rem 0.5rem;
}
.ai-magic-perm-tool {
  color: #FF9F0A;
  font-weight: 600;
}
.ai-magic-perm-cmd {
  color: #EBEBF5;
  opacity: 0.75;
  word-break: break-all;
}
.ai-magic-perm-actions {
  display: flex;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
.ai-magic-perm-btn {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 600;
  border-radius: 0.4375rem;
  border: 1px solid transparent;
  cursor: pointer;
  padding: 0.275rem 0.5625rem;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.275rem;
}
.ai-magic-perm-btn-primary {
  background: linear-gradient(135deg, #92400E, #B45309);
  color: #FEF3C7;
  box-shadow: 0 1px 4px rgba(180, 83, 9, 0.3);
}
.ai-magic-perm-btn-primary:hover {
  background: linear-gradient(135deg, #A45208, #D97706);
}
.ai-magic-perm-btn-secondary {
  background: linear-gradient(135deg, #065F46, #047857);
  color: #D1FAE5;
  box-shadow: 0 1px 4px rgba(4, 120, 87, 0.3);
}
.ai-magic-perm-btn-secondary:hover {
  background: linear-gradient(135deg, #047857, #059669);
}
.ai-magic-perm-btn-danger {
  background: linear-gradient(135deg, #7F1D1D, #B91C1C);
  color: #FEE2E2;
  box-shadow: 0 1px 4px rgba(185, 28, 28, 0.3);
}
.ai-magic-perm-btn-danger:hover {
  background: linear-gradient(135deg, #991B1B, #DC2626);
}

/* Tool calls */
.ai-magic-tools {
  margin-top: 0.375rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.ai-magic-tool-call {
  border: 1px solid #2A2A2A;
  border-radius: 0.375rem;
  overflow: hidden;
}
.ai-magic-tool-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  background: #161616;
  color: #9CA3AF;
  font-size: var(--fs-small);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.1s;
}
.ai-magic-tool-header:hover { background: #1C1C1C; }
.ai-magic-tool-result {
  padding: 0.375rem 0.5rem;
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-small);
  color: #9CA3AF;
  background: #111;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow-y: auto;
  
  border-top: 1px solid #2A2A2A;
}
</style>

<!-- Unscoped styles for the Teleported agent modal (escapes component DOM) -->
<style>
/* ── AI Doc Agent Modal ── */
.aidoc-modal-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  animation: aidoc-backdrop-in 0.15s ease-out;
}
@keyframes aidoc-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.aidoc-modal {
  width: min(32rem, 90vw);
  max-height: 70vh;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; overflow: hidden;
  animation: aidoc-modal-in 0.18s ease-out;
}
@keyframes aidoc-modal-in {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.aidoc-modal-header {
  display: flex; align-items: center; gap: 0.625rem;
  padding: 0.875rem 1rem 0.75rem;
  border-bottom: 1px solid #1F1F1F;
  flex-shrink: 0;
}
.aidoc-modal-header-icon {
  width: 1.75rem; height: 1.75rem; border-radius: 0.5rem; flex-shrink: 0;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.aidoc-modal-title {
  font-family: 'Inter', sans-serif; font-size: 0.9375rem;
  font-weight: 700; color: #FFFFFF;
}
.aidoc-modal-close {
  margin-left: auto; width: 1.75rem; height: 1.75rem; border-radius: 0.4375rem;
  border: none; background: transparent; color: #6B7280;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s; flex-shrink: 0;
}
.aidoc-modal-close:hover { background: #1F1F1F; color: #FFFFFF; }
.aidoc-modal-body {
  flex: 1; overflow-y: auto;
  padding: 0.5rem;
  display: flex; flex-direction: column; gap: 0.1875rem;
   
}
/* ── Search bar inside agent modal ── */
.ch-modal-search {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #1F1F1F;
  flex-shrink: 0;
}
.ch-modal-search-input {
  flex: 1; background: transparent; border: none; outline: none;
  font-family: 'Inter', sans-serif; font-size: 0.8125rem;
  color: #E5E5EA;
}
.ch-modal-search-input::placeholder { color: #6B7280; }
.ch-modal-empty { padding: 0.75rem; font-size: 0.8125rem; color: #6B7280; text-align: center; }

/* ── Category tree ── */
.ch-cat-section { margin-bottom: 0.125rem; }
.ch-cat-header {
  display: flex; align-items: center; gap: 0.5rem;
  width: 100%; padding: 0.4rem 0.5rem;
  border: none; background: transparent; cursor: pointer;
  border-radius: 0.5rem; font-family: 'Inter', sans-serif;
  transition: background 0.12s;
}
.ch-cat-header:hover { background: #1A1A1A; }
.ch-cat-chevron { color: #6B7280; transition: transform 0.15s; flex-shrink: 0; }
.ch-cat-chevron.expanded { transform: rotate(90deg); }
.ch-cat-emoji { font-size: 0.875rem; }
.ch-cat-name { font-size: 0.8125rem; font-weight: 600; color: #D1D5DB; flex: 1; text-align: left; }
.ch-cat-count {
  font-size: 0.6875rem; color: #6B7280;
  background: #1A1A1A; border-radius: 9999px; padding: 0 0.375rem; line-height: 1.5;
}
.ch-cat-items { padding-left: 0.75rem; }
.ch-cat-empty { padding: 0.375rem 0.5rem; font-size: 0.75rem; color: #6B7280; }

/* ── Agent list items (shared by search results + category items) ── */
.ch-modal-item {
  display: flex; align-items: center; gap: 0.75rem;
  width: 100%; padding: 0.5rem 0.625rem;
  border-radius: 0.625rem; border: 1px solid transparent;
  background: transparent; cursor: pointer;
  font-family: 'Inter', sans-serif;
  transition: all 0.12s; text-align: left;
}
.ch-modal-item:hover { background: #1A1A1A; border-color: #2A2A2A; }
.ch-modal-item.selected {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #374151 100%);
  border-color: #374151;
}
.ch-modal-item-avatar {
  width: 2.5rem; height: 2.5rem; border-radius: 50%; flex-shrink: 0;
  overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1A1A1A 0%, #374151 100%);
}
.ch-modal-avatar-fallback {
  font-family: 'Inter', sans-serif; font-size: 0.9375rem;
  font-weight: 700; color: #fff; user-select: none;
}
.ch-modal-item-text {
  display: flex; flex-direction: column; gap: 0.1875rem;
  min-width: 0; flex: 1;
}
.ch-modal-item-name {
  font-family: 'Inter', sans-serif; font-size: 0.875rem;
  font-weight: 600; color: #E5E5EA;
}
.ch-modal-item.selected .ch-modal-item-name { color: #FFFFFF; }
.ch-modal-item-desc {
  font-family: 'Inter', sans-serif; font-size: 0.75rem;
  font-weight: 400; color: #6B7280; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.ch-modal-item.selected .ch-modal-item-desc { color: rgba(255,255,255,0.5); }

/* Permission modal body (teleported from DocsView) */
.aidoc-perm-modal {
  max-width: 360px;
}
.aidoc-perm-body {
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.aidoc-perm-option {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  padding: 0.625rem 0.75rem;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: all 0.12s ease;
  text-align: left;
  width: 100%;
  color: #9CA3AF;
}
.aidoc-perm-option:hover {
  background: #1A1A1A;
  border-color: #2A2A2A;
}
.aidoc-perm-option.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: #374151;
  color: #FFFFFF;
}
.aidoc-perm-option-label {
  font-size: 0.8125rem;
  font-weight: 600;
  grid-column: 1;
}
.aidoc-perm-option-desc {
  font-size: 0.6875rem;
  color: #6B7280;
  grid-column: 1;
  margin-top: 1px;
}
.aidoc-perm-option.active .aidoc-perm-option-desc {
  color: rgba(255,255,255,0.5);
}
.aidoc-perm-option > svg {
  grid-column: 2;
  grid-row: 1 / 3;
  color: rgba(255,255,255,0.7);
}
</style>
