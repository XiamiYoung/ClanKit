<template>
  <Teleport to="body">
    <Transition name="auth-fade">
      <div v-if="visible" class="auth-backdrop">
        <Transition name="auth-pop" appear>
          <div v-if="visible" class="auth-dialog" role="dialog" aria-modal="true">

            <!-- Top-left: language dropdown (syncs config.language) -->
            <div class="auth-lang">
              <svg class="auth-lang-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :aria-label="t('auth.languageLabel')">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              <div class="auth-lang-select-wrap">
                <select
                  id="auth-lang-select"
                  class="auth-lang-select"
                  :value="currentLang"
                  :aria-label="t('auth.languageLabel')"
                  @change="setLanguage($event.target.value)"
                >
                  <option value="en">English</option>
                  <option value="zh">中文</option>
                </select>
                <svg class="auth-lang-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 4.5 6 7.5 9 4.5"/>
                </svg>
              </div>
            </div>

            <!-- Top-right: close button -->
            <button class="auth-close" :aria-label="t('common.close')" @click="onCloseClick">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>

            <!-- ── Hero: animated app icon + name ─────────────────────── -->
            <div class="auth-hero">
              <div
                ref="iconWrapRef"
                class="auth-icon-wrap"
                @mouseenter="onIconHover"
                @click="onIconClick"
              >
                <img
                  :src="appIconUrl"
                  class="auth-icon"
                  :class="iconAnimClass"
                  alt=""
                />
              </div>
              <h1 class="auth-app-name">{{ t('app.name') }}</h1>
            </div>

            <!-- Speech bubble — teleported to body so it escapes the dialog clip -->
            <Teleport to="body">
              <div v-if="bubbleVisible" class="auth-bubble" :style="bubbleStyle">
                {{ bubbleText }}
                <span class="auth-bubble-arrow"></span>
              </div>
            </Teleport>

            <!-- ── Mode tabs ────────────────────────────────────────────── -->
            <div class="auth-tabs">
              <button class="auth-tab" :class="{ active: mode === 'login' }" @click="setMode('login')">
                {{ t('auth.signIn') }}
              </button>
              <button class="auth-tab" :class="{ active: mode === 'register' }" @click="setMode('register')">
                {{ t('auth.signUp') }}
              </button>
            </div>

            <!-- ── Email + password panel ───────────────────────────────── -->
            <div v-if="visibleMethod === 'email'" class="auth-panel">

              <template v-if="step === 'credentials'">
                <template v-if="mode === 'register'">
                  <label class="auth-label">{{ t('auth.nameLabel') }}</label>
                  <input
                    v-model="form.name" type="text" class="auth-input"
                    autocomplete="name" :placeholder="t('auth.namePlaceholder')"
                    @keyup.enter="onSubmitCredentials"
                  />
                </template>

                <label class="auth-label">{{ t('auth.emailLabel') }}</label>
                <input
                  v-model="form.email" type="email" class="auth-input"
                  autocomplete="email" :placeholder="t('auth.emailPlaceholder')"
                  @keyup.enter="onSubmitCredentials"
                />

                <label class="auth-label">{{ t('auth.passwordLabel') }}</label>
                <input
                  v-model="form.password" type="password" class="auth-input"
                  :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
                  :placeholder="t('auth.passwordPlaceholder')"
                  @keyup.enter="onSubmitCredentials"
                />

                <p v-if="error" class="auth-error">{{ error }}</p>

                <button
                  class="auth-cta"
                  :disabled="busy || !form.email || !form.password || (mode === 'register' && !form.name)"
                  @click="onSubmitCredentials"
                >
                  <span v-if="busy" class="auth-spinner" />
                  {{ busy ? t('auth.busy') : (mode === 'login' ? t('auth.signIn') : t('auth.sendCode')) }}
                </button>

                <button v-if="mode === 'login'" class="auth-link" @click="step = 'forgot'; error = ''">
                  {{ t('auth.forgotPassword') }}
                </button>
              </template>

              <template v-if="step === 'verify'">
                <p class="auth-helper">{{ t('auth.otpHelper', { email: form.email }) }}</p>
                <label class="auth-label">{{ t('auth.otpLabel') }}</label>
                <input
                  v-model="form.otp" type="text" inputmode="numeric" maxlength="6"
                  class="auth-input auth-input-otp" autocomplete="one-time-code"
                  placeholder="••••••" @keyup.enter="onSubmitOtp"
                />

                <p v-if="error" class="auth-error">{{ error }}</p>
                <p v-if="info"  class="auth-info">{{ info }}</p>

                <button class="auth-cta" :disabled="busy || form.otp.length !== 6" @click="onSubmitOtp">
                  <span v-if="busy" class="auth-spinner" />
                  {{ busy ? t('auth.busy') : t('auth.verifyAndContinue') }}
                </button>

                <button class="auth-link" @click="step = 'credentials'; error = ''">{{ t('auth.backToStart') }}</button>
              </template>

              <template v-if="step === 'forgot'">
                <p class="auth-helper">{{ t('auth.forgotHelper') }}</p>

                <label class="auth-label">{{ t('auth.emailLabel') }}</label>
                <input
                  v-model="form.email" type="email" class="auth-input"
                  autocomplete="email" @keyup.enter="onRequestReset"
                />

                <p v-if="error" class="auth-error">{{ error }}</p>
                <p v-if="info"  class="auth-info">{{ info }}</p>

                <button class="auth-cta" :disabled="busy || !form.email" @click="onRequestReset">
                  <span v-if="busy" class="auth-spinner" />
                  {{ busy ? t('auth.busy') : t('auth.sendResetCode') }}
                </button>

                <button class="auth-link" @click="step = 'credentials'; error = ''">{{ t('auth.backToStart') }}</button>
              </template>

              <template v-if="step === 'reset'">
                <p class="auth-helper">{{ t('auth.resetHelper', { email: form.email }) }}</p>

                <label class="auth-label">{{ t('auth.otpLabel') }}</label>
                <input
                  v-model="form.otp" type="text" inputmode="numeric" maxlength="6"
                  class="auth-input auth-input-otp" placeholder="••••••"
                />

                <label class="auth-label">{{ t('auth.newPasswordLabel') }}</label>
                <input
                  v-model="form.newPassword" type="password" class="auth-input"
                  autocomplete="new-password" @keyup.enter="onConfirmReset"
                />

                <p v-if="error" class="auth-error">{{ error }}</p>

                <button
                  class="auth-cta"
                  :disabled="busy || form.otp.length !== 6 || !form.newPassword"
                  @click="onConfirmReset"
                >
                  <span v-if="busy" class="auth-spinner" />
                  {{ busy ? t('auth.busy') : t('auth.resetPassword') }}
                </button>
              </template>
            </div>

            <!-- ── Google panel — vertically centered within the reserved height ── -->
            <div v-if="visibleMethod === 'google'" class="auth-panel auth-panel-google">
              <p class="auth-helper">{{ t('auth.googleHelper') }}</p>

              <button class="auth-google-btn" :disabled="busy" @click="onGoogleSignIn">
                <svg class="auth-google-icon" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                </svg>
                <span>{{ busy ? t('auth.busy') : t('auth.continueWithGoogle') }}</span>
              </button>

              <p v-if="error" class="auth-error">{{ error }}</p>
            </div>

            <!-- ── Footer: switch method + skip ────────────────────────── -->
            <div v-if="step === 'credentials'" class="auth-divider">
              <span class="auth-divider-line"></span>
              <span class="auth-divider-or">{{ t('auth.or') }}</span>
              <span class="auth-divider-line"></span>
            </div>

            <button v-if="step === 'credentials'" class="auth-method-toggle" @click="toggleMethod">
              {{ secondaryMethod === 'google' ? t('auth.useGoogleInstead') : t('auth.useEmailInstead') }}
            </button>

            <p class="auth-foot">{{ t('auth.legalNote') }}</p>

            <button type="button" class="auth-skip" @click="onSkip">
              {{ t('auth.skipForNow') }}
            </button>

          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import { useAuth } from '../../composables/useAuth'
