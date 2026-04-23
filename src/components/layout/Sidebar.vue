<template>
  <nav
    class="flex flex-col shrink-0"
    :style="{ width: isCollapsed ? '4rem' : sidebarWidthPx, minWidth: isCollapsed ? '4rem' : sidebarWidthPx, background: '#FFFFFF', height: '100%', overflow: 'hidden', position: 'relative', zIndex: 10, borderRight: isCollapsed ? '1px solid #E5E5EA' : 'none', transition: 'width 0.2s ease, min-width 0.2s ease' }"
    aria-label="Main navigation"
  >
    <!-- Logo / Header -->
    <div :style="{ position: 'relative', padding: isCollapsed ? '1.25rem 0' : '1rem 1.25rem', borderBottom: '1px solid #F0F0F0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', pointerEvents: focusModeStore.justExited ? 'none' : undefined }">
      <div ref="logoWrapRef" class="logo-wrap" @mouseenter="onLogoHover" @mouseleave="onLogoLeave" @mousemove="onLogoMouseMove" @click="onLogoClick">
        <img
          :src="appIconUrl"
          alt="ClankAI"
          :class="[isCollapsed ? 'w-12 h-12 rounded-xl' : 'w-20 h-20 rounded-2xl', 'logo-img', logoAnimClass]"
          style="object-fit:contain;flex-shrink:0;"
        />
      </div>
      <Teleport to="body">
        <div v-if="logoBubbleVisible" class="logo-bubble-fixed" :style="logoBubbleStyle">
          {{ logoBubbleText }}<span class="logo-bubble-arrow"></span>
        </div>
      </Teleport>
      <span v-show="!isCollapsed" style="font-family:'Inter','Figtree',system-ui,sans-serif; font-size:1.75rem; font-weight:800; color:#1A1A1A; letter-spacing:-0.03em;">
        ClankAI
      </span>
    </div>

    <!-- Voice call indicator -->
    <div v-if="voiceStore.isCallActive" class="sidebar-call-indicator" @click="goToCall" v-tooltip="isCollapsed ? t('voice.call') + ' — ' + t('common.close') : ''">
      <div class="sidebar-call-dot"></div>
      <span v-show="!isCollapsed" class="sidebar-call-text">{{ t('voice.call') }}</span>
      <span v-show="!isCollapsed" class="sidebar-call-name">{{ voiceStore.activeAgentName }}</span>
    </div>

    <!-- Navigation -->
    <div class="flex-1 px-3 py-3 flex flex-col overflow-y-auto" style="scrollbar-width:thin;gap:0.125rem;">

      <!-- ── AI Agent ── -->
      <div class="nav-section" :class="{ collapsed: isCollapsed }">
        <div class="nav-section-header">
          <span class="nav-section-label" v-show="!isCollapsed">{{ t('nav.aiMenu') }}</span>
        </div>
        <!-- Chats nav item -->
        <div class="chats-row-wrap" :class="{ 'chats-row-active': $route.path === '/chats' || $route.path.startsWith('/chats/') }">
          <RouterLink
            to="/chats"
            class="nav-item chats-main-item"
            :class="($route.path === '/chats' || $route.path.startsWith('/chats/')) ? 'nav-item-active' : 'nav-item-inactive'"
            :style="isCollapsed ? 'justify-content:center;' : ''"
            :aria-current="($route.path === '/chats' || $route.path.startsWith('/chats/')) ? 'page' : undefined"
            @mouseenter="isCollapsed ? showNavTooltip('Chats', $event) : undefined"
            @mouseleave="isCollapsed ? hideNavTooltip() : undefined"
          >
            <IconChats style="width:18px;height:18px;flex-shrink:0;" />
            <span v-if="!isCollapsed" style="font-size:var(--nav-item-fs, var(--fs-secondary));font-weight:500;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ t('nav.chats') }}</span>
          </RouterLink>
        </div>
        <div ref="notesHighlightRef">
          <NavItem to="/notes" :icon="IconNotes" :label="t('nav.aiDoc')" :isCollapsed="isCollapsed" :highlight="obsidianStore.highlightNav" @click="obsidianStore.highlightNav = false" />
        </div>
        <Teleport to="body">
          <div v-if="obsidianStore.highlightNav && !isCollapsed" class="nav-tour-tip-float" :style="notesHighlightTipPos">
            <span class="nav-tour-tip-arrow">&#8592;</span>
            <span>{{ t('nav.tourHint') }}</span>
          </div>
        </Teleport>
        <NavItem v-if="!configStore.config.demoMode" to="/news"  :icon="IconNews"  :label="t('news.title')"   :isCollapsed="isCollapsed" />
      </div>

      <!-- ── AI Roles ── -->
      <div class="nav-section" :class="{ collapsed: isCollapsed }">
        <div class="nav-section-header" v-show="!isCollapsed">
          <span class="nav-section-label">{{ t('nav.aiRoles') }}</span>
        </div>
        <!-- System Agents (数字人) -->
        <NavItem to="/agents"   :icon="IconSystemAgents" :label="t('nav.systemAgents')" :isCollapsed="isCollapsed" />
        <!-- User Personas (用户画像) -->
        <NavItem to="/personas" :icon="IconUserPersona"  :label="t('nav.userPersonas')" :isCollapsed="isCollapsed" />
        <!-- Capabilities toggle (only expandable item) -->
        <div v-if="!isCollapsed" class="chats-row-wrap" :class="{ 'chats-row-active': agentCapabilitiesOpen }">
          <button
            class="nav-item nav-item-inactive capabilities-toggle"
            :class="{ 'capabilities-toggle-open': agentCapabilitiesOpen }"
            v-tooltip="t('nav.capabilitiesTooltip')"
            @click="agentCapabilitiesOpen = !agentCapabilitiesOpen"
          >
            <IconCapabilities style="width:18px;height:18px;flex-shrink:0;" />
            <span class="capabilities-label">{{ t('nav.capabilities') }}</span>
            <svg class="capabilities-chevron" :class="{ open: agentCapabilitiesOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
        <!-- Collapsed: Capabilities as direct link to /skills -->
        <NavItem v-else to="/skills" :icon="IconCapabilities" :label="t('nav.capabilities')" :isCollapsed="isCollapsed" />
        <!-- Capabilities submenu -->
        <div v-if="agentCapabilitiesOpen && !isCollapsed" class="agent-submenu">
          <NavItem to="/skills"    :icon="IconSkills"    :label="t('nav.skills')"        :isCollapsed="isCollapsed" />
          <NavItem to="/tools"     :icon="IconTools"     :label="t('nav.tools')"         :isCollapsed="isCollapsed" />
          <NavItem to="/mcp"       :icon="IconMcp"       :label="t('nav.mcp')"  :isCollapsed="isCollapsed" />
          <NavItem to="/knowledge" :icon="IconKnowledge" :label="t('nav.knowledge')"     :isCollapsed="isCollapsed" />
        </div>
      </div>

      <!-- ── Workspace ── -->
      <div v-if="!configStore.config.demoMode" class="nav-section" :class="{ collapsed: isCollapsed }">
        <div class="nav-section-header" v-show="!isCollapsed">
          <span class="nav-section-label">{{ t('nav.workspace') }}</span>
        </div>
        <NavItem to="/tasks"     :icon="IconTaskEngine" :label="t('tasks.title')" :isCollapsed="isCollapsed" />
        <NavItem to="/ai-tasks" :icon="IconAiTasks" :label="t('nav.agentTasks')" :isCollapsed="isCollapsed" />
      </div>

    </div>

    <!-- ── Bottom: Settings ── -->
    <div :style="{ marginTop: 'auto', padding: isCollapsed ? '0.75rem' : '0.75rem 1rem', borderTop: '1px solid #F0F0F0' }">
      <div
        class="nav-item"
        :class="{ collapsed: isCollapsed }"
        @click="router.push('/config')"
        :style="{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', cursor: 'pointer' }"
      >
        <div
          :style="{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', color: '#666', transition: 'background 0.15s' }"
          @mouseenter="$event.target.style.background = '#F5F5F5'"
          @mouseleave="$event.target.style.background = 'transparent'"
        >
          <component :is="IconConfig" :style="{ width: '1.25rem', height: '1.25rem', flexShrink: 0 }" />
        </div>
      </div>
    </div>

    <!-- ── Nav tooltip ────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="navTooltipVisible" class="nav-tooltip-fixed" :style="navTooltipStyle">
        {{ navTooltipText }}
      </div>
    </Teleport>

    <!-- Focus lightbulb moved to title bar via slot mount -->
    <Teleport v-if="titlebarFocusTarget && !configStore.config.demoMode" :to="titlebarFocusTarget">
      <button
        class="focus-bulb focus-bulb-titlebar"
        :class="{ 'focus-bulb-active': focusModeStore.isFocusMode }"
        :style="{ pointerEvents: focusModeStore.justExited ? 'none' : undefined }"
        v-tooltip="focusModeStore.isFocusMode ? t('focusMode.exitFocusMode') : t('focusMode.enterFocusMode')"
        @click="toggleFocusMode"
        @mouseenter="onFocusBulbHover"
        @mouseleave="onFocusBulbLeave"
      >
        <span :class="[focusBulbAnimClass, { 'focus-bulb-spin': focusModeStore.isFocusMode }]" class="focus-bulb-emoji">📑</span>
      </button>
    </Teleport>

    <!-- Privacy modal -->
    <PrivacyModal
      :visible="showPrivacyModal"
      @agree="showPrivacyModal = false"
      @cancel="showPrivacyModal = false"
    />

    <!-- Demo modal -->
    <Teleport to="body">
      <div v-if="showDemoModal" class="demo-modal-backdrop" @click.self="showDemoModal = false">
        <div class="demo-modal">
          <div class="demo-modal-header">
            <span style="font-weight:600;font-size:0.875rem;">Demo Mode</span>
            <button class="demo-modal-close" @click="showDemoModal = false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="demo-modal-body">
            <label class="demo-toggle-row">
              <span style="font-size:0.8125rem;color:#374151;">Demo Mode</span>
              <button
                class="demo-switch"
                :class="{ active: configStore.config.demoMode !== false }"
                @click="configStore.saveConfig({ demoMode: !configStore.config.demoMode })"
                role="switch"
                :aria-checked="configStore.config.demoMode !== false"
              >
                <span class="demo-switch-thumb" />
              </button>
            </label>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Help / About button in title bar -->
    <Teleport v-if="titlebarHelpTarget" :to="titlebarHelpTarget">
      <button
        class="tb-btn"
        v-tooltip="t('help.title')"
        @click="toggleHelpPopover"
        ref="helpBtnRef"
      >
        <svg class="tb-btn-glyph" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </button>
    </Teleport>

    <!-- Help popover -->
    <Teleport to="body">
      <div v-if="showHelpPopover" class="help-popover-backdrop" @click="showHelpPopover = false"></div>
      <div v-if="showHelpPopover" class="help-popover" :style="helpPopoverStyle">
        <div class="help-popover-header">
          <img :src="appIconUrl" alt="ClankAI" style="width:2rem;height:2rem;border-radius:0.5rem;" />
          <div style="flex:1;">
            <div style="font-weight:700;font-size:0.875rem;color:#1A1A1A;">ClankAI</div>
            <div style="font-size:0.6875rem;color:#999;">{{ t('app.tagline') }}</div>
          </div>
          <button class="help-privacy-btn" v-tooltip="t('nav.privacy')" @click="showPrivacyModal = true; showHelpPopover = false">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </button>
          <!-- Demo button hidden — demo mode defaults to false -->

        </div>
        <div class="help-popover-body">
          <div class="help-row"><span class="help-label">{{ t('help.version') }}</span><span class="help-value">{{ appVersion }}</span></div>
          <div class="help-row"><span class="help-label">{{ t('help.platform') }}</span><span class="help-value">{{ platformInfo.platform }}</span></div>
        </div>
      </div>
    </Teleport>

  </nav>
