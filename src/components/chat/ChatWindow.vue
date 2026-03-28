<template>
  <div class="cw-root">
    <!-- Messages area -->
    <div ref="messagesEl" class="cw-messages" @scroll="onScroll">
      <!-- Loading state -->
      <div v-if="chat?.messages === null" class="cw-placeholder">
        <div class="cw-spinner"></div>
        <span class="cw-placeholder-text">{{ t('chats.loadingMessages') }}</span>
      </div>
      <!-- Empty state -->
      <div v-else-if="!chat?.messages?.length" class="cw-placeholder">
        <div class="cw-empty-icon">
          <svg style="width:36px;height:36px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <p class="cw-empty-title">{{ t('chats.startConversation') }}</p>
          <p class="cw-empty-subtitle">{{ t('chats.typeMessageBelow') }}</p>
        </div>
      </div>

      <!-- Message list -->
      <template v-else>
        <!-- Load earlier messages -->
        <div v-if="hasHiddenMessages" class="flex justify-center pb-2">
          <button
            @click="loadMoreMessages"
            :disabled="isLoadingSegment"
            class="px-4 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 cursor-pointer"
            style="background:#F5F5F5; color:#1A1A1A; border:1px solid #E5E5EA;"
            @mouseenter="e => e.currentTarget.style.background='rgba(0,122,255,0.1)'"
            @mouseleave="e => e.currentTarget.style.background='#F5F5F5'"
          >
            <span v-if="isLoadingSegment">{{ t('common.loading') }}</span>
            <span v-else-if="(chat?.messages?.filter(m=>!m.hidden)?.length ?? 0) > visibleLimit">
              {{ t('chats.showEarlier', { count: (chat?.messages?.filter(m=>!m.hidden)?.length ?? 0) - visibleLimit }) }}
            </span>
            <span v-else>{{ t('chats.loadOlder') }}</span>
          </button>
        </div>
        <div
          v-for="msg in visibleMessages"
          :key="msg.id"
          :class="[
            'flex gap-3 cw-animate-fade-in',
            (msg.isWaitingIndicator || msg.role === 'system') ? 'justify-center' : msg.role === 'user' ? 'justify-end' : 'justify-start'
          ]"
        >
          <!-- Pre-response waiting row (between user bubble and first assistant bubble) -->
          <div v-if="msg.isWaitingIndicator" class="cw-pre-response-row" :class="msg.waitingState === 'error' ? 'cw-pre-response-row--error' : ''">
            <div class="cw-pre-response-wave">
              <span
                v-for="n in 5"
                :key="n"
                class="cw-wave-bar"
                :style="`--bar-color:${msg.waitingState === 'error' ? '#ef4444' : '#4c8446'}; --bar-glow:${msg.waitingState === 'error' ? '#ef444480' : '#4c844680'}; animation-delay:${(n-1)*0.13}s;`"
              />
            </div>
            <span v-if="msg.waitingState === 'error'" class="cw-pre-response-error">
              {{ msg.waitingError || t('chats.preResponseFailed') }}
            </span>
            <button
              v-if="msg.waitingState === 'error'"
              class="cw-retry-btn"
              @click="emit('retry-waiting-indicator', msg)"
            >
              <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              {{ t('chats.retry') }}
            </button>
          </div>

          <!-- System info banner (stop/resume/compaction notifications) -->
          <div v-else-if="msg.role === 'system'" class="cw-system-banner"
            :class="msg.compaction ? 'cw-system-banner--compact' : msg.interruptType === 'stop' ? 'cw-system-banner--stop' : msg.interruptType === 'pause' ? 'cw-system-banner--pause' : ''">
            <!-- Compaction icon -->
            <svg v-if="msg.compaction" style="width:13px;height:13px;flex-shrink:0;display:block;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
            <!-- Pause icon -->
            <svg v-else-if="msg.interruptType === 'pause'" style="width:13px;height:13px;flex-shrink:0;display:block;" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
            <!-- Stop icon -->
            <svg v-else-if="msg.interruptType === 'stop'" style="width:13px;height:13px;flex-shrink:0;display:block;" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="5" width="14" height="14" rx="2"/>
            </svg>
            <!-- Fallback info icon -->
            <svg v-else style="width:13px;height:13px;flex-shrink:0;display:block;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <template v-if="msg.compaction">
              <span class="cw-system-banner-text">{{ t('chats.contextCompacted') }}</span>
              <template v-if="msg.tokensBefore && msg.tokensAfter">
                <span class="cw-system-banner-sep">·</span>
                <span class="cw-system-banner-tokens">
                  {{ msg.tokensBefore >= 1000 ? (msg.tokensBefore / 1000).toFixed(1) + 'k' : msg.tokensBefore }}
                  <svg style="width:10px;height:10px;opacity:0.6;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  {{ msg.tokensAfter >= 1000 ? (msg.tokensAfter / 1000).toFixed(1) + 'k' : msg.tokensAfter }}
                  <span style="opacity:0.5;">{{ t('common.tokens') }}</span>
                </span>
              </template>
            </template>
            <span v-else class="cw-system-banner-text">{{ msg.content }}</span>
          </div>

          <!-- Assistant avatar + name chip -->
          <div v-else-if="msg.role === 'assistant'" class="cw-msg-avatar-col"
            @mouseenter="showAvatarTooltip($event, msg)"
            @mouseleave="hideAvatarTooltip"
          >
            <div class="cw-msg-avatar-wrap">
              <img v-if="getSystemAvatar(msg)" :src="getSystemAvatar(msg)" alt="" class="cw-msg-avatar-img" />
              <div v-else class="cw-msg-avatar-fallback system">
                <svg style="width:22px;height:22px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 8V4H8M4 12h16M5 12a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1M9 16h0M15 16h0"/>
                </svg>
              </div>
            </div>
            <span class="cw-msg-name-chip cw-msg-name-chip--assistant">{{ truncateName(getMsgAssistantName(msg)) }}</span>
          </div>

          <!-- Message bubble (not rendered for system banners) -->
          <div
            v-if="!msg.isWaitingIndicator && msg.role !== 'system'"
            :class="[
              'relative group/bubble max-w-[75%]',
              msg.role === 'assistant' ? 'min-w-[50%]' : ''
            ]"
          >
            <!-- Resend button shown when pre-response failed for this user message -->
            <button
              v-if="msg.role === 'user' && hasFailedWaitingAfter(msg.id)"
              class="cw-user-resend-btn"
              @click="$emit('resend-message', msg)"
              :title="getWaitingErrorForUser(msg.id)"
            >
              <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>
              </svg>
              <span>{{ t('chats.resend') }}</span>
            </button>

            <!-- Hover action buttons -->
            <div
              v-if="!msg.streaming"
              class="absolute -top-2 right-1 z-10 flex items-center gap-1 transition-all duration-150"
            >
              <!-- Quote button -->
              <button
                v-if="showQuote && msg.content"
                @click="quoteMessage(msg)"
                class="cw-msg-action-btn"
                :title="t('chats.quoteMessage')"
                :aria-label="t('chats.quoteMessage')"
              >
                <svg class="w-3.5 h-3.5" style="transform:rotate(180deg);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/>
                  <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/>
                </svg>
              </button>
              <!-- Copy button -->
              <button
                v-if="msg.content"
                @click="copyMessage(msg)"
                class="cw-msg-action-btn"
                :title="copiedId === msg.id ? t('chats.messageCopied') : t('chats.copyMessage')"
                :aria-label="t('chats.copyMessage')"
              >
                <svg v-if="copiedId === msg.id" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <svg v-else class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
              <!-- Delete button -->
              <button
                v-if="showDelete"
                @click="$emit('delete-message', msg)"
                class="cw-msg-action-btn cw-msg-action-btn-delete"
                :title="t('chats.deleteMessage')"
                :aria-label="t('chats.deleteMessage')"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
              </button>
            </div>

            <div
              class="cw-msg-bubble"
              :class="[msg.role === 'user' ? 'cw-msg-bubble-user' : msg.isError ? 'cw-msg-bubble-error' : 'cw-msg-bubble-assistant', shakingIds.has(msg.id) ? 'bubble-shake' : '']"
            >
              <!-- Error indicator bar -->
              <div v-if="msg.isError" class="cw-error-indicator">
                <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{{ formatErrorLabel(msg) }}</span>
                <span v-if="msg.errorDetail" class="cw-error-info" :data-tooltip="msg.errorDetail">
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                </span>
              </div>
              <div v-if="msg.isWaitingIndicator" class="cw-thinking">
                <span style="font-size:0.75rem; color:#6B7280; margin-right:8px;">{{ t('chats.waitingForResponse') }}</span>
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              </div>
              <div v-else-if="msg.streaming && (!msg.content && (!msg.segments || msg.segments.length === 0))" class="cw-thinking">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              </div>
              <div :class="msg.role === 'user' ? 'user-content' : 'prose-clankai'">
                <MessageRenderer :message="msg" @quote-image="emit('quote-image', $event)" />
              </div>
              <PlanCard
                v-if="msg.planData"
                :plan="msg.planData"
                :state="msg.planState || 'pending'"
                @approve="props.onApprovePlan?.(msg)"
                @refine="props.onRefinePlan?.(msg)"
                @reject="props.onRejectPlan?.(msg)"
              />
            </div>
            <div
              class="cw-msg-timestamp"
              :style="msg.role === 'user' ? 'text-align:right;' : 'text-align:left;'"
            >
              {{ formatTime(msg.timestamp) }}
            </div>
          </div>

          <!-- User avatar + name chip (per-message: preserves original user agent after switch) -->
          <div v-if="msg.role === 'user'" class="cw-msg-avatar-col"
            @mouseenter="showAvatarTooltip($event, msg)"
            @mouseleave="hideAvatarTooltip"
          >
            <div class="cw-msg-avatar-wrap">
              <img v-if="getUserAvatar(msg)" :src="getUserAvatar(msg)" alt="" class="cw-msg-avatar-img" />
              <div v-else class="cw-msg-avatar-fallback user">
                <svg style="width:22px;height:22px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
            </div>
            <span class="cw-msg-name-chip cw-msg-name-chip--user">{{ truncateName(getMsgUserName(msg)) }}</span>
          </div>
        </div>
      </template>

    </div>

    <!-- Input area: use default slot for custom input, or built-in basic input -->
    <slot name="input" :isRunning="isRunning" :inputText="defaultInputText" :sendMessage="defaultSend" :stopChat="defaultStop">
      <div class="cw-input-area">
        <!-- Quote preview -->
        <div
          v-if="quotedMessage"
          class="flex items-start gap-2 px-3 py-2"
          style="background:rgba(0,122,255,0.06); border-bottom:1px solid #E5E5EA;"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 mb-0.5">
              <svg class="w-3.5 h-3.5 shrink-0" style="color:#1A1A1A;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/>
                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/>
              </svg>
              <span style="font-size:var(--fs-small); font-weight:600; color:#0056CC;">
                {{ getQuotedSenderName(quotedMessage) }}
              </span>
            </div>
            <p class="truncate" style="font-size:var(--fs-secondary); color:#6B7280; margin:0;">
              {{ quotedMessage.content?.slice(0, 150) }}{{ (quotedMessage.content?.length ?? 0) > 150 ? '...' : '' }}
            </p>
          </div>
          <button
            @click="clearQuote"
            class="w-5 h-5 rounded flex items-center justify-center shrink-0 cursor-pointer"
            style="color:#9CA3AF; background:none; border:none;"
            @mouseenter="e => e.currentTarget.style.color='#1A1A1A'"
            @mouseleave="e => e.currentTarget.style.color='#9CA3AF'"
            :aria-label="t('chats.removeQuote')"
            :title="t('chats.removeQuote')"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <!-- Attachment preview strip: image thumbnails only -->
        <div v-if="attachments.some(a => a.type === 'image' && a.preview)" class="cw-attachments">
          <template v-for="att in attachments" :key="att.id">
            <div v-if="att.type === 'image' && att.preview" class="cw-att-thumb">
              <img :src="att.preview" :alt="att.name" style="width:100%;height:100%;object-fit:cover;display:block;" />
              <button class="cw-att-remove" @click="removeAttachment(att.id)" :title="t('common.remove')">
                <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </template>
        </div>
        <div class="cw-input-box" :class="{ focused: inputFocused }">
          <!-- Attach button -->
          <button
            @click="pickFiles"
            :disabled="isRunning"
            class="cw-btn attach"
            :aria-label="t('chats.attachFiles')"
            :title="t('chats.attachFiles')"
          >
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          <textarea
            ref="inputEl"
            v-model="defaultInputText"
            @keydown="onKeydown"
            @focus="inputFocused = true"
            @blur="inputFocused = false"
            :placeholder="t('chats.placeholder')"
            rows="2"
            class="cw-textarea"
          />
          <!-- Stop -->
          <template v-if="isRunning">
            <button @click.stop="defaultStop" class="cw-btn stop" :aria-label="t('chats.stopGenerating')" :title="t('chats.stopAndClear')">
              <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
          </template>
          <!-- Send -->
          <button
            @click.stop="defaultSend"
            :disabled="!defaultInputText.trim() && attachments.length === 0"
            class="cw-btn send"
            :class="{ active: defaultInputText.trim() || attachments.length > 0 }"
            :aria-label="t('chats.sendMessageBtn')"
            :title="isRunning ? t('chats.queueMessage') : t('chats.sendMessageBtn')"
          >
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </slot>
  </div>

  <!-- Floating agent tooltip (Teleport to body so it escapes overflow) -->
  <Teleport to="body">
    <div
      v-if="avatarTooltip.visible"
      class="cw-avatar-tooltip-fixed"
      :style="{ top: avatarTooltip.y + 'px', left: avatarTooltip.x + 'px' }"
    >
      <div class="cw-avatar-tooltip-name">{{ avatarTooltip.name }}<span v-if="avatarTooltip.providerModel" class="cw-avatar-tooltip-pm">({{ avatarTooltip.providerModel }})</span></div>
      <div v-if="avatarTooltip.desc" class="cw-avatar-tooltip-desc">{{ avatarTooltip.desc }}</div>
    </div>
  </Teleport>

  <!-- Error detail dialog -->
  <Teleport to="body">
    <div v-if="errorDialogText" class="cw-error-dialog-backdrop">
      <div class="cw-error-dialog">
        <div class="cw-error-dialog-header">
          <h3 class="cw-error-dialog-title">{{ t('chats.agentError') }}</h3>
          <button class="cw-error-dialog-close" @click="errorDialogText = null">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div class="cw-error-dialog-body">
          <pre class="cw-error-dialog-text">{{ errorDialogText }}</pre>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useChatsStore } from '../../stores/chats'