import { useConfigStore } from '../../stores/config'
import appIconUrl from '@/assets/icon.png'

const { t } = useI18n()
const auth = useAuth()
const configStore = useConfigStore()

const visible = computed(() => auth.dialogOpen.value)

// ── Language toggle (syncs config.language) ────────────────────────────────
const currentLang = computed(() => (configStore.config.language || 'en').startsWith('zh') ? 'zh' : 'en')
function setLanguage(lang) {
  if (currentLang.value === lang) return
  configStore.saveConfig({ language: lang })
}

// ── Mode + step state, reset whenever the dialog opens ─────────────────────
const mode = ref('login')          // 'login' | 'register'
const step = ref('credentials')    // 'credentials' | 'verify' | 'forgot' | 'reset'

// User-driven override of the locale-default method. null = follow language.
const userMethodOverride = ref(null)
const visibleMethod = computed(() => userMethodOverride.value ?? auth.primaryMethod.value)
const secondaryMethod = computed(() => visibleMethod.value === 'google' ? 'email' : 'google')

const form = ref({ name: '', email: '', password: '', otp: '', newPassword: '' })
const error = ref('')
const info  = ref('')
const busy  = ref(false)

watch(visible, (open) => {
  if (open) {
    userMethodOverride.value = null     // re-follow language default each time the dialog opens
    mode.value = 'login'
    step.value = 'credentials'
    form.value = { name: '', email: '', password: '', otp: '', newPassword: '' }
    error.value = ''
    info.value  = ''
    busy.value  = false
  }
})