</template>

<script setup>
import { defineComponent, h, ref, nextTick, watch, onMounted, onUnmounted, onUpdated, computed } from 'vue'
import appIconUrl from '@/assets/icon.png'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useVoiceStore } from '../../stores/voice'
import { useFocusModeStore } from '../../stores/focusMode'
import { useConfigStore } from '../../stores/config'
import { useObsidianStore } from '../../stores/obsidian'
import { useI18n } from '../../i18n/useI18n'
import PrivacyModal from '../common/PrivacyModal.vue'

const props = defineProps({
  width: { type: Number, default: 200 }
})

const sidebarWidthPx = computed(() => `${props.width}px`)

const route = useRoute()
const router = useRouter()
const voiceStore = useVoiceStore()
const focusModeStore = useFocusModeStore()
const configStore = useConfigStore()
const obsidianStore = useObsidianStore()
const { t } = useI18n()

function toggleFocusMode() {
  focusModeStore.isFocusMode ? focusModeStore.exit() : focusModeStore.enter()
}

function toggleMinibarMode() {
  if (focusModeStore.isMinibarMode) {
    focusModeStore.exitMinibar()
    window.electronAPI?.window?.setMinibar(false)
  } else {
    focusModeStore.enterMinibar()
    window.electronAPI?.window?.setMinibar(true)
  }
}

watch(() => focusModeStore.isFocusMode, (val, prev) => {
  if (prev === true && val === false) {
    nextTick(() => triggerLogoMoment('focus-exit'))
  }
})

// ── Nav tooltip (position:fixed so it escapes overflow:hidden ancestors) ─────
const navTooltipVisible = ref(false)
const navTooltipText    = ref('')
const navTooltipStyle   = ref({})

function showNavTooltip(label, event) {
  const r = event.currentTarget.getBoundingClientRect()
  navTooltipText.value  = label
  navTooltipStyle.value = {
    top:       (r.top + r.height / 2) + 'px',
    left:      (r.right + 8) + 'px',
    transform: 'translateY(-50%)',
  }
  navTooltipVisible.value = true
}
function hideNavTooltip() {
  navTooltipVisible.value = false
}


const isCollapsed = ref(false)
const userOverride = ref(null) // null = auto mode, true/false = user locked
const agentCapabilitiesOpen = ref(false)
const titlebarFocusTarget = ref(null)
const titlebarHelpTarget = ref(null)
const showPrivacyModal = ref(false)
const showDemoModal = ref(false)
const showHelpPopover = ref(false)
const helpBtnRef = ref(null)
const helpPopoverStyle = ref({})

// ── Notes highlight tip ──
const notesHighlightRef = ref(null)
const notesNavRect = ref(null)
const notesHighlightTipPos = computed(() => {
  if (!notesNavRect.value) return { display: 'none' }
  return {
    top: Math.round(notesNavRect.value.top + notesNavRect.value.height / 2) + 'px',
    left: Math.round(notesNavRect.value.right + 10) + 'px',
  }
})

watch(() => obsidianStore.highlightNav, (val) => {
  if (val) {
    nextTick(() => {
      requestAnimationFrame(() => {
        if (notesHighlightRef.value) {
          notesNavRect.value = notesHighlightRef.value.getBoundingClientRect()
        }
      })
    })
  }
}, { immediate: true })

const appVersion = window.electronAPI?.getAppVersion?.() || '—'
const platformInfo = window.electronAPI?.getPlatformInfo?.() || { platform: '—' }

function toggleHelpPopover() {
  if (showHelpPopover.value) {
    showHelpPopover.value = false
    return
  }
  if (helpBtnRef.value) {
    const rect = helpBtnRef.value.getBoundingClientRect()
    const popoverWidth = 224
    let left = rect.right - popoverWidth
    if (left < 8) left = 8
    helpPopoverStyle.value = { top: `${rect.bottom + 6}px`, left: `${left}px` }
  }
  showHelpPopover.value = true
}

function refreshTitlebarFocusTarget() {
  titlebarFocusTarget.value = document.getElementById('titlebar-focus-slot') || null
  titlebarHelpTarget.value = document.getElementById('titlebar-help-slot') || null
}

// Auto-open agent capabilities when navigating to those routes
watch(() => route.path, (path) => {
  const routes = ['/tools', '/skills', '/mcp', '/knowledge']
  if (routes.some(r => path === r || path.startsWith(r + '/'))) {
    agentCapabilitiesOpen.value = true
  }
}, { immediate: true })

function applyAutoCollapse() {
  if (userOverride.value !== null) return
  isCollapsed.value = false
}

function onResize() {
  // no-op: sidebar stays expanded unless user manually collapses
}

function onKeyDown(e) {
  if (e.key === 'Escape' && focusModeStore.isFocusMode) focusModeStore.exit()
}

let logoIdleInterval = null

function startLogoIdleInterval() {
  stopLogoIdleInterval()
  logoIdleInterval = setInterval(() => {
    if (focusModeStore.isFocusMode) return
    if (logoDancing.value || logoBubbleVisible.value) return
    if (!logoWrapRef.value) return
    const rect = logoWrapRef.value.getBoundingClientRect()
    logoAnimClass.value = LOGO_HOVER_ANIMS[Math.floor(Math.random() * LOGO_HOVER_ANIMS.length)]
    logoBubbleText.value = LOGO_QUIPS.value[Math.floor(Math.random() * LOGO_QUIPS.value.length)]
    logoBubbleStyle.value = bubbleStyle(rect.left + rect.width / 2, rect.bottom + 12)
    logoBubbleVisible.value = true
    clearTimeout(logoBubbleTimer)
    logoBubbleTimer = setTimeout(() => {
      logoBubbleVisible.value = false
      logoAnimClass.value = ''
    }, 3000)
  }, 600000)
}

function stopLogoIdleInterval() {
  if (logoIdleInterval) {
    clearInterval(logoIdleInterval)
    logoIdleInterval = null
  }
}

onMounted(() => {
  refreshTitlebarFocusTarget()
  requestAnimationFrame(refreshTitlebarFocusTarget)
  applyAutoCollapse()
  window.addEventListener('titlebar:logo-hint-enter', onTitlebarLogoHintEnter)
  window.addEventListener('titlebar:logo-hint-leave', onTitlebarLogoHintLeave)
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKeyDown)
  setTimeout(() => triggerLogoMoment('load'), 800)
  startLogoIdleInterval()
})

onUpdated(() => {
  if (!titlebarFocusTarget.value || !titlebarHelpTarget.value) refreshTitlebarFocusTarget()
})

// When demoMode toggles off, the #titlebar-focus-slot is recreated in TitleBar —
// re-acquire the DOM target so the focus bulb Teleport can mount.
watch(() => configStore.config.demoMode, async (demo) => {
  if (!demo) {
    await nextTick()
    refreshTitlebarFocusTarget()
  } else {
    titlebarFocusTarget.value = null
  }
})

onUnmounted(() => {
  window.removeEventListener('titlebar:logo-hint-enter', onTitlebarLogoHintEnter)
  window.removeEventListener('titlebar:logo-hint-leave', onTitlebarLogoHintLeave)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeyDown)
  stopLogoIdleInterval()
})

function goToCall() {
  voiceStore.setPip(false)
  router.push('/chats')
}
function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
  userOverride.value = isCollapsed.value
  hideNavTooltip()
}

const LOGO_QUIPS = computed(() => t('sidebar.logoQuips'))