import { useAgentsStore } from '../../stores/agents'
import { useConfigStore } from '../../stores/config'
import { useI18n } from '../../i18n/useI18n'
import { getAvatarDataUri } from '../agents/agentAvatars'
import MessageRenderer from './MessageRenderer.vue'
import PlanCard from './PlanCard.vue'

const props = defineProps({
  chatId: { type: String, required: true },
  showQuote: { type: Boolean, default: false },
  showDelete: { type: Boolean, default: false },
  onApprovePlan: { type: Function, default: null },
  onRejectPlan:  { type: Function, default: null },
  onRefinePlan:  { type: Function, default: null },
})

const emit = defineEmits(['send', 'stop', 'quote', 'delete-message', 'send-with-attachments', 'resend-message', 'quote-image', 'retry-waiting-indicator'])

const chatsStore = useChatsStore()
const agentsStore = useAgentsStore()
const configStore = useConfigStore()
const { t } = useI18n()

const messagesEl = ref(null)
const inputEl = ref(null)
const errorDialogText = ref(null)
const inputFocused = ref(false)
const defaultInputText = ref('')
const copiedId = ref(null)
const attachments = ref([])
const userScrolled = ref(false)
let programmaticScrollCount = 0
const visibleLimit = ref(25)
const quotedMessage = ref(null)