// When language changes mid-session, snap back to that language's default method.
watch(() => configStore.config.language, () => {
  userMethodOverride.value = null
  step.value = 'credentials'
  error.value = ''
  info.value  = ''
})

watch(step, (s) => {
  if (s === 'credentials') {
    form.value.otp = ''
    form.value.newPassword = ''
  }
})

function setMode(next) {
  if (next === mode.value) return
  mode.value = next
  step.value = 'credentials'
  error.value = ''
  info.value = ''
}

function toggleMethod() {
  userMethodOverride.value = visibleMethod.value === 'google' ? 'email' : 'google'
  step.value = 'credentials'
  error.value = ''
  info.value = ''
}

function closeAndOnboard() {
  // Close = treat as Skip — mark onboarded so the dialog doesn't reopen next launch.
  auth.markAuthOnboarded()
  auth.closeAuthDialog()
}

function onCloseClick()    { closeAndOnboard() }
async function onSkip()    { closeAndOnboard() }

// ── Icon animations + speech bubble (mirrors the sidebar logo) ────────────
const ICON_HOVER_ANIMS = ['ai-wiggle', 'ai-bounce', 'ai-rubber', 'ai-swing', 'ai-tilt', 'ai-heartbeat']
const ICON_CLICK_ANIMS = ['ai-tada', 'ai-pop', 'ai-spring', 'ai-spin']
const ICON_INTRO_ANIMS = ['ai-tada', 'ai-spring', 'ai-bounce', 'ai-rubber']  // celebratory; played when dialog opens

const iconAnimClass = ref('')
const iconWrapRef   = ref(null)
const bubbleVisible = ref(false)
const bubbleText    = ref('')
const bubbleStyle   = ref({})
const QUIPS = computed(() => t('sidebar.loadQuips') || ['Hi!'])
let iconAnimTimer   = null
let bubbleTimer     = null

function pickAnim(pool) {
  return pool[Math.floor(Math.random() * pool.length)]
}
function pickQuip() {
  const arr = QUIPS.value
  return Array.isArray(arr) ? arr[Math.floor(Math.random() * arr.length)] : 'Hi!'
}
function playIconAnim(pool) {
  if (iconAnimTimer) clearTimeout(iconAnimTimer)
  iconAnimClass.value = ''
  requestAnimationFrame(() => {
    iconAnimClass.value = pickAnim(pool)
    iconAnimTimer = setTimeout(() => { iconAnimClass.value = '' }, 850)
  })
}
function showBubble(text, durationMs = 2200) {
  if (!iconWrapRef.value) return
  const rect = iconWrapRef.value.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const by = rect.bottom + 12
  bubbleText.value  = text
  bubbleStyle.value = {
    left: `${cx}px`,
    top:  `${by}px`,
    '--bubble-anchor': `${cx}px`,
  }
  bubbleVisible.value = true
  if (bubbleTimer) clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => { bubbleVisible.value = false }, durationMs)
}