const LOGO_HOVER_ANIMS = [
  // original 20
  'logo-anim-wiggle', 'logo-anim-bounce', 'logo-anim-spin', 'logo-anim-rubber',
  'logo-anim-shake', 'logo-anim-flip', 'logo-anim-pulse', 'logo-anim-tada',
  'logo-anim-jello', 'logo-anim-swing', 'logo-anim-nod', 'logo-anim-boing',
  'logo-anim-tilt', 'logo-anim-glitch', 'logo-anim-heartbeat', 'logo-anim-wobble',
  'logo-anim-spin-x', 'logo-anim-sway', 'logo-anim-pop', 'logo-anim-roll',
  // new 30
  'logo-anim-zoom', 'logo-anim-shrink', 'logo-anim-skew', 'logo-anim-drop', 'logo-anim-rise',
  'logo-anim-stamp', 'logo-anim-flash', 'logo-anim-ping', 'logo-anim-stretch', 'logo-anim-squeeze',
  'logo-anim-pendulum', 'logo-anim-earthquake', 'logo-anim-explode', 'logo-anim-implode', 'logo-anim-bounce-x',
  'logo-anim-dizzy', 'logo-anim-hiccup', 'logo-anim-electric', 'logo-anim-drunk', 'logo-anim-yo-yo',
  'logo-anim-spring', 'logo-anim-snap', 'logo-anim-shimmy', 'logo-anim-twitch', 'logo-anim-kaboom',
  'logo-anim-float', 'logo-anim-sink', 'logo-anim-lean', 'logo-anim-orbit', 'logo-anim-blur',
]
// 50 looping dance animations (run for 5s)
const LOGO_DANCE_ANIMS = [
  // original 5
  'logo-dance-robot', 'logo-dance-bounce', 'logo-dance-spin360', 'logo-dance-floss', 'logo-dance-worm',
  // new 45
  'logo-dance-moonwalk', 'logo-dance-headbang', 'logo-dance-wave', 'logo-dance-shuffle', 'logo-dance-twist',
  'logo-dance-disco', 'logo-dance-thriller', 'logo-dance-carlton', 'logo-dance-hammer', 'logo-dance-sprinkler',
  'logo-dance-salsa', 'logo-dance-jive', 'logo-dance-macarena', 'logo-dance-mosh', 'logo-dance-poplock',
  'logo-dance-twirl', 'logo-dance-gangnam', 'logo-dance-dab', 'logo-dance-krump', 'logo-dance-running-man',
  'logo-dance-cabbage', 'logo-dance-breakdance', 'logo-dance-hustle', 'logo-dance-cha-cha', 'logo-dance-electric-slide',
  'logo-dance-watusi', 'logo-dance-whip', 'logo-dance-nae-nae', 'logo-dance-twerk', 'logo-dance-dubstep',
  'logo-dance-glitch-dance', 'logo-dance-vogueing', 'logo-dance-locking', 'logo-dance-popping', 'logo-dance-body-roll',
  'logo-dance-typewriter', 'logo-dance-lindy', 'logo-dance-toprock', 'logo-dance-headspin', 'logo-dance-pulse-dance',
  'logo-dance-orbit-dance', 'logo-dance-matrix', 'logo-dance-breakbeat', 'logo-dance-windmill', 'logo-dance-ymca',
]
const logoBubbleVisible = ref(false)
const logoBubbleText = ref('')
const logoBubbleStyle = ref({})
const logoAnimClass = ref('')
const logoDancing = ref(false)
const logoWrapRef = ref(null)
let logoBubbleTimer = null
let logoDanceTimer = null

const LOAD_QUIPS_EN = [
  'I\'m awake!', 'System online ✓', 'Let\'s go!', 'Ready to assist!',
  'Fully charged!', 'Booting up…', 'At your service.', 'Hello again!',
  'Brain = loaded.', 'Fresh and ready!',
]
const FOCUS_EXIT_QUIPS_EN = [
  'Welcome back!', 'Miss me?', 'Focus mode off!', 'Back to normal!',
  'Returning to base.', 'I\'m still here!', 'Did you miss me?', 'Unfocused!',
  'Ahh, open air!', 'Freedom restored!',
]

const LOAD_QUIPS_ZH = [
  '我醒了！', '系统上线 ✓', '开始吧！', '随时待命！',
  '满电出发！', '启动中…', '为您服务。', '又见面了！',
  '大脑加载完成。', '焕然一新！',
]
const FOCUS_EXIT_QUIPS_ZH = [
  '欢迎回来！', '想我了吗？', '专注模式关闭！', '回归正常！',
  '返回基地。', '我还在！', '想我没？', '不专注了！',
  '啊，自由空气！', '自由恢复！',
]

const LOAD_QUIPS = computed(() => {
  const locale = configStore.config?.language || 'en'
  return locale.startsWith('zh') ? LOAD_QUIPS_ZH : LOAD_QUIPS_EN
})

const FOCUS_EXIT_QUIPS = computed(() => {
  const locale = configStore.config?.language || 'en'
  return locale.startsWith('zh') ? FOCUS_EXIT_QUIPS_ZH : FOCUS_EXIT_QUIPS_EN
})

function bubbleStyle(rawX, rawY) {
  return { left: rawX + 'px', top: rawY + 'px', '--bubble-anchor': rawX + 'px', '--arrow-offset': '0px' }
}

function triggerLogoMoment(type) {
  if (!logoWrapRef.value || logoDancing.value) return
  const rect = logoWrapRef.value.getBoundingClientRect()
  const rawX = rect.left + rect.width / 2
  const rawY = rect.bottom + 12
  const pool = type === 'load' ? LOAD_QUIPS.value : FOCUS_EXIT_QUIPS.value
  logoBubbleText.value = pool[Math.floor(Math.random() * pool.length)]
  logoBubbleStyle.value = bubbleStyle(rawX, rawY)
  logoBubbleVisible.value = true

  if (type === 'load') {
    // dance for 5s on load
    logoDancing.value = true
    logoAnimClass.value = LOGO_DANCE_ANIMS[Math.floor(Math.random() * LOGO_DANCE_ANIMS.length)]
    clearTimeout(logoDanceTimer)
    logoDanceTimer = setTimeout(() => {
      logoDancing.value = false
      logoAnimClass.value = ''
      logoBubbleVisible.value = false
    }, 5000)
  } else {
    // quick one-shot anim on focus exit
    logoAnimClass.value = LOGO_HOVER_ANIMS[Math.floor(Math.random() * LOGO_HOVER_ANIMS.length)]
    clearTimeout(logoBubbleTimer)
    logoBubbleTimer = setTimeout(() => {
      logoBubbleVisible.value = false
      logoAnimClass.value = ''
    }, 2500)
  }
}

function onLogoHover(e) {
  if (logoDancing.value) return
  clearTimeout(logoBubbleTimer)
  logoBubbleVisible.value = false
  logoAnimClass.value = LOGO_HOVER_ANIMS[Math.floor(Math.random() * LOGO_HOVER_ANIMS.length)]
  logoBubbleText.value = LOGO_QUIPS.value[Math.floor(Math.random() * LOGO_QUIPS.value.length)]
  updateBubblePos(e)
  logoBubbleVisible.value = true
}
function onLogoClick(e) {
  // pick a dance different from the current one
  let nextDance
  do {
    nextDance = LOGO_DANCE_ANIMS[Math.floor(Math.random() * LOGO_DANCE_ANIMS.length)]
  } while (nextDance === logoAnimClass.value && LOGO_DANCE_ANIMS.length > 1)

  logoDancing.value = true
  logoAnimClass.value = ''
  clearTimeout(logoDanceTimer)
  clearTimeout(logoBubbleTimer)

  // force re-trigger animation by flushing the class for one frame
  nextTick(() => {
    logoAnimClass.value = nextDance
    // show new speech
    logoBubbleText.value = LOGO_QUIPS.value[Math.floor(Math.random() * LOGO_QUIPS.value.length)]
    if (logoWrapRef.value) {
      const rect = logoWrapRef.value.getBoundingClientRect()
      logoBubbleStyle.value = bubbleStyle(rect.left + rect.width / 2, rect.bottom + 12)
    }
    logoBubbleVisible.value = true
    logoDanceTimer = setTimeout(() => {
      logoDancing.value = false
      logoAnimClass.value = ''
      logoBubbleVisible.value = false
    }, 5000)
  })
}
function onLogoMouseMove(e) {
  if (logoBubbleVisible.value) updateBubblePos(e)
}
function updateBubblePos(e) {
  logoBubbleStyle.value = bubbleStyle(e.clientX, e.clientY + 16)
}
function onLogoLeave() {
  clearTimeout(logoBubbleTimer)
  logoBubbleTimer = setTimeout(() => {
    logoBubbleVisible.value = false
    if (!logoDancing.value) logoAnimClass.value = ''
  }, 150)
}

const focusBulbAnimClass = ref('')
let focusBulbAnimTimer = null

function onFocusBulbHover() {
  if (logoDancing.value || !logoWrapRef.value) return
  // animate the icon
  clearTimeout(focusBulbAnimTimer)
  focusBulbAnimClass.value = LOGO_HOVER_ANIMS[Math.floor(Math.random() * LOGO_HOVER_ANIMS.length)]
  focusBulbAnimTimer = setTimeout(() => { focusBulbAnimClass.value = '' }, 700)
  // speech from robot
  showLogoHintBubble(focusModeStore.isFocusMode ? t('focusMode.exitFocusMode') : t('focusMode.enterFocusMode'))
}

function showLogoHintBubble(text) {
  if (logoDancing.value || !logoWrapRef.value) return
  clearTimeout(logoBubbleTimer)
  const rect = logoWrapRef.value.getBoundingClientRect()
  logoBubbleText.value = text
  logoBubbleStyle.value = bubbleStyle(rect.left + rect.width / 2, rect.bottom + 12)
  logoBubbleVisible.value = true
}
function onFocusBulbLeave() {
  clearTimeout(logoBubbleTimer)
  logoBubbleTimer = setTimeout(() => { logoBubbleVisible.value = false }, 150)
}

function onTitlebarLogoHintEnter(e) {
  const text = e?.detail?.text
  if (!text) return
  showLogoHintBubble(text)
}

function onTitlebarLogoHintLeave() {
  onFocusBulbLeave()
}

// ── SVG Icon Components ──────────────────────────────────────────────────────
const IconNews = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2' }),
    h('line', { x1: '10', y1: '6', x2: '18', y2: '6' }),
    h('line', { x1: '10', y1: '10', x2: '18', y2: '10' }),
    h('line', { x1: '10', y1: '14', x2: '14', y2: '14' })
  ])
})

const IconChats = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' })
  ])
})

const IconAgents = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }),
    h('circle', { cx: '12', cy: '7', r: '4' })
  ])
})

const IconSystemAgents = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }),
    h('circle', { cx: '9', cy: '7', r: '4' }),
    h('path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87' }),
    h('path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' })
  ])
})

const IconUserPersona = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('circle', { cx: '12', cy: '12', r: '10' }),
    h('circle', { cx: '12', cy: '10', r: '3' }),
    h('path', { d: 'M6.5 19a6 6 0 0 1 11 0' })
  ])
})

const IconCapabilities = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('rect', { x: '3',  y: '3',  width: '7', height: '7', rx: '1' }),
    h('rect', { x: '14', y: '3',  width: '7', height: '7', rx: '1' }),
    h('rect', { x: '3',  y: '14', width: '7', height: '7', rx: '1' }),
    h('rect', { x: '14', y: '14', width: '7', height: '7', rx: '1' })
  ])
})