const chat = computed(() => chatsStore.chats.find(c => c.id === props.chatId) || null)
const isRunning = computed(() => chat.value?.isRunning ?? false)

// ── Bubble shake animation ──
const shakingIds = ref(new Set())
function triggerShake(id) {
  shakingIds.value = new Set([...shakingIds.value, id])
  setTimeout(() => {
    shakingIds.value = new Set([...shakingIds.value].filter(x => x !== id))
  }, 600)
}

// ── Agent helpers ──
function getAvatarUri(agent) {
  if (!agent?.avatar) return null
  return getAvatarDataUri(agent.avatar)
}

// Resolve the agent ID for an assistant message.
// Honour msg.agentId first — this preserves the original agent's avatar/name for
// historical messages after an agent switch. Only fall back to the current agent
// when the original agent no longer exists in the store.
function resolveAgentPid(msg) {
  if (msg.agentId) {
    const agent = agentsStore.getAgentById(msg.agentId)
    if (agent) return msg.agentId
  }
  // Fallback: current active agent
  return systemAgentIds.value[0]
}

function getSystemAvatar(msg) {
  const pid = resolveAgentPid(msg)
  const agent = pid ? agentsStore.getAgentById(pid) : agentsStore.defaultSystemAgent
  return getAvatarUri(agent)
}