function onIconHover() {
  playIconAnim(ICON_HOVER_ANIMS)
}
function onIconClick() {
  playIconAnim(ICON_CLICK_ANIMS)
  showBubble(pickQuip(), 2200)
}

// Intro animation on every dialog open — quiet (no bubble; the bubble would
// overlap the app title bar above the dialog). Bubble only appears on click.
watch(visible, (open) => {
  if (open) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      playIconAnim(ICON_INTRO_ANIMS)
    }))
  } else {
    bubbleVisible.value = false
    if (bubbleTimer) clearTimeout(bubbleTimer)
  }
}, { flush: 'post' })

function onAuthSuccess() {
  // Successful sign-in already marks onboarded inside useAuth, just close.
  auth.closeAuthDialog()
}

async function onSubmitCredentials() {
  error.value = ''
  busy.value = true
  try {
    if (mode.value === 'login') {
      const r = await auth.signInWithEmail(form.value.email.trim().toLowerCase(), form.value.password)
      if (!r.ok) { error.value = r.error || t('auth.errorGeneric'); return }
      onAuthSuccess()
    } else {
      const r = await auth.signUpStart(
        form.value.email.trim().toLowerCase(),
        form.value.password,
        form.value.name.trim(),
      )
      if (!r.ok) { error.value = r.error || t('auth.errorGeneric'); return }
      step.value = 'verify'
      info.value = ''
    }
  } finally { busy.value = false }
}

async function onSubmitOtp() {
  error.value = ''
  busy.value = true
  try {
    const r = await auth.signUpVerify(form.value.email.trim().toLowerCase(), form.value.otp)
    if (!r.ok) { error.value = r.error || t('auth.errorOtp'); return }
    onAuthSuccess()
  } finally { busy.value = false }
}

async function onRequestReset() {
  error.value = ''
  info.value = ''
  busy.value = true
  try {
    const r = await auth.requestPasswordReset(form.value.email.trim().toLowerCase())
    if (!r.ok) { error.value = r.error || t('auth.errorGeneric'); return }
    info.value = t('auth.resetCodeSent')
    step.value = 'reset'
  } finally { busy.value = false }
}

async function onConfirmReset() {
  error.value = ''
  busy.value = true
  try {
    const r = await auth.confirmPasswordReset(
      form.value.email.trim().toLowerCase(),
      form.value.otp,
      form.value.newPassword,
    )
    if (!r.ok) { error.value = r.error || t('auth.errorGeneric'); return }
    const login = await auth.signInWithEmail(form.value.email.trim().toLowerCase(), form.value.newPassword)
    if (login.ok) onAuthSuccess()
    else { mode.value = 'login'; step.value = 'credentials'; info.value = t('auth.resetSuccessLogin') }
  } finally { busy.value = false }
}

async function onGoogleSignIn() {
  error.value = ''
  busy.value = true
  try {
    const r = await auth.signInWithGoogle()
    if (!r.ok) { error.value = r.error || t('auth.errorGoogle'); return }
    onAuthSuccess()
  } finally { busy.value = false }
}

// ESC key closes the dialog (treated as Skip).
function onKeydown(e) {
  if (!visible.value) return
  if (e.key === 'Escape' && !busy.value) {
    e.stopPropagation()
    closeAndOnboard()
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown, true))
onUnmounted(() => document.removeEventListener('keydown', onKeydown, true))
</script>

<style scoped>
/* ── Backdrop ───────────────────────────────────────────────────────────── */
.auth-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 18, 30, 0.55);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  padding: 24px;
}