const IconSkills = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })
  ])
})

const IconKnowledge = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' }),
    h('path', { d: 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' })
  ])
})

const IconMcp = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83' }),
    h('circle', { cx: '12', cy: '12', r: '3' })
  ])
})

const IconNotes = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
    h('polyline', { points: '14 2 14 8 20 8' }),
    h('line', { x1: '16', y1: '13', x2: '8', y2: '13' }),
    h('line', { x1: '16', y1: '17', x2: '8', y2: '17' }),
    h('polyline', { points: '10 9 9 9 8 9' })
  ])
})

const IconTools = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' })
  ])
})

const IconTaskEngine = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('rect', { x: '7', y: '7', width: '10', height: '10', rx: '1' }),
    h('path', { d: 'M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3' })
  ])
})

const IconAiTasks = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('rect', { x: '3', y: '3', width: '7', height: '7', rx: '1' }),
    h('rect', { x: '14', y: '3', width: '7', height: '7', rx: '1' }),
    h('rect', { x: '3', y: '14', width: '7', height: '7', rx: '1' }),
    h('path', { d: 'M17.5 14v7M14 17.5h7' })
  ])
})

const IconConfig = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('circle', { cx: '12', cy: '12', r: '3' }),
    h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' })
  ])
})

const IconLanguage = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('circle', { cx: '12', cy: '12', r: '10' }),
    h('line', { x1: '2', y1: '12', x2: '22', y2: '12' }),
    h('path', { d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' })
  ])
})

defineExpose({ toggleCollapse, isCollapsed })

// ── NavItem Component ────────────────────────────────────────────────────────
const NavItem = defineComponent({
  props: { to: String, label: String, icon: Object, isCollapsed: { type: Boolean, default: false }, class: String, highlight: { type: Boolean, default: false } },
  setup(props) {
    return () => {
      const isActive = route.path === props.to || route.path.startsWith(props.to + '/')
      return h(RouterLink, {
        to: props.to,
        class: [
          'nav-item',
          isActive ? 'nav-item-active' : 'nav-item-inactive',
          props.highlight ? 'nav-item-highlight' : '',
          props.class
        ],
        style: props.isCollapsed ? 'justify-content:center;' : '',
        onMouseenter: props.isCollapsed ? (e) => showNavTooltip(props.label, e) : undefined,
        onMouseleave: props.isCollapsed ? () => hideNavTooltip() : undefined,
        'aria-current': isActive ? 'page' : undefined,
      }, {
        default: () => {
          const children = [h(props.icon, { style: 'width:18px;height:18px;flex-shrink:0;' })]
          if (!props.isCollapsed) {
            children.push(h('span', { style: 'font-size:var(--nav-item-fs, var(--fs-secondary));font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' }, props.label))
          }
          return children
        }
      })
    }
  }
})
</script>

<style scoped>
/* Responsive nav-item font size — smaller labels on smaller viewports so a
   tight sidebar can still display the longest English labels without ellipsis.
   Inline styles on spans read this var via `var(--nav-item-fs, ...)`. */
nav {
  --nav-item-fs: var(--fs-secondary);            /* 0.875rem / 14px default */
}
@media (max-width: 1439px) {
  nav { --nav-item-fs: 0.8125rem; }               /* 13px */
}
@media (max-width: 1023px) {
  nav { --nav-item-fs: 0.78125rem; }              /* 12.5px */
}
@media (max-width: 767px) {
  nav { --nav-item-fs: 0.75rem; }                 /* 12px */
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 0.0625rem;
}

/* Spacing between sections when expanded — no divider */
.nav-section + .nav-section {
  margin-top: 0.375rem;
}

/* Divider between sections when collapsed */
.nav-section.collapsed + .nav-section.collapsed {
  margin-top: 0.375rem;
  padding-top: 0.375rem;
  border-top: 1px solid #F0F0F0;
}

.nav-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 1.5rem;
  padding: 0 0.25rem;
}

.nav-section-label {
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #374151;
  padding: 0 0.5rem;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5625rem 0.75rem;
  border-radius: 0.625rem;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 0.0625rem;
  text-decoration: none;
  font-family: 'Inter', sans-serif;
}

.nav-item-active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}

.nav-item-highlight {
  position: relative;
}

.nav-item-highlight::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 0.375rem;
  transform: translateY(-50%);
  width: 0.375rem;
  height: 0.375rem;
  background: linear-gradient(135deg, #5C4033 0%, #8B6F5E 100%);
  border-radius: 50%;
  animation: nav-dot-blink 1s ease-in-out infinite;
  box-shadow: 0 0 0.5rem rgba(92, 64, 51, 0.4);
}

@keyframes nav-dot-blink {
  0%, 100% {
    opacity: 0.4;
    transform: translateY(-50%) scale(1);
  }
  50% {
    opacity: 1;
    transform: translateY(-50%) scale(1.4);
  }
}

.nav-item-inactive {
  color: #6B7280;
}

.nav-item-inactive:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
}

.nav-header-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.nav-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #9CA3AF;
  cursor: pointer;
  border-radius: 0.5rem;
  transition: background 0.15s, color 0.15s;
}
.nav-collapse-btn:hover {
  background: #F5F5F5;
  color: #1A1A1A;
}

/* ── Focus lightbulb button ── */
.focus-bulb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  cursor: pointer;
  z-index: 1;
}
.focus-bulb-titlebar {
  position: static;
  top: auto;
  right: auto;
  z-index: auto;
}
.focus-bulb-active {
  background: transparent;
}
.focus-bulb-emoji {
  font-size: 1rem;
  line-height: 1;
  filter: grayscale(1);
  transition: filter 0.2s ease;
  pointer-events: none;
}
.focus-bulb-active .focus-bulb-emoji {
  filter: grayscale(0) brightness(1);
}
.focus-bulb-spin {
  animation: focus-bulb-rotate 8s linear infinite;
}
@keyframes focus-bulb-rotate {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ── Minibar button ── */
.minibar-bulb {
  position: absolute;
  top: 0.875rem;
  right: 2.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  padding: 0;
  border-radius: 0.5rem;
  background: transparent;
  cursor: pointer;
  z-index: 1;
}
.minibar-bulb-active {
  background: transparent;
}
.minibar-bulb-emoji {
  font-size: 1.25rem;
  line-height: 1;
  filter: grayscale(1);
  transition: filter 0.2s ease;
  pointer-events: none;
}
.minibar-bulb-active .minibar-bulb-emoji {
  filter: grayscale(0) brightness(1);
}

/* ── Voice call indicator ─────────────────────────────────────────────── */
.sidebar-call-indicator {
  display: flex; align-items: center; gap: 0.5rem;
  margin: 0.5rem 0.75rem 0; padding: 0.5rem 0.75rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.625rem; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  transition: all 0.15s ease;
  animation: sidebarCallPulse 2s ease-in-out infinite;
}
.sidebar-call-indicator:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.sidebar-call-dot {
  width: 0.5rem; height: 0.5rem; border-radius: 50%;
  background: #10B981; flex-shrink: 0;
  box-shadow: 0 0 6px rgba(16,185,129,0.5);
  animation: dotPulse 1.5s ease-in-out infinite;
}
.sidebar-call-text {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  font-weight: 600; color: #FFFFFF; white-space: nowrap;
}
.sidebar-call-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small);
  color: rgba(255,255,255,0.6); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