function truncateName(name, max = 30) {
  return name && name.length > max ? name.slice(0, max) + '…' : name
}

function getMsgAssistantName(msg) {
  const pid = resolveAgentPid(msg)
  const agent = pid ? agentsStore.getAgentById(pid) : null
  return agent?.name || msg.agentName || 'Assistant'
}

function getMsgAssistantProviderModel(msg) {
  const pid = resolveAgentPid(msg)
  if (!pid) return ''
  const agent = agentsStore.getAgentById(pid)
  if (!agent) return ''
  const override = chat.value?.agentModelOverrides?.[pid] || chat.value?.personaModelOverrides?.[pid]
  const providerId = override?.provider || agent.providerId
  const modelId = override?.model || agent.modelId
  if (!providerId && !modelId) return ''
  const providers = configStore.config?.providers || []
  const found = providers.find(p => p.id === providerId || p.type === providerId)
  const providerName = found?.alias || found?.name || found?.type || providerId || ''
  const modelShort = modelId ? modelId.split('/').pop().split(':')[0] : ''
  if (providerName && modelShort) return `${providerName} / ${modelShort}`
  return providerName || modelShort
}

// Resolve user agent for a specific message — honours msg.userAgentId for historical
// messages so switched-out user agents keep their original avatar/name.
function resolveUserAgent(msg) {
  if (msg.userAgentId) {
    const agent = agentsStore.getAgentById(msg.userAgentId)
    if (agent) return agent
  }
  // Fallback: current chat-level user agent
  const id = chat.value?.userAgentId
  return id ? agentsStore.getAgentById(id) : agentsStore.defaultUserAgent
}

function getUserAvatar(msg) {
  return getAvatarUri(resolveUserAgent(msg))
}

function getMsgUserName(msg) {
  return resolveUserAgent(msg)?.name || 'User'
}

// Current user agent (for messages without userAgentId stamp)
const userAgent = computed(() => {
  const id = chat.value?.userAgentId
  return id ? agentsStore.getAgentById(id) : agentsStore.defaultUserAgent
})

const systemAgentIds = computed(() => {
  const c = chat.value
  if (!c) return []
  if (c.groupAgentIds?.length) return c.groupAgentIds
  const id = c.systemAgentId || agentsStore.defaultSystemAgent?.id
  return id ? [id] : []
})

// ── Avatar tooltip ──
const avatarTooltip = reactive({ visible: false, name: '', providerModel: '', desc: '', x: 0, y: 0 })

function showAvatarTooltip(event, msg) {
  let agent, agentId
  if (msg.role === 'user') {
    agent = resolveUserAgent(msg)
    agentId = msg.userAgentId || chat.value?.userAgentId
  } else {
    agentId = resolveAgentPid(msg)
    agent = agentId ? agentsStore.getAgentById(agentId) : null
  }
  if (!agent) { avatarTooltip.visible = false; return }
  const rect = event.currentTarget.getBoundingClientRect()
  avatarTooltip.name = agent.name || (msg.role === 'user' ? 'User' : 'Assistant')
  avatarTooltip.providerModel = agentId ? getMsgAssistantProviderModel(msg) : ''
  avatarTooltip.desc = agent.description || ''
  const tooltipMaxW = 448
  let left = rect.left + rect.width / 2
  left = Math.max(tooltipMaxW / 2 + 8, Math.min(left, window.innerWidth - tooltipMaxW / 2 - 8))
  avatarTooltip.x = left
  avatarTooltip.y = rect.top - 8
  avatarTooltip.visible = true
}

function hideAvatarTooltip() {
  avatarTooltip.visible = false
}

// ── Visible messages with limit ──
const visibleMessages = computed(() => {
  const all = (chat.value?.messages ?? []).filter(m => !m.hidden)
  if (all.length <= visibleLimit.value) return all
  return all.slice(all.length - visibleLimit.value)
})
const hasHiddenMessages = computed(() => {
  const all = (chat.value?.messages ?? []).filter(m => !m.hidden)
  if (all.length > visibleLimit.value) return true
  return chatsStore.hasOlderSegments(props.chatId)
})
const isLoadingSegment = ref(false)

async function loadMoreMessages() {
  const all = (chat.value?.messages ?? []).filter(m => !m.hidden)
  if (all.length > visibleLimit.value) {
    // Still have in-memory messages to show — just reveal more
    visibleLimit.value += 25
    return
  }
  // All in-memory messages are visible — try to load older segment from disk
  if (isLoadingSegment.value) return
  isLoadingSegment.value = true
  try {
    const loaded = await chatsStore.loadOlderSegments(props.chatId)
    if (loaded) {
      // Show all messages including newly loaded ones (they're prepended)
      const newAll = (chat.value?.messages ?? []).filter(m => !m.hidden)
      visibleLimit.value = newAll.length
    }
  } finally {
    isLoadingSegment.value = false
  }
}