/* ── Dialog card ────────────────────────────────────────────────────────── */
.auth-dialog {
  position: relative;
  width: 100%;
  max-width: 460px;
  max-height: calc(100vh - 48px);
  background: var(--bg-card);
  border-radius: 24px;
  padding: 36px 40px 28px;
  box-shadow:
    0 24px 64px -12px rgba(0, 0, 0, 0.30),
    0 8px 16px -4px rgba(0, 0, 0, 0.10),
    0 0 0 1px var(--border-light);
  overflow-y: auto;
  font-family: inherit;
}

.auth-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 120ms, color 120ms;
}
.auth-close:hover { background: var(--bg-hover); color: var(--text-primary); }
.auth-close svg { width: 16px; height: 16px; }

/* ── Top-left: language dropdown ────────────────────────────────────────── */
.auth-lang {
  position: absolute;
  top: 14px;
  left: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.auth-lang-icon {
  width: 14px;
  height: 14px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.auth-lang-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.auth-lang-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 5px 26px 5px 10px;
  cursor: pointer;
  transition: border-color 140ms, box-shadow 140ms, background 140ms;
  outline: none;
}
.auth-lang-select:hover  { border-color: var(--text-secondary); }
.auth-lang-select:focus  { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-light); }
.auth-lang-chevron {
  position: absolute;
  right: 8px;
  width: 12px;
  height: 12px;
  color: var(--text-muted);
  pointer-events: none;
}

/* ── Hero: icon + brand ─────────────────────────────────────────────────── */
.auth-hero {
  text-align: center;
  margin-bottom: 28px;
  padding-top: 16px;
}
/* The wrap is just a positioning + click container — no background, no shadow.
 * The icon's drop-shadow filter (matches sidebar logo) does all the visual lifting. */
.auth-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  cursor: pointer;
  background: transparent;
  /* Subtle hover lift, no box-shadow change so the icon stays visually transparent */
  transition: transform 200ms ease;
}
.auth-icon-wrap:hover {
  transform: translateY(-2px);
}
.auth-icon {
  width: 88px;
  height: 88px;
  display: block;
  background: transparent;
  object-fit: contain;
  filter:
    drop-shadow(0 3px 8px rgba(0,0,0,0.13))
    drop-shadow(0 6px 18px rgba(0,0,0,0.10))
    drop-shadow(0 1px 3px rgba(0,0,0,0.08));
  transform-origin: center;
}
.auth-app-name {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-primary);
  line-height: 1.2;
}

/* ── Mode tabs ──────────────────────────────────────────────────────────── */
.auth-tabs {
  display: flex;
  background: var(--bg-hover);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 20px;
}
.auth-tab {
  flex: 1;
  padding: 9px 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: background 140ms, color 140ms, box-shadow 140ms;
  font-family: inherit;
}
.auth-tab.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06);
}

/* ── Form panel ─────────────────────────────────────────────────────────── */
/* Reserve enough space for the largest variant (email credentials step) so the
 * dialog height stays put when the user toggles between Google and email. */
.auth-panel {
  display: flex;
  flex-direction: column;
  min-height: 280px;
}
/* The Google panel is short — vertically center its content within the reserved height. */
.auth-panel-google {
  justify-content: center;
  gap: 16px;
}
.auth-panel-google .auth-helper { margin: 0; text-align: center; }

.auth-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 14px 0 6px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.auth-input {
  width: 100%;
  padding: 11px 14px;
  font-size: 14.5px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  outline: none;
  transition: border-color 140ms, box-shadow 140ms;
  font-family: inherit;
}
.auth-input::placeholder { color: var(--text-muted); }
.auth-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-light);
}
.auth-input-otp {
  letter-spacing: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-align: center;
  font-size: 1.25rem;
  padding-top: 13px;
  padding-bottom: 13px;
}

.auth-helper {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 4px 0 8px;
  line-height: 1.55;
}

.auth-error {
  font-size: 12.5px;
  color: #d92d20;
  margin: 14px 0 0;
  padding: 10px 12px;
  background: rgba(217, 45, 32, 0.06);
  border: 1px solid rgba(217, 45, 32, 0.18);
  border-radius: 8px;
  line-height: 1.5;
}