@keyframes dotPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
}
@keyframes sidebarCallPulse {
  0%, 100% { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
  50% { box-shadow: 0 2px 12px rgba(16,185,129,0.15), 0 2px 8px rgba(0,0,0,0.12); }
}

@media (prefers-reduced-motion: reduce) {
  .nav-item {
    transition: none;
  }
  .sidebar-call-indicator, .sidebar-call-dot { animation: none; }
}

/* ── Chats row with configure button ── */
.chats-row-wrap {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  border-radius: 0.625rem;
  margin-bottom: 0.0625rem;
}

.chats-main-item {
  flex: 1;
  margin-bottom: 0 !important;
}

/* ── Capabilities toggle button (peer with System Agents / User Personas) ── */
.capabilities-toggle {
  width: 100%;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.capabilities-toggle .capabilities-label {
  flex: 1;
  font-size: var(--fs-secondary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.capabilities-chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: #9CA3AF;
  transition: transform 0.15s ease;
}
.capabilities-chevron.open {
  transform: rotate(180deg);
}

/* ── Agent capabilities submenu ── */
.agent-submenu {
  padding-left: 0.75rem;
  border-left: 2px solid #F0F0F0;
  margin-left: 0.875rem;
  margin-bottom: 0.125rem;
  display: flex;
  flex-direction: column;
  gap: 0.0625rem;
}

.chats-config-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #9CA3AF;
  cursor: pointer;
  border-radius: 0.5rem;
  transition: background 0.15s, color 0.15s;
}
.chats-config-btn:hover,
.chats-config-btn-open {
  background: #F5F5F5;
  color: #1A1A1A;
}

/* ── Logo easter egg ── */
.logo-img {
  background: transparent;
  filter:
    drop-shadow(0 3px 8px rgba(0,0,0,0.13))
    drop-shadow(0 6px 18px rgba(0,0,0,0.10))
    drop-shadow(0 1px 3px rgba(0,0,0,0.08));
}
.logo-wrap {
  position: relative;
  display: inline-flex;
  cursor: pointer;
}

/* ── 50 one-shot hover animations ── */
.logo-anim-wiggle    { animation: la-wiggle    0.55s ease-in-out; }
.logo-anim-bounce    { animation: la-bounce    0.55s ease-in-out; }
.logo-anim-spin      { animation: la-spin      0.5s  ease-in-out; }
.logo-anim-rubber    { animation: la-rubber    0.6s  ease-in-out; }
.logo-anim-shake     { animation: la-shake     0.5s  ease-in-out; }
.logo-anim-flip      { animation: la-flip      0.6s  ease-in-out; }
.logo-anim-pulse     { animation: la-pulse     0.5s  ease-in-out; }
.logo-anim-tada      { animation: la-tada      0.6s  ease-in-out; }
.logo-anim-jello     { animation: la-jello     0.7s  ease-in-out; }
.logo-anim-swing     { animation: la-swing     0.55s ease-in-out; }
.logo-anim-nod       { animation: la-nod       0.5s  ease-in-out; }
.logo-anim-boing     { animation: la-boing     0.6s  cubic-bezier(.36,.07,.19,.97); }
.logo-anim-tilt      { animation: la-tilt      0.45s ease-in-out; }
.logo-anim-glitch    { animation: la-glitch    0.4s  steps(1); }
.logo-anim-heartbeat { animation: la-heartbeat 0.5s  ease-in-out; }
.logo-anim-wobble    { animation: la-wobble    0.6s  ease-in-out; }
.logo-anim-spin-x    { animation: la-spin-x    0.55s ease-in-out; }
.logo-anim-sway      { animation: la-sway      0.6s  ease-in-out; }
.logo-anim-pop       { animation: la-pop       0.4s  cubic-bezier(.175,.885,.32,1.275); }
.logo-anim-roll      { animation: la-roll      0.6s  ease-in-out; }
.logo-anim-zoom      { animation: la-zoom      0.45s cubic-bezier(.175,.885,.32,1.275); }
.logo-anim-shrink    { animation: la-shrink    0.45s ease-in-out; }
.logo-anim-skew      { animation: la-skew      0.5s  ease-in-out; }
.logo-anim-drop      { animation: la-drop      0.5s  ease-in-out; }
.logo-anim-rise      { animation: la-rise      0.5s  cubic-bezier(.175,.885,.32,1.275); }
.logo-anim-stamp     { animation: la-stamp     0.4s  cubic-bezier(.36,.07,.19,.97); }
.logo-anim-flash     { animation: la-flash     0.5s  steps(1); }
.logo-anim-ping      { animation: la-ping      0.5s  ease-out; }
.logo-anim-stretch   { animation: la-stretch   0.55s ease-in-out; }
.logo-anim-squeeze   { animation: la-squeeze   0.5s  ease-in-out; }
.logo-anim-pendulum  { animation: la-pendulum  0.7s  ease-in-out; }
.logo-anim-earthquake{ animation: la-earthquake 0.4s steps(1); }
.logo-anim-explode   { animation: la-explode   0.5s  ease-in-out; }
.logo-anim-implode   { animation: la-implode   0.5s  ease-in-out; }
.logo-anim-bounce-x  { animation: la-bounce-x  0.55s ease-in-out; }
.logo-anim-dizzy     { animation: la-dizzy     0.6s  ease-in-out; }
.logo-anim-hiccup    { animation: la-hiccup    0.5s  ease-in-out; }
.logo-anim-electric  { animation: la-electric  0.4s  steps(1); }
.logo-anim-drunk     { animation: la-drunk     0.8s  ease-in-out; }
.logo-anim-yo-yo     { animation: la-yo-yo     0.6s  ease-in-out; }
.logo-anim-spring    { animation: la-spring    0.6s  cubic-bezier(.175,.885,.32,1.275); }
.logo-anim-snap      { animation: la-snap      0.35s cubic-bezier(.36,.07,.19,.97); }
.logo-anim-shimmy    { animation: la-shimmy    0.4s  ease-in-out; }
.logo-anim-twitch    { animation: la-twitch    0.35s steps(1); }
.logo-anim-kaboom    { animation: la-kaboom    0.55s cubic-bezier(.175,.885,.32,1.275); }
.logo-anim-float     { animation: la-float     0.8s  ease-in-out; }
.logo-anim-sink      { animation: la-sink      0.5s  ease-in-out; }
.logo-anim-lean      { animation: la-lean      0.5s  ease-in-out; }
.logo-anim-orbit     { animation: la-orbit     0.7s  ease-in-out; }
.logo-anim-blur      { animation: la-blur      0.5s  ease-in-out; }

@keyframes la-wiggle {
  0%,100% { transform: rotate(0) scale(1); }
  20% { transform: rotate(-9deg) scale(1.08); }
  40% { transform: rotate(7deg) scale(1.11); }
  60% { transform: rotate(-5deg) scale(1.07); }
  80% { transform: rotate(3deg) scale(1.04); }
}
@keyframes la-bounce {
  0%,100% { transform: translateY(0) scale(1); }
  30% { transform: translateY(-14px) scale(1.06); }
  60% { transform: translateY(-6px) scale(1.03); }
  80% { transform: translateY(-10px) scale(1.04); }
}
@keyframes la-spin {
  0%   { transform: rotate(0) scale(1); }
  50%  { transform: rotate(180deg) scale(1.1); }
  100% { transform: rotate(360deg) scale(1); }
}
@keyframes la-rubber {
  0%,100% { transform: scale(1,1); }
  30% { transform: scale(1.25,0.75); }
  50% { transform: scale(0.85,1.15); }
  65% { transform: scale(1.05,0.95); }
  80% { transform: scale(0.97,1.03); }
}
@keyframes la-shake {
  0%,100% { transform: translateX(0); }
  15% { transform: translateX(-7px) rotate(-3deg); }
  30% { transform: translateX(6px) rotate(2deg); }
  45% { transform: translateX(-5px) rotate(-2deg); }
  60% { transform: translateX(4px) rotate(1deg); }
  75% { transform: translateX(-3px); }
}
@keyframes la-flip {
  0%   { transform: perspective(200px) rotateY(0); }
  40%  { transform: perspective(200px) rotateY(-160deg) scale(1.08); }
  100% { transform: perspective(200px) rotateY(-360deg) scale(1); }
}
@keyframes la-pulse {
  0%,100% { transform: scale(1); }
  25% { transform: scale(1.18); }
  50% { transform: scale(0.93); }
  75% { transform: scale(1.10); }
}
@keyframes la-tada {
  0%,100% { transform: scale(1) rotate(0); }
  10%,20% { transform: scale(0.9) rotate(-4deg); }
  30%,50%,70% { transform: scale(1.1) rotate(4deg); }
  40%,60%     { transform: scale(1.1) rotate(-4deg); }
  80%,90% { transform: scale(1.1) rotate(2deg); }
}
@keyframes la-jello {
  0%,100% { transform: skew(0deg,0deg); }
  30% { transform: skew(-10deg,-5deg); }
  50% { transform: skew(8deg,4deg); }
  65% { transform: skew(-6deg,-3deg); }
  80% { transform: skew(4deg,2deg); }
  90% { transform: skew(-2deg,-1deg); }
}
@keyframes la-swing {
  0%,100% { transform: rotate(0); transform-origin: top center; }
  20% { transform: rotate(12deg); transform-origin: top center; }
  40% { transform: rotate(-9deg); transform-origin: top center; }
  60% { transform: rotate(6deg); transform-origin: top center; }
  80% { transform: rotate(-3deg); transform-origin: top center; }
}
@keyframes la-nod {
  0%,100% { transform: rotateX(0deg); }
  25% { transform: rotateX(-20deg); }
  75% { transform: rotateX(15deg); }
}
@keyframes la-boing {
  0%   { transform: scale(1); }
  20%  { transform: scale(0.8,1.2); }
  40%  { transform: scale(1.2,0.85); }
  60%  { transform: scale(0.93,1.07); }
  80%  { transform: scale(1.04,0.97); }
  100% { transform: scale(1); }
}
@keyframes la-tilt {
  0%,100% { transform: rotate(0); }
  33% { transform: rotate(-15deg) scale(1.08); }
  66% { transform: rotate(10deg) scale(1.05); }
}
@keyframes la-glitch {
  0%   { transform: translate(0); filter: none; }
  10%  { transform: translate(-4px, 2px); filter: hue-rotate(90deg); }
  20%  { transform: translate(4px,-2px); filter: hue-rotate(180deg); }
  30%  { transform: translate(-3px, 3px); filter: hue-rotate(270deg); }
  40%  { transform: translate(3px,-1px); filter: none; }
  50%  { transform: translate(-2px, 2px); filter: hue-rotate(45deg); }
  60%  { transform: translate(2px, 0px); filter: none; }
  70%  { transform: translate(-4px,-2px); filter: hue-rotate(90deg); }
  80%  { transform: translate(3px, 1px); filter: none; }
  100% { transform: translate(0); filter: none; }
}
@keyframes la-heartbeat {
  0%,100% { transform: scale(1); }
  14% { transform: scale(1.2); }
  28% { transform: scale(1); }
  42% { transform: scale(1.15); }
  56% { transform: scale(1); }
}
@keyframes la-wobble {
  0%,100% { transform: translateX(0) rotate(0); }
  15% { transform: translateX(-6px) rotate(-5deg); }
  30% { transform: translateX(5px) rotate(3deg); }
  45% { transform: translateX(-4px) rotate(-3deg); }
  60% { transform: translateX(3px) rotate(2deg); }
  75% { transform: translateX(-2px) rotate(-1deg); }
}
@keyframes la-spin-x {
  0%   { transform: perspective(200px) rotateX(0); }
  50%  { transform: perspective(200px) rotateX(180deg) scale(1.1); }
  100% { transform: perspective(200px) rotateX(360deg) scale(1); }
}
@keyframes la-sway {
  0%,100% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(-8px) rotate(-4deg); }
  75% { transform: translateX(8px) rotate(4deg); }
}
@keyframes la-pop {
  0%   { transform: scale(0.8); opacity: 0.7; }
  60%  { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes la-roll       { 0% { transform: translateX(0) rotate(0); } 40% { transform: translateX(8px) rotate(180deg); } 100% { transform: translateX(0) rotate(360deg); } }
@keyframes la-zoom       { 0% { transform: scale(1); } 50% { transform: scale(1.35); } 100% { transform: scale(1); } }
@keyframes la-shrink     { 0% { transform: scale(1); } 40% { transform: scale(0.6); } 100% { transform: scale(1); } }
@keyframes la-skew       { 0%,100% { transform: skewX(0); } 25% { transform: skewX(-18deg) scale(1.05); } 75% { transform: skewX(14deg) scale(1.05); } }
@keyframes la-drop       { 0% { transform: translateY(0) scale(1); } 30% { transform: translateY(12px) scale(0.95,1.05); } 60% { transform: translateY(-5px) scale(1.03,0.97); } 100% { transform: translateY(0) scale(1); } }
@keyframes la-rise       { 0% { transform: translateY(0); } 50% { transform: translateY(-20px) scale(1.08); } 100% { transform: translateY(0) scale(1); } }
@keyframes la-stamp      { 0% { transform: scale(1) translateY(0); } 20% { transform: scale(1.2,0.6) translateY(8px); } 50% { transform: scale(0.9,1.2) translateY(-4px); } 100% { transform: scale(1) translateY(0); } }
@keyframes la-flash      { 0%,100% { opacity:1; } 20%,60% { opacity:0; } 40%,80% { opacity:1; } }
@keyframes la-ping       { 0% { transform: scale(1); opacity:1; } 70% { transform: scale(1.4); opacity:0.3; } 100% { transform: scale(1); opacity:1; } }
@keyframes la-stretch    { 0%,100% { transform: scaleX(1); } 30% { transform: scaleX(1.5) scaleY(0.75); } 70% { transform: scaleX(0.75) scaleY(1.2); } }
@keyframes la-squeeze    { 0%,100% { transform: scaleY(1); } 30% { transform: scaleY(0.55) scaleX(1.35); } 70% { transform: scaleY(1.25) scaleX(0.88); } }
@keyframes la-pendulum   { 0%,100% { transform: rotate(0); transform-origin: top center; } 25% { transform: rotate(20deg); transform-origin: top center; } 75% { transform: rotate(-20deg); transform-origin: top center; } }
@keyframes la-earthquake { 0%,100% { transform: translate(0); } 11% { transform: translate(-5px,3px); } 22% { transform: translate(4px,-4px); } 33% { transform: translate(-6px,2px); } 44% { transform: translate(5px,-3px); } 55% { transform: translate(-3px,5px); } 66% { transform: translate(6px,-2px); } 77% { transform: translate(-4px,4px); } 88% { transform: translate(3px,-5px); } }
@keyframes la-explode    { 0% { transform: scale(1); } 40% { transform: scale(1.5); opacity:0.7; } 100% { transform: scale(1); opacity:1; } }
@keyframes la-implode    { 0% { transform: scale(1); } 40% { transform: scale(0.4); opacity:0.6; } 100% { transform: scale(1); opacity:1; } }
@keyframes la-bounce-x   { 0%,100% { transform: translateX(0) scale(1); } 30% { transform: translateX(-16px) scaleX(0.9); } 60% { transform: translateX(10px) scaleX(1.05); } 80% { transform: translateX(-6px); } }
@keyframes la-dizzy      { 0% { transform: rotate(0) scale(1); } 25% { transform: rotate(90deg) scale(1.1); } 50% { transform: rotate(200deg) scale(0.9); } 75% { transform: rotate(310deg) scale(1.1); } 100% { transform: rotate(360deg) scale(1); } }
@keyframes la-hiccup     { 0%,100% { transform: translateY(0); } 20% { transform: translateY(-10px) scale(1.05); } 40% { transform: translateY(0); } 60% { transform: translateY(-6px) scale(1.03); } 80% { transform: translateY(0); } }
@keyframes la-electric   { 0%,100% { transform:translate(0); filter:none; } 12% { transform:translate(3px,-2px); filter:brightness(1.8); } 25% { transform:translate(-3px,2px); filter:brightness(0.6); } 37% { transform:translate(4px,1px); filter:brightness(2) hue-rotate(60deg); } 50% { transform:translate(-2px,-3px); filter:none; } 62% { transform:translate(3px,2px); filter:brightness(1.6); } 75% { transform:translate(-4px,-1px); filter:brightness(0.7); } 87% { transform:translate(2px,3px); filter:brightness(1.4); } }
@keyframes la-drunk      { 0%,100% { transform: rotate(0) translateX(0); } 20% { transform: rotate(-8deg) translateX(-6px); } 40% { transform: rotate(6deg) translateX(8px); } 60% { transform: rotate(-5deg) translateX(-4px) translateY(-4px); } 80% { transform: rotate(4deg) translateX(5px); } }
@keyframes la-yo-yo      { 0%,100% { transform: scaleY(1) translateY(0); } 25% { transform: scaleY(0.7) scaleX(1.2) translateY(6px); } 50% { transform: scaleY(1.3) scaleX(0.85) translateY(-10px); } 75% { transform: scaleY(0.85) scaleX(1.1) translateY(4px); } }
@keyframes la-spring     { 0% { transform: scale(1); } 20% { transform: scale(1.3); } 40% { transform: scale(0.85); } 60% { transform: scale(1.15); } 80% { transform: scale(0.95); } 100% { transform: scale(1); } }
@keyframes la-snap       { 0%,100% { transform: scale(1) rotate(0); } 15% { transform: scale(0.7) rotate(-10deg); } 35% { transform: scale(1.2) rotate(5deg); } 65% { transform: scale(0.95) rotate(-2deg); } }
@keyframes la-shimmy     { 0%,100% { transform: translateX(0); } 15% { transform: translateX(-4px) rotate(-3deg); } 30% { transform: translateX(4px) rotate(3deg); } 45% { transform: translateX(-3px) rotate(-2deg); } 60% { transform: translateX(3px) rotate(2deg); } 75% { transform: translateX(-2px); } 90% { transform: translateX(2px); } }
@keyframes la-twitch     { 0%,100% { transform: translate(0); } 10% { transform: translate(2px,-1px) rotate(2deg); } 20% { transform: translate(-3px,2px) rotate(-3deg); } 30% { transform: translate(1px,-3px); } 40% { transform: translate(-2px,1px) rotate(-1deg); } 50% { transform: translate(3px,2px) rotate(3deg); } 60% { transform: translate(-1px,-2px); } 70% { transform: translate(2px,1px) rotate(-2deg); } 80% { transform: translate(-3px,-1px) rotate(1deg); } 90% { transform: translate(1px,2px); } }
@keyframes la-kaboom     { 0% { transform: scale(1); } 15% { transform: scale(0.6) rotate(-5deg); } 50% { transform: scale(1.6) rotate(3deg); } 75% { transform: scale(0.92) rotate(-1deg); } 100% { transform: scale(1) rotate(0); } }
@keyframes la-float      { 0%,100% { transform: translateY(0) scale(1); } 30% { transform: translateY(-12px) scale(1.04); } 70% { transform: translateY(-8px) scale(1.02); } }
@keyframes la-sink       { 0%,100% { transform: translateY(0) scale(1); } 40% { transform: translateY(10px) scale(0.95,1.05); } 70% { transform: translateY(5px) scale(0.97,1.02); } }
@keyframes la-lean       { 0%,100% { transform: rotate(0) skewX(0); } 30% { transform: rotate(-12deg) skewX(-6deg); } 70% { transform: rotate(10deg) skewX(5deg); } }
@keyframes la-orbit      { 0% { transform: translate(0,0) rotate(0); } 25% { transform: translate(10px,-8px) rotate(90deg); } 50% { transform: translate(0,-14px) rotate(180deg); } 75% { transform: translate(-10px,-8px) rotate(270deg); } 100% { transform: translate(0,0) rotate(360deg); } }
@keyframes la-blur       { 0%,100% { filter: blur(0); transform: scale(1); } 30% { filter: blur(4px); transform: scale(1.08); } 70% { filter: blur(2px); transform: scale(1.03); } }

/* ── 50 looping dance animations (5 s) ── */
.logo-dance-robot         { animation: ld-robot         0.5s  ease-in-out infinite alternate; }
.logo-dance-bounce        { animation: ld-bounce        0.55s cubic-bezier(.36,.07,.19,.97) infinite alternate; }
.logo-dance-spin360       { animation: ld-spin360       0.7s  linear infinite; }
.logo-dance-floss         { animation: ld-floss         0.55s ease-in-out infinite alternate; }
.logo-dance-worm          { animation: ld-worm          0.55s ease-in-out infinite; }
.logo-dance-moonwalk      { animation: ld-moonwalk      0.6s  ease-in-out infinite alternate; }
.logo-dance-headbang      { animation: ld-headbang      0.5s  ease-in-out infinite alternate; }
.logo-dance-wave          { animation: ld-wave          0.8s  ease-in-out infinite; }
.logo-dance-shuffle       { animation: ld-shuffle       0.55s ease-in-out infinite alternate; }
.logo-dance-twist         { animation: ld-twist         0.5s  ease-in-out infinite alternate; }
.logo-dance-disco         { animation: ld-disco         0.5s  ease-in-out infinite; }
.logo-dance-thriller      { animation: ld-thriller      0.6s  ease-in-out infinite; }
.logo-dance-carlton       { animation: ld-carlton       0.55s ease-in-out infinite; }
.logo-dance-hammer        { animation: ld-hammer        0.5s  cubic-bezier(.36,.07,.19,.97) infinite alternate; }
.logo-dance-sprinkler     { animation: ld-sprinkler     0.5s  ease-in-out infinite; }
.logo-dance-salsa         { animation: ld-salsa         0.5s  ease-in-out infinite alternate; }
.logo-dance-jive          { animation: ld-jive          0.55s ease-in-out infinite; }
.logo-dance-macarena      { animation: ld-macarena      0.7s  ease-in-out infinite; }
.logo-dance-mosh          { animation: ld-mosh          1.2s  ease-in-out infinite; }
.logo-dance-poplock       { animation: ld-poplock       0.65s ease-in-out infinite; }
.logo-dance-twirl         { animation: ld-twirl         1.2s  linear infinite; }
.logo-dance-gangnam       { animation: ld-gangnam       0.6s  ease-in-out infinite; }
.logo-dance-dab           { animation: ld-dab           0.8s  ease-in-out infinite alternate; }
.logo-dance-krump         { animation: ld-krump         0.5s  cubic-bezier(.36,.07,.19,.97) infinite alternate; }
.logo-dance-running-man   { animation: ld-running-man   0.55s ease-in-out infinite; }
.logo-dance-cabbage       { animation: ld-cabbage       0.55s ease-in-out infinite; }
.logo-dance-breakdance    { animation: ld-breakdance    0.6s  linear infinite; }
.logo-dance-hustle        { animation: ld-hustle        0.55s ease-in-out infinite alternate; }
.logo-dance-cha-cha       { animation: ld-cha-cha       0.55s ease-in-out infinite; }
.logo-dance-electric-slide{ animation: ld-electric-slide 0.5s ease-in-out infinite alternate; }
.logo-dance-watusi        { animation: ld-watusi        0.5s  ease-in-out infinite alternate; }
.logo-dance-whip          { animation: ld-whip          0.5s  ease-in-out infinite alternate; }
.logo-dance-nae-nae       { animation: ld-nae-nae       0.6s  ease-in-out infinite alternate; }
.logo-dance-twerk         { animation: ld-twerk         0.5s  ease-in-out infinite alternate; }
.logo-dance-dubstep       { animation: ld-dubstep       1.0s  ease-in-out infinite; }
.logo-dance-glitch-dance  { animation: ld-glitch-dance  1.0s  ease-in-out infinite; }
.logo-dance-vogueing      { animation: ld-vogueing      0.7s  ease-in-out infinite; }
.logo-dance-locking       { animation: ld-locking       0.7s  ease-in-out infinite; }
.logo-dance-popping       { animation: ld-popping       0.9s  ease-in-out infinite; }
.logo-dance-body-roll     { animation: ld-body-roll     0.7s  ease-in-out infinite; }
.logo-dance-typewriter    { animation: ld-typewriter    0.55s ease-in-out infinite alternate; }
.logo-dance-lindy         { animation: ld-lindy         0.5s  ease-in-out infinite; }
.logo-dance-toprock       { animation: ld-toprock       0.55s ease-in-out infinite alternate; }
.logo-dance-headspin      { animation: ld-headspin      0.5s  linear infinite; }
.logo-dance-pulse-dance   { animation: ld-pulse-dance   0.5s  ease-in-out infinite; }
.logo-dance-orbit-dance   { animation: ld-orbit-dance   1.0s  linear infinite; }
.logo-dance-matrix        { animation: ld-matrix        0.8s  ease-in-out infinite alternate; }
.logo-dance-breakbeat     { animation: ld-breakbeat     1.2s  ease-in-out infinite; }
.logo-dance-windmill      { animation: ld-windmill      0.55s linear infinite; }
.logo-dance-ymca          { animation: ld-ymca          0.7s  ease-in-out infinite; }

@keyframes ld-robot         { 0% { transform: translateY(0) rotate(-8deg) scale(1); } 100% { transform: translateY(-10px) rotate(8deg) scale(1.08); } }
@keyframes ld-bounce        { 0% { transform: translateY(0) scale(1,1); } 100% { transform: translateY(-16px) scale(1.06,0.94); } }
@keyframes ld-spin360       { 0% { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.12); } 100% { transform: rotate(360deg) scale(1); } }
@keyframes ld-floss         { 0% { transform: translateX(-6px) rotate(-15deg) skewX(-5deg); } 100% { transform: translateX(6px) rotate(15deg) skewX(5deg); } }
@keyframes ld-worm          { 0%,100% { transform: scaleX(1) scaleY(1) translateY(0); } 25% { transform: scaleX(1.18) scaleY(0.82) translateY(4px); } 50% { transform: scaleX(0.85) scaleY(1.15) translateY(-8px); } 75% { transform: scaleX(1.10) scaleY(0.90) translateY(3px); } }
@keyframes ld-moonwalk      { 0% { transform: translateX(0) scaleX(1); } 50% { transform: translateX(-12px) scaleX(0.92); } 100% { transform: translateX(0) scaleX(1); } }
@keyframes ld-headbang      { 0% { transform: translateY(0) rotate(0); } 100% { transform: translateY(8px) rotate(-10deg); } }
@keyframes ld-wave          { 0%,100% { transform: rotate(0) translateX(0); } 20% { transform: rotate(-10deg) translateX(-4px) translateY(-6px); } 40% { transform: rotate(8deg) translateX(4px) translateY(-10px); } 60% { transform: rotate(-6deg) translateX(-3px) translateY(-4px); } 80% { transform: rotate(5deg) translateX(3px) translateY(-8px); } }
@keyframes ld-shuffle       { 0% { transform: translateX(-8px) translateY(0); } 100% { transform: translateX(8px) translateY(-4px); } }
@keyframes ld-twist         { 0% { transform: skewX(-15deg) scaleY(0.95); } 100% { transform: skewX(15deg) scaleY(1.05); } }
@keyframes ld-disco         { 0%,100% { transform: rotate(0) translateY(0); } 25% { transform: rotate(15deg) translateY(-8px) scale(1.05); } 50% { transform: rotate(-10deg) translateY(0) scale(0.97); } 75% { transform: rotate(12deg) translateY(-6px) scale(1.04); } }
@keyframes ld-thriller      { 0%,100% { transform: translateX(0) rotate(0); } 20% { transform: translateX(-8px) rotate(-12deg); } 50% { transform: translateX(6px) rotate(10deg) translateY(-4px); } 70% { transform: translateX(-5px) rotate(-8deg); } 90% { transform: translateX(4px) rotate(6deg); } }
@keyframes ld-carlton       { 0%,100% { transform: translateX(0) rotate(0); } 25% { transform: translateX(10px) rotate(5deg) translateY(-6px); } 50% { transform: translateX(0) rotate(0) translateY(-2px); } 75% { transform: translateX(-10px) rotate(-5deg) translateY(-6px); } }
@keyframes ld-hammer        { 0% { transform: translateY(0) scaleY(1); } 100% { transform: translateY(-12px) scaleY(1.1) rotate(5deg); } }
@keyframes ld-sprinkler     { 0%,100% { transform: rotate(-30deg); transform-origin: bottom center; } 50% { transform: rotate(30deg); transform-origin: bottom center; } }
@keyframes ld-salsa         { 0% { transform: translateX(-5px) rotate(-4deg); } 100% { transform: translateX(5px) rotate(4deg) translateY(-4px); } }
@keyframes ld-jive          { 0%,100% { transform: translateY(0) rotate(0); } 20% { transform: translateY(-10px) rotate(8deg) scale(1.06); } 40% { transform: translateY(0) rotate(-5deg); } 60% { transform: translateY(-8px) rotate(6deg) scale(1.04); } 80% { transform: translateY(0) rotate(-3deg); } }
@keyframes ld-macarena      { 0%,100% { transform: rotate(0) translateX(0); } 15% { transform: rotate(-15deg) translateX(-5px); } 30% { transform: rotate(0) translateY(-8px); } 45% { transform: rotate(15deg) translateX(5px); } 60% { transform: rotate(0) translateY(0); } 75% { transform: rotate(-10deg) translateX(-3px) translateY(-4px); } 90% { transform: rotate(10deg) translateX(3px); } }
@keyframes ld-mosh          { 0%,100% { transform: translate(0,0) rotate(0); } 10% { transform: translate(-6px,4px) rotate(-8deg); } 20% { transform: translate(7px,-5px) rotate(10deg); } 30% { transform: translate(-5px,-6px) rotate(-12deg); } 40% { transform: translate(8px,3px) rotate(7deg); } 50% { transform: translate(-4px,7px) rotate(-9deg); } 60% { transform: translate(6px,-4px) rotate(11deg); } 70% { transform: translate(-7px,2px) rotate(-7deg); } 80% { transform: translate(5px,5px) rotate(8deg); } 90% { transform: translate(-3px,-7px) rotate(-10deg); } }
@keyframes ld-poplock       { 0%,100% { transform: scale(1) rotate(0); } 25% { transform: scale(0.85,1.15) rotate(-5deg); } 50% { transform: scale(1.15,0.85) rotate(5deg); } 75% { transform: scale(0.9) rotate(-3deg); } }
@keyframes ld-twirl         { 0% { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.1); } 100% { transform: rotate(360deg) scale(1); } }
@keyframes ld-gangnam       { 0%,100% { transform: translateY(0) translateX(0) rotate(0); } 25% { transform: translateY(-8px) translateX(-6px) rotate(-8deg); } 50% { transform: translateY(-4px) translateX(0) rotate(0) scale(1.05); } 75% { transform: translateY(-8px) translateX(6px) rotate(8deg); } }
@keyframes ld-dab           { 0% { transform: rotate(0) translateX(0); } 100% { transform: rotate(-25deg) translateX(-6px) translateY(-4px); } }
@keyframes ld-krump         { 0% { transform: scale(1) translateY(0) rotate(0); } 100% { transform: scale(1.2,0.85) translateY(6px) rotate(-5deg); } }
@keyframes ld-running-man   { 0%,100% { transform: translateY(0) scaleX(1); } 25% { transform: translateY(-8px) scaleX(0.93) rotate(-3deg); } 50% { transform: translateY(0) scaleX(1) rotate(0); } 75% { transform: translateY(-6px) scaleX(0.95) rotate(3deg); } }
@keyframes ld-cabbage       { 0%,100% { transform: rotate(0) translateX(0); } 33% { transform: rotate(-20deg) translateX(-4px) scale(0.95); } 66% { transform: rotate(20deg) translateX(4px) scale(1.05); } }
@keyframes ld-breakdance    { 0% { transform: rotate(0) translateX(0) translateY(0); } 25% { transform: rotate(90deg) translateX(6px) translateY(-4px); } 50% { transform: rotate(180deg) translateX(0) translateY(-8px); } 75% { transform: rotate(270deg) translateX(-6px) translateY(-4px); } 100% { transform: rotate(360deg) translateX(0) translateY(0); } }
@keyframes ld-hustle        { 0% { transform: translateX(-8px) rotate(-5deg); } 100% { transform: translateX(8px) rotate(5deg); } }
@keyframes ld-cha-cha       { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
@keyframes ld-electric-slide{ 0% { transform: translateX(0) rotate(0); } 100% { transform: translateX(-14px) rotate(-3deg); } }
@keyframes ld-watusi        { 0% { transform: rotate(-8deg) translateX(-4px); } 100% { transform: rotate(8deg) translateX(4px) translateY(-4px); } }
@keyframes ld-whip          { 0% { transform: rotate(0) scaleX(1); } 100% { transform: rotate(-20deg) scaleX(1.1) translateX(6px); } }
@keyframes ld-nae-nae       { 0% { transform: translateX(-6px) rotate(-5deg) translateY(0); } 100% { transform: translateX(6px) rotate(5deg) translateY(-8px); } }
@keyframes ld-twerk         { 0% { transform: scaleY(1) translateY(0); } 100% { transform: scaleY(0.85) scaleX(1.1) translateY(4px); } }
@keyframes ld-dubstep       { 0%,100% { transform: scale(1) rotate(0); } 12% { transform: scale(1.15,0.8) rotate(-8deg) translateY(4px); } 25% { transform: scale(0.85,1.2) rotate(6deg) translateY(-6px); } 37% { transform: scale(1.1,0.85) rotate(-5deg); } 50% { transform: scale(0.9,1.15) rotate(8deg) translateY(-4px); } 62% { transform: scale(1.12,0.82) rotate(-6deg) translateY(3px); } 75% { transform: scale(0.88,1.18) rotate(5deg); } 87% { transform: scale(1.08,0.88) rotate(-4deg); } }
@keyframes ld-glitch-dance  { 0%,100% { transform:translate(0); filter:none; } 10% { transform:translate(-6px,3px); filter:hue-rotate(90deg); } 20% { transform:translate(5px,-4px); filter:hue-rotate(180deg); } 30% { transform:translate(-4px,5px); filter:brightness(1.5); } 40% { transform:translate(6px,-2px); filter:hue-rotate(270deg); } 50% { transform:translate(-3px,4px); filter:none; } 60% { transform:translate(5px,3px); filter:hue-rotate(45deg); } 70% { transform:translate(-6px,-3px); filter:brightness(0.7); } 80% { transform:translate(4px,5px); filter:hue-rotate(135deg); } 90% { transform:translate(-2px,-5px); filter:none; } }
@keyframes ld-vogueing      { 0%,100% { transform: rotate(0) translateX(0); } 20% { transform: rotate(-15deg) translateX(-6px) scale(0.95); } 40% { transform: rotate(10deg) translateX(4px) translateY(-8px); } 60% { transform: rotate(-8deg) translateX(-4px) translateY(-4px); } 80% { transform: rotate(12deg) translateX(6px); } }
@keyframes ld-locking       { 0%,100% { transform: scale(1) rotate(0); } 20% { transform: scale(0.8) rotate(-10deg) translateY(4px); } 40% { transform: scale(1.15) rotate(0); } 60% { transform: scale(0.85) rotate(10deg) translateY(4px); } 80% { transform: scale(1.1) rotate(-5deg); } }
@keyframes ld-popping       { 0%,100% { transform: scale(1); } 15% { transform: scale(1.2,0.75) translateY(6px); } 30% { transform: scale(0.8,1.2) translateY(-8px); } 45% { transform: scale(1.15,0.8) translateY(4px) rotate(5deg); } 60% { transform: scale(0.85,1.15) translateY(-6px) rotate(-4deg); } 75% { transform: scale(1.1,0.85) translateY(3px); } 90% { transform: scale(0.9,1.08) translateY(-3px); } }
@keyframes ld-body-roll     { 0%,100% { transform: rotate(0) scaleX(1); } 20% { transform: rotate(-5deg) scaleX(0.95) translateY(-4px); } 40% { transform: rotate(0) scaleX(1.05) translateY(-8px); } 60% { transform: rotate(5deg) scaleX(0.95) translateY(-4px); } 80% { transform: rotate(0) scaleX(1) translateY(0); } }
@keyframes ld-typewriter    { 0% { transform: translateX(-4px) scaleX(0.95); } 100% { transform: translateX(4px) scaleX(1.05); } }
@keyframes ld-lindy         { 0%,100% { transform: translateX(0) translateY(0) rotate(0); } 25% { transform: translateX(8px) translateY(-6px) rotate(8deg); } 50% { transform: translateX(0) translateY(-10px) rotate(0); } 75% { transform: translateX(-8px) translateY(-6px) rotate(-8deg); } }
@keyframes ld-toprock       { 0% { transform: translateX(-6px) rotate(-4deg) translateY(0); } 100% { transform: translateX(6px) rotate(4deg) translateY(-6px); } }
@keyframes ld-headspin      { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes ld-pulse-dance   { 0%,100% { transform: scale(1); } 25% { transform: scale(1.18) rotate(3deg); } 50% { transform: scale(0.88) rotate(-2deg); } 75% { transform: scale(1.12) rotate(2deg); } }
@keyframes ld-orbit-dance   { 0% { transform: translateX(0) translateY(0) rotate(0); } 25% { transform: translateX(12px) translateY(-8px) rotate(90deg); } 50% { transform: translateX(0) translateY(-14px) rotate(180deg); } 75% { transform: translateX(-12px) translateY(-8px) rotate(270deg); } 100% { transform: translateX(0) translateY(0) rotate(360deg); } }
@keyframes ld-matrix        { 0% { transform: scaleY(1) translateY(0) rotate(0); } 100% { transform: scaleY(0.9) translateY(6px) skewX(5deg) rotate(-3deg); } }
@keyframes ld-breakbeat     { 0%,100% { transform: scale(1) translate(0,0) rotate(0); } 10% { transform: scale(1.1) translate(-4px,-5px) rotate(-6deg); } 20% { transform: scale(0.9) translate(5px,3px) rotate(7deg); } 30% { transform: scale(1.05) translate(-3px,5px) rotate(-5deg); } 40% { transform: scale(0.95) translate(4px,-4px) rotate(6deg); } 50% { transform: scale(1.08) translate(0,6px) rotate(-4deg); } 60% { transform: scale(0.92) translate(-5px,-3px) rotate(5deg); } 70% { transform: scale(1.04) translate(3px,4px) rotate(-7deg); } 80% { transform: scale(0.96) translate(-4px,2px) rotate(4deg); } 90% { transform: scale(1.06) translate(5px,-5px) rotate(-3deg); } }
@keyframes ld-windmill      { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes ld-ymca          { 0%,100% { transform: translateX(0) rotate(0) translateY(0); } 20% { transform: translateX(-8px) rotate(-10deg) translateY(-4px); } 40% { transform: translateX(0) rotate(0) translateY(-10px) scale(1.08); } 60% { transform: translateX(8px) rotate(10deg) translateY(-4px); } 80% { transform: translateX(0) rotate(0) translateY(0) scale(1.05); } }

@media (prefers-reduced-motion: reduce) {
  [class^="logo-anim-"], [class^="logo-dance-"] { animation: none; }
}

</style>

<style>
/* Logo speech bubble — fixed, follows cursor, arrow points up toward mouse */
.logo-bubble-fixed {
  position: fixed;
  /* Center on anchor by default; CSS max() nudges right only when long text would overflow left border */
  translate: max(-50%, calc(12px - var(--bubble-anchor, 50%))) 0;
  max-width: 280px;
  white-space: normal;
  word-break: break-word;
  text-align: center;
  background: #0F0F0F;
  color: #fff;
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.35rem 0.75rem;
  border-radius: 0.625rem;
  box-shadow: 0 6px 20px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.16);
  pointer-events: none;
  z-index: 999999;
  animation: bubble-pop 0.18s ease-out forwards;
}
.logo-bubble-arrow {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-bottom-color: #0F0F0F;
}
@keyframes bubble-pop {
  from { opacity: 0; scale: 0.85; transform: translateY(-4px); }
  to   { opacity: 1; scale: 1;    transform: translateY(0); }
}

/* Nav tooltip — fixed position, escapes all overflow:hidden ancestors */
.nav-tooltip-fixed {
  position: fixed;
  z-index: 99999;
  background: #1A1A1A;
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  padding: 0.3125rem 0.625rem;
  border-radius: 0.375rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  pointer-events: none;
}

/* Tour highlight tip — fixed, positioned to the right of the nav item */
.nav-tour-tip-float {
  position: fixed;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 0.3rem;
  background: linear-gradient(135deg, #5C4033 0%, #8B6F5E 100%);
  color: #FFF8F0;
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.3rem 0.625rem;
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px rgba(92, 64, 51, 0.4);
  white-space: nowrap;
  pointer-events: none;
  z-index: 99999;
  animation: nav-float-shake 0.7s ease-in-out infinite;
}

.nav-tour-tip-arrow {
  font-size: 1rem;
  flex-shrink: 0;
  display: inline-block;
}

@keyframes nav-float-shake {
  0%, 100% {
    transform: translateY(-50%) translateX(0);
    opacity: 0.9;
  }
  30% {
    transform: translateY(-50%) translateX(-0.3rem);
    opacity: 1;
  }
  70% {
    transform: translateY(-50%) translateX(0.15rem);
    opacity: 1;
  }
}

/* Help popover — teleported to body */
.help-popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

.help-popover {
  position: fixed;
  z-index: 9999;
  width: 14rem;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 0.625rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.help-popover-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 0.875rem;
  border-bottom: 1px solid #F0F0F0;
}

.help-privacy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  background: transparent;
  color: #999;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.help-privacy-btn:hover {
  background: #F5F5F5;
  color: #1A1A1A;
}

.demo-modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 9999;
  display: flex; align-items: center; justify-content: center;
}
.demo-modal {
  background: #fff; border-radius: 0.75rem; width: 20rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
}
.demo-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.75rem 1rem; border-bottom: 1px solid #F0F0F0;
}
.demo-modal-close {
  display: flex; align-items: center; justify-content: center;
  width: 1.5rem; height: 1.5rem; border: none; background: transparent;
  color: #999; border-radius: 0.25rem; cursor: pointer;
}
.demo-modal-close:hover { background: #F5F5F5; color: #1A1A1A; }
.demo-modal-body { padding: 1rem; }
.demo-toggle-row {
  display: flex; align-items: center; justify-content: space-between; cursor: pointer;
}
.demo-switch {
  position: relative; width: 2.25rem; height: 1.25rem; border-radius: 9999px;
  background: #D1D5DB; border: none; cursor: pointer; transition: background 0.2s;
  padding: 0;
}
.demo-switch.active { background: #1A1A1A; }
.demo-switch-thumb {
  position: absolute; top: 0.125rem; left: 0.125rem;
  width: 1rem; height: 1rem; border-radius: 50%;
  background: #fff; transition: transform 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}
.demo-switch.active .demo-switch-thumb { transform: translateX(1rem); }

.help-popover-body {
  padding: 0.5rem 0.875rem 0.625rem;
}

.help-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.25rem 0;
}

.help-label {
  font-size: 0.6875rem;
  color: #999;
}

.help-value {
  font-size: 0.6875rem;
  font-weight: 500;
  color: #1A1A1A;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

</style>