// ── Bubble shake watchers (must be after visibleMessages is defined) ──
watch(visibleMessages, (msgs, prev) => {
  if (msgs.length > (prev?.length ?? 0)) {
    const newest = msgs[msgs.length - 1]
    if (newest?.role === 'user') triggerShake(newest.id)
  }
}, { flush: 'post' })
const _shookIds = new Set()
watch(visibleMessages, (msgs) => {
  for (const msg of msgs) {
    if (msg.role === 'assistant' && msg.streaming === false && msg.content && !_shookIds.has(msg.id)) {
      _shookIds.add(msg.id)
      triggerShake(msg.id)
    }
  }
}, { deep: true, flush: 'post' })

function getFailedWaitingForUser(userMsgId) {
  const msgs = chat.value?.messages || []
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m?.isWaitingIndicator && m?.sourceUserMessageId === userMsgId && m?.waitingState === 'error') {
      return m
    }
  }
  return null
}

function hasFailedWaitingAfter(userMsgId) {
  return !!getFailedWaitingForUser(userMsgId)
}

function getWaitingErrorForUser(userMsgId) {
  return getFailedWaitingForUser(userMsgId)?.waitingError || t('chats.preResponseFailed')
}

// ── Time formatter ──
function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const Y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${Y}-${M}-${D} ${h}:${m}`
}

// ── Copy ──
async function copyMessage(msg) {
  try {
    let text = msg.content || ''
    if (msg.segments?.length) {
      text = msg.segments.filter(s => s.type === 'text').map(s => s.content).join('\n\n').trim()
    }
    await navigator.clipboard.writeText(text)
    copiedId.value = msg.id
    setTimeout(() => { copiedId.value = null }, 2000)
  } catch (e) {
    console.error('Copy failed', e)
  }
}

// ── Quote ──
function quoteMessage(msg) {
  const content = msg.content || ''
  quotedMessage.value = { role: msg.role, content, agentId: msg.agentId || null }
  emit('quote', msg)
  nextTick(() => inputEl.value?.focus())
}

function getQuotedSenderName(q) {
  if (!q) return 'Assistant'
  if (q.role === 'user') return getMsgUserName(q)
  if (q.agentId) {
    const a = agentsStore.getAgentById(q.agentId)
    if (a) return a.name
  }
  // Fall back to the chat's system agent
  const sysId = chat.value?.systemAgentId
  if (sysId) {
    const a = agentsStore.getAgentById(sysId)
    if (a) return a.name
  }
  return agentsStore.defaultSystemAgent?.name || 'Assistant'
}

function clearQuote() {
  quotedMessage.value = null
}

// ── Error label formatting ──
function formatErrorLabel(msg) {
  const code = msg.errorCode || 'unknown'
  // Try i18n key for known error codes — use a unique sentinel to detect missing keys
  const sentinel = '__MISSING__'
  const i18nKey = `chats.error_${code}`
  const label = t(i18nKey, sentinel)
  if (label !== sentinel) return label
  // Fallback: extract short summary from raw error detail
  if (msg.errorDetail) {
    const clean = msg.errorDetail.replace(/^\d{3}\s+/, '').slice(0, 80)
    return clean + (msg.errorDetail.length > 80 ? '…' : '')
  }
  return t('chats.agentError')
}

// ── Scroll management ──
function scrollToBottom(force = false) {
  if (!force && userScrolled.value) return
  programmaticScrollCount++
  nextTick(() => {
    nextTick(() => {
      if (messagesEl.value) {
        messagesEl.value.scrollTop = messagesEl.value.scrollHeight
      }
      // Use requestAnimationFrame twice to ensure the scroll has been applied
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          programmaticScrollCount = Math.max(0, programmaticScrollCount - 1)
        })
      })
    })
  })
}

function onScroll() {
  if (programmaticScrollCount > 0) return
  const el = messagesEl.value
  if (!el) return
  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  userScrolled.value = distFromBottom > 60
}

// Watch message count changes for auto-scroll
watch(() => chat.value?.messages?.length, () => { scrollToBottom() }, { flush: 'post' })
// Watch last message content/segments for streaming auto-scroll.
// Group chat agents stream via segments (content stays ''), so we must also
// track total segment count across recent messages.
watch(() => {
  const msgs = chat.value?.messages
  if (!msgs?.length) return 0
  const last = msgs[msgs.length - 1]
  const contentLen = last?.content?.length ?? 0
  // Sum segment counts of the last 10 messages to catch group chat agent streaming
  let segTotal = 0
  for (let i = Math.max(0, msgs.length - 10); i < msgs.length; i++) {
    segTotal += msgs[i]?.segments?.length ?? 0
    segTotal += msgs[i]?.segments?.reduce((acc, s) => acc + (s.content?.length ?? 0), 0) ?? 0
  }
  return contentLen + segTotal
}, () => { scrollToBottom() }, { flush: 'post' })

// When messages finish lazy-loading (null → array), scroll to bottom
watch(() => chat.value?.messages, (msgs, oldMsgs) => {
  if (oldMsgs === null && Array.isArray(msgs)) {
    scrollToBottom(true)
  }
})

// Reset scroll state when chatId changes
watch(() => props.chatId, async () => {
  userScrolled.value = false
  visibleLimit.value = 25
  // Ensure messages are loaded before scrolling
  await chatsStore.ensureMessages(props.chatId)
  // Wait for DOM to fully render after switching chats
  await new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
  scrollToBottom(true)
}, { flush: 'post' })

// External scroll-to-bottom request (e.g. minibar chat section click)
watch(() => chatsStore.scrollToBottomSignal, () => {
  scrollToBottom(true)
})

// ── Visibility detection for scroll-to-bottom on view switch ──
let visibilityUnsubscribe = null
let resizeObserver = null

function setupVisibilityDetection() {
  if (!messagesEl.value) return
  
  // Use IntersectionObserver to detect when the scroll container becomes visible
  if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio > 0) {
          // Component is now visible - scroll to bottom
          scrollToBottom(true)
        }
      }
    }, { threshold: 0.1 })
    
    observer.observe(messagesEl.value)
    
    // Also watch for ResizeObserver to catch when the container size changes (view switch)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        // When container is resized (e.g., coming back from another view)
        // and there are messages, scroll to bottom
        if (chat.value?.messages?.length > 0) {
          scrollToBottom(true)
        }
      })
      resizeObserver.observe(messagesEl.value)
    }
    
    visibilityUnsubscribe = () => {
      observer.disconnect()
      if (resizeObserver) resizeObserver.disconnect()
    }
  }
}

function cleanupVisibilityDetection() {
  if (visibilityUnsubscribe) {
    visibilityUnsubscribe()
    visibilityUnsubscribe = null
  }
}

// ── Lifecycle ──
onMounted(async () => {
  await chatsStore.ensureMessages(props.chatId)
  // Wait for DOM to fully render after mount
  await new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
  scrollToBottom(true)
  setupVisibilityDetection()
})

onUnmounted(() => {
  cleanupVisibilityDetection()
})

// Also setup visibility detection when messagesEl becomes available
watch(() => messagesEl.value, (el) => {
  if (el) {
    cleanupVisibilityDetection()
    setupVisibilityDetection()
  }
})

// ── File attachment ──
function handleAttachResults(results) {
  const imageAtts = []
  const pathTexts = []
  for (const att of results) {
    if (att.type === 'image') {
      const placeholder = att.path || att.name
      imageAtts.push({ ...att, placeholderText: placeholder })
      pathTexts.push(placeholder)
    } else {
      if (att.path) pathTexts.push(att.path)
    }
  }
  if (imageAtts.length > 0) attachments.value.push(...imageAtts)
  if (pathTexts.length > 0) {
    const prefix = defaultInputText.value.trimEnd()
    defaultInputText.value = prefix ? `${prefix}\n${pathTexts.join('\n')}` : pathTexts.join('\n')
  }
}

async function pickFiles() {
  if (!window.electronAPI?.pickFiles) return
  try {
    const results = await window.electronAPI.pickFiles()
    if (results && results.length > 0) handleAttachResults(results)
  } catch (err) {
    console.error('pickFiles error:', err.message)
  }
}

function removeAttachment(id) {
  const att = attachments.value.find(a => a.id === id)
  if (att?.placeholderText) {
    const placeholder = att.placeholderText
    defaultInputText.value = defaultInputText.value
      .split('\n')
      .filter(line => line !== placeholder)
      .join('\n')
  }
  attachments.value = attachments.value.filter(a => a.id !== id)
}

// ── Default input handlers (used when no custom input slot is provided) ──
function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    defaultSend()
  }
}

function defaultSend() {
  const rawText = defaultInputText.value.trim()
  const hasAttachments = attachments.value.length > 0
  if (!rawText && !hasAttachments) return

  // Prepend quoted message if present
  let text = rawText
  if (quotedMessage.value) {
    const quotedName = getQuotedSenderName(quotedMessage.value)
    text = `> **${quotedName}:** ${quotedMessage.value.content.slice(0, 500)}${quotedMessage.value.content.length > 500 ? '...' : ''}\n\n${rawText}`
    quotedMessage.value = null
  }

  const pendingAttachments = [...attachments.value]
  defaultInputText.value = ''
  attachments.value = []
  inputFocused.value = false
  userScrolled.value = false
  if (hasAttachments) {
    emit('send-with-attachments', text, pendingAttachments)
  } else {
    emit('send', text)
  }
}

function defaultStop() {
  emit('stop')
}

// Expose scrollToBottom so parents can trigger it
defineExpose({ scrollToBottom })
</script>

<style scoped>
.cw-root {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

/* ── Messages area ── */
.cw-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: #FFFFFF;
  min-height: 0;
}

/* Scrollbar — matches global style */
.cw-messages::-webkit-scrollbar { width: 6px; }
.cw-messages::-webkit-scrollbar-track { background: transparent; }
.cw-messages::-webkit-scrollbar-thumb { background: #D1D1D6; border-radius: 9999px; }
.cw-messages::-webkit-scrollbar-thumb:hover { background: #A1A1AA; }

/* ── Placeholder / empty / loading ── */
.cw-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.875rem;
  height: 100%;
  text-align: center;
}
.cw-placeholder-text {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #1A1A1A;
  font-weight: 500;
  letter-spacing: -0.01em;
}
.cw-spinner {
  width: 1.75rem;
  height: 1.75rem;
  border: 3px solid #E5E5EA;
  border-top-color: #1A1A1A;
  border-radius: 50%;
  animation: cw-spin 0.7s linear infinite;
}
@keyframes cw-spin { to { transform: rotate(360deg); } }

.cw-empty-icon {
  width: 4rem;
  height: 4rem;
  border-radius: 1.125rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.cw-empty-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.cw-empty-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #9CA3AF;
  margin: 0.25rem 0 0;
}

/* ── Message avatars ── */
.cw-msg-avatar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
.cw-msg-avatar-wrap { flex-shrink: 0; }
.cw-msg-avatar-img {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.cw-msg-avatar-fallback {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.cw-msg-avatar-fallback.system {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.cw-msg-avatar-fallback.user {
  background: #007AFF;
}
.cw-msg-name-chip {
  display: inline-block;
  padding: 0.0625rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.62rem;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  letter-spacing: -0.01em;
  line-height: 1.5;
  white-space: nowrap;
}
.cw-msg-name-chip--user {
  background: linear-gradient(135deg, #4338CA 0%, #6366F1 50%, #818CF8 100%);
  color: #fff;
}
.cw-msg-name-chip--assistant {
  background: #4B5563;
  color: #fff;
}
.cw-system-banner {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.3125rem 0.875rem;
  background: rgba(107, 114, 128, 0.07);
  border: 1px solid rgba(107, 114, 128, 0.16);
  border-radius: 1.25rem;
  color: #6B7280;
  font-size: var(--fs-caption);
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  max-width: 72%;
  line-height: 1;
}
.cw-system-banner--pause {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.25);
  color: #B45309;
}
.cw-system-banner--stop {
  background: rgba(239, 68, 68, 0.07);
  border-color: rgba(239, 68, 68, 0.22);
  color: #DC2626;
}
.cw-system-banner--compact {
  background: rgba(99, 102, 241, 0.06);
  border-color: rgba(99, 102, 241, 0.2);
  color: #6366F1;
}
.cw-system-banner-sep {
  color: rgba(99, 102, 241, 0.35);
  font-size: 0.7rem;
}
.cw-system-banner-tokens {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-small);
  color: #818CF8;
}
.cw-system-banner-text {
  line-height: 1.4;
  display: block;
}


/* ── Hover action buttons ── */
.cw-msg-action-btn {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: #1A1A1A;
  color: #fff;
  border: none;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  transition: background 0.15s, opacity 0.15s;
  z-index: 100;
  opacity: 0;
  pointer-events: auto;
}
.group\/bubble:hover .cw-msg-action-btn {
  opacity: 1;
}
.cw-msg-action-btn:hover { background: #374151; }
.cw-msg-action-btn-delete:hover { background: #DC2626; }

.cw-user-resend-btn {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border-radius: 0.625rem;
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #dc2626;
  font-size: var(--fs-small);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.cw-user-resend-btn:hover {
  background: #ffe4e6;
  border-color: #fca5a5;
  color: #b91c1c;
}

/* ── Message bubbles ── */
.cw-msg-bubble {
  padding: 0.875rem 1.125rem;
  line-height: 1.65;
  border-radius: 1.125rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
}
.cw-msg-bubble :deep(> div:last-child p:last-child),
.cw-msg-bubble :deep(> div:last-child ul:last-child),
.cw-msg-bubble :deep(> div:last-child ol:last-child) {
  margin-bottom: 0;
}
/* ── Bubble shake animation ── */
@keyframes bubble-shake {
  0%   { transform: translateX(0); }
  15%  { transform: translateX(-5px); }
  30%  { transform: translateX(5px); }
  45%  { transform: translateX(-4px); }
  60%  { transform: translateX(4px); }
  75%  { transform: translateX(-2px); }
  90%  { transform: translateX(2px); }
  100% { transform: translateX(0); }
}
.bubble-shake { animation: bubble-shake 0.55s ease-in-out; }
@media (prefers-reduced-motion: reduce) { .bubble-shake { animation: none; } }

.cw-msg-bubble-user {
  background: linear-gradient(135deg, #4338CA 0%, #6366F1 50%, #818CF8 100%);
  color: #ffffff;
  border-radius: 1.125rem;
  box-shadow: 0 4px 16px rgba(99,102,241,0.3), 0 2px 8px rgba(67,56,202,0.2), 0 1px 3px rgba(0,0,0,0.12);
}
.cw-msg-bubble-user :deep(*) { color: #FFFFFF !important; }
.cw-msg-bubble-assistant {
  background: #F4F4F8;
  border: none;
  color: #1A1A1A;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.05);
  border-radius: 1.125rem;
}
.cw-msg-bubble-error {
  background: #FEF2F2;
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #1A1A1A;
  box-shadow: 0 4px 16px rgba(239, 68, 68, 0.08), 0 2px 6px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03);
  border-radius: 1.125rem;
}
.cw-error-indicator {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  margin-bottom: 0.5rem;
  border-radius: 0.5rem;
  background: rgba(239, 68, 68, 0.08);
  color: #DC2626;
  font-size: var(--fs-small, 0.8125rem);
  font-weight: 600;
  font-family: 'Inter', sans-serif;
}
.cw-error-info {
  margin-left: auto;
  position: relative;
  cursor: help;
  opacity: 0.5;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.cw-error-info:hover { opacity: 1; }
.cw-error-info::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  min-width: 200px;
  max-width: 360px;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: #1F2937;
  color: #F9FAFB;
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  pointer-events: none;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.15s, transform 0.15s;
  z-index: 50;
}
.cw-error-info:hover::after {
  opacity: 1;
  transform: translateY(0);
}

/* ── Error detail dialog ─────────────────────────────────────────────────── */
.cw-error-dialog-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
}
.cw-error-dialog {
  width: min(36rem, 90vw); max-height: 60vh;
  display: flex; flex-direction: column;
  background: #FFFFFF; border-radius: 1rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.cw-error-dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.25rem; border-bottom: 1px solid #E5E5EA;
}
.cw-error-dialog-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  font-weight: 600; color: #DC2626; margin: 0;
}
.cw-error-dialog-close {
  width: 2rem; height: 2rem; border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #9CA3AF;
  cursor: pointer; transition: all 0.15s;
}
.cw-error-dialog-close:hover { background: #F3F4F6; color: #1A1A1A; }
.cw-error-dialog-body {
  flex: 1; overflow-y: auto; padding: 1rem 1.25rem;
}
.cw-error-dialog-text {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-caption); color: #374151;
  white-space: pre-wrap; word-break: break-word;
  margin: 0; line-height: 1.5;
}

/* ── Timestamp ── */
.cw-msg-timestamp {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #9CA3AF;
  margin-top: 0.1875rem;
}

/* ── Pre-response waiting row ── */
.cw-pre-response-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  min-height: 1.75rem;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  background: rgba(76, 132, 70, 0.08);
  border: 1px solid rgba(76, 132, 70, 0.2);
}
.cw-pre-response-row--error {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.28);
}
.cw-pre-response-wave {
  display: flex;
  align-items: end;
  gap: 0.125rem;
  height: 1rem;
}
.cw-wave-bar {
  width: 0.1875rem;
  border-radius: 9999px;
  background: var(--bar-color);
  box-shadow: 0 0 0.375rem var(--bar-glow);
  height: 0.35rem;
  animation: cw-wave-pulse 0.85s ease-in-out infinite;
}
.cw-pre-response-row--error .cw-wave-bar {
  animation-duration: 0.55s;
}
.cw-pre-response-error {
  color: #dc2626;
  font-size: var(--fs-small);
  font-weight: 600;
}
.cw-retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.625rem;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  font-size: var(--fs-small);
  font-weight: 600;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 1px 4px rgba(0,0,0,0.18);
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.cw-retry-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.22);
}
@keyframes cw-wave-pulse {
  0%, 100% { height: 0.3rem; opacity: 0.6; }
  50% { height: 0.95rem; opacity: 1; }
}

/* ── Thinking dots ── */
.cw-thinking { display: flex; gap: 0.1875rem; padding: 0.25rem 0; }
.cw-thinking .dot { width: 0.3125rem; height: 0.3125rem; border-radius: 50%; background: #9CA3AF; animation: cw-bounce 1s ease-in-out infinite; }
.cw-thinking .dot:nth-child(2) { animation-delay: 0.15s; }
.cw-thinking .dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes cw-bounce { 0%,80%,100%{transform:translateY(0);} 40%{transform:translateY(-4px);} }

/* ── Fade-in animation ── */
@keyframes cw-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.cw-animate-fade-in { animation: cw-fade-in 0.2s ease-out; }

/* ── Attachment preview strip ── */
.cw-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.5rem 1rem 0;
  background: #FFFFFF;
  border-top: 1px solid #E5E5EA;
}
.cw-att-thumb {
  position: relative;
  width: 3.75rem;
  height: 3.75rem;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid #93C5FD;
  background: #EFF6FF;
  flex-shrink: 0;
}
.cw-att-remove {
  position: absolute;
  top: 0.125rem;
  right: 0.125rem;
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  border: none;
  background: rgba(0,0,0,0.55);
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.12s;
}
.cw-att-remove:hover {
  background: #EF4444;
  color: #FFFFFF;
}

/* ── Input area (default slot fallback) ── */
.cw-input-area {
  padding: 0.625rem 1rem 0.75rem;
  flex-shrink: 0;
  background: #FFFFFF;
  border-top: 1px solid #E5E5EA;
}
.cw-input-box {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
  border-radius: 0.875rem;
  padding: 0.625rem 0.875rem;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.cw-input-box.focused {
  border-color: #1A1A1A;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
}
.cw-textarea {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.9375rem);
  color: var(--text-primary, #1A1A1A);
  line-height: 1.5;
  min-height: 2.75rem;
  max-height: 7.5rem;
  overflow-y: auto;
}
.cw-textarea::placeholder { color: var(--text-muted, #9CA3AF); }

.cw-btn {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
}
.cw-btn.attach { background: #F5F5F5; color: #9CA3AF; }
.cw-btn.attach:hover { background: #E5E5EA; color: #1A1A1A; }
.cw-btn.attach:disabled { opacity: 0.4; cursor: not-allowed; }
.cw-btn.stop { background: rgba(255,59,48,0.08); color: #FF3B30; }
.cw-btn.stop:hover { background: rgba(255,59,48,0.14); }
.cw-btn.send { background: #E5E5EA; color: #9CA3AF; cursor: not-allowed; }
.cw-btn.send.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.cw-btn.send.active:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.cw-btn:disabled { cursor: not-allowed; }
</style>

<!-- Unscoped styles for teleported avatar tooltip -->
<style>
.cw-avatar-tooltip-fixed {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  transform: translate(-50%, -100%);
  width: max-content;
  max-width: 28rem;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.92);
  border-radius: 0.625rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.cw-avatar-tooltip-name {
  font-family: 'Inter', sans-serif;
  font-size: 0.875rem;
  font-weight: 700;
  color: #F5F5F5;
  white-space: nowrap;
}
.cw-avatar-tooltip-pm {
  font-weight: 400;
  color: #9CA3AF;
  margin-left: 0.375rem;
  font-size: 0.75rem;
}
.cw-avatar-tooltip-desc {
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 400;
  color: #D1D1D6;
  line-height: 1.45;
  margin-top: 0.1875rem;
}
</style>