.auth-info {
  font-size: 12.5px;
  color: #047857;
  margin: 14px 0 0;
  padding: 10px 12px;
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.18);
  border-radius: 8px;
}

.auth-cta {
  margin-top: 18px;
  width: 100%;
  padding: 12px 16px;
  font-size: 14.5px;
  font-weight: 600;
  color: #fff;
  background: var(--primary);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 140ms, transform 80ms, box-shadow 140ms;
  font-family: inherit;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.auth-cta:hover:not(:disabled) {
  background: var(--primary-hover);
  box-shadow: 0 4px 12px rgba(0,0,0,0.10);
}
.auth-cta:active:not(:disabled) { transform: scale(0.98); }
.auth-cta:disabled { opacity: 0.42; cursor: not-allowed; box-shadow: none; }

.auth-link {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--accent);
  background: transparent;
  border: none;
  cursor: pointer;
  align-self: flex-start;
  padding: 4px 0;
  font-family: inherit;
}
.auth-link:hover { color: var(--accent-hover); text-decoration: underline; }

/* ── Google button ──────────────────────────────────────────────────────── */
.auth-google-btn {
  margin-top: 4px;
  width: 100%;
  padding: 12px 16px;
  font-size: 14.5px;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  transition: background 140ms, border-color 140ms, box-shadow 140ms;
  font-family: inherit;
}
.auth-google-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--text-secondary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.auth-google-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.auth-google-icon { width: 18px; height: 18px; flex-shrink: 0; }

/* ── Divider + method toggle ────────────────────────────────────────────── */
.auth-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 22px 0 14px;
}
.auth-divider-line {
  flex: 1;
  height: 1px;
  background: var(--border-light);
}
.auth-divider-or {
  font-size: 11.5px;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.auth-method-toggle {
  display: block;
  width: 100%;
  padding: 10px 14px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: background 120ms, border-color 120ms;
  font-family: inherit;
}
.auth-method-toggle:hover {
  background: var(--bg-hover);
  border-color: var(--text-secondary);
}

/* ── Footer + skip ──────────────────────────────────────────────────────── */
.auth-foot {
  margin-top: 22px;
  font-size: 11.5px;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.55;
}

.auth-skip {
  display: block;
  width: 100%;
  margin-top: 10px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 8px;
  transition: color 120ms, background 120ms;
  font-family: inherit;
}
.auth-skip:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

/* ── Spinner ────────────────────────────────────────────────────────────── */
.auth-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: auth-spin 0.7s linear infinite;
}
@keyframes auth-spin { to { transform: rotate(360deg); } }

/* ── Transitions ────────────────────────────────────────────────────────── */
.auth-fade-enter-active, .auth-fade-leave-active { transition: opacity 200ms ease; }
.auth-fade-enter-from,   .auth-fade-leave-to     { opacity: 0; }

.auth-pop-enter-active { transition: transform 280ms cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 200ms ease; }
.auth-pop-leave-active { transition: transform 180ms ease, opacity 180ms ease; }
.auth-pop-enter-from, .auth-pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}

/* ── Reduced motion ─────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .auth-fade-enter-active, .auth-fade-leave-active,
  .auth-pop-enter-active,  .auth-pop-leave-active { transition: none; }
}

/* ── Compact phones ─────────────────────────────────────────────────────── */
@media (max-height: 720px) {
  .auth-dialog { padding: 28px 32px 20px; }
  .auth-icon { width: 72px; height: 72px; }
  .auth-app-name { font-size: 22px; }
  .auth-hero { margin-bottom: 20px; padding-top: 8px; }
  .auth-panel { min-height: 240px; }
}

/* ── Speech bubble (mirrors sidebar logo bubble) ────────────────────────── */
.auth-bubble {
  position: fixed;
  /* Center on anchor by default; nudge if it would clip the left edge */
  translate: max(-50%, calc(12px - var(--bubble-anchor, 50%))) 0;
  max-width: 240px;
  white-space: normal;
  word-break: break-word;
  text-align: center;
  background: #0F0F0F;
  color: #fff;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 10px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.16);
  pointer-events: none;
  z-index: 99999999;
  animation: auth-bubble-pop 0.18s ease-out forwards;
}
.auth-bubble-arrow {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-bottom-color: #0F0F0F;
}
@keyframes auth-bubble-pop {
  from { opacity: 0; scale: 0.85; transform: translateY(-4px); }
  to   { opacity: 1; scale: 1;    transform: translateY(0); }
}

/* ── Icon animations (curated subset matching the sidebar logo) ─────────── */
.ai-wiggle    { animation: ai-wiggle    0.55s ease-in-out; }
.ai-bounce    { animation: ai-bounce    0.55s ease-in-out; }
.ai-rubber    { animation: ai-rubber    0.6s  ease-in-out; }
.ai-swing     { animation: ai-swing     0.55s ease-in-out; }
.ai-tilt      { animation: ai-tilt      0.45s ease-in-out; }
.ai-heartbeat { animation: ai-heartbeat 0.5s  ease-in-out; }
.ai-tada      { animation: ai-tada      0.6s  ease-in-out; }
.ai-pop       { animation: ai-pop       0.4s  cubic-bezier(.175,.885,.32,1.275); }
.ai-spring    { animation: ai-spring    0.6s  cubic-bezier(.175,.885,.32,1.275); }
.ai-spin      { animation: ai-spin      0.5s  ease-in-out; }

@keyframes ai-wiggle {
  0%,100% { transform: rotate(0); }
  20%     { transform: rotate(-12deg); }
  40%     { transform: rotate(10deg); }
  60%     { transform: rotate(-7deg); }
  80%     { transform: rotate(5deg); }
}
@keyframes ai-bounce {
  0%,100% { transform: translateY(0); }
  30%     { transform: translateY(-14px); }
  60%     { transform: translateY(-6px); }
}
@keyframes ai-rubber {
  0%   { transform: scale3d(1,1,1); }
  30%  { transform: scale3d(1.25,0.75,1); }
  40%  { transform: scale3d(0.75,1.25,1); }
  60%  { transform: scale3d(1.15,0.85,1); }
  100% { transform: scale3d(1,1,1); }
}
@keyframes ai-swing {
  0%   { transform: rotate(0); }
  20%  { transform: rotate(15deg); }
  40%  { transform: rotate(-10deg); }
  60%  { transform: rotate(5deg); }
  80%  { transform: rotate(-5deg); }
  100% { transform: rotate(0); }
}
@keyframes ai-tilt {
  0%,100% { transform: rotate(0); }
  50%     { transform: rotate(-12deg); }
}
@keyframes ai-heartbeat {
  0%,100% { transform: scale(1); }
  14%     { transform: scale(1.18); }
  28%     { transform: scale(1); }
  42%     { transform: scale(1.18); }
  70%     { transform: scale(1); }
}
@keyframes ai-tada {
  0%   { transform: scale(1) rotate(0); }
  10%,20% { transform: scale(0.9) rotate(-3deg); }
  30%,50%,70%,90% { transform: scale(1.15) rotate(3deg); }
  40%,60%,80%     { transform: scale(1.15) rotate(-3deg); }
  100% { transform: scale(1) rotate(0); }
}
@keyframes ai-pop {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.25); }
  100% { transform: scale(1); }
}
@keyframes ai-spring {
  0%   { transform: scale(1) translateY(0); }
  20%  { transform: scale(1.1,0.9) translateY(-12px); }
  40%  { transform: scale(0.9,1.1) translateY(0); }
  60%  { transform: scale(1.05,0.95) translateY(-6px); }
  80%  { transform: scale(0.95,1.05) translateY(0); }
  100% { transform: scale(1) translateY(0); }
}
@keyframes ai-spin {
  0%   { transform: rotate(0); }
  100% { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .ai-wiggle, .ai-bounce, .ai-rubber, .ai-swing, .ai-tilt,
  .ai-heartbeat, .ai-tada, .ai-pop, .ai-spring, .ai-spin {
    animation: none;
  }
}
</style>
