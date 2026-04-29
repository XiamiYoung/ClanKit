<template>
  <div class="auth-panel">

    <!-- Signup-only entry: choose between Google or email registration. -->
    <template v-if="step === 'choose'">
      <p class="auth-helper">{{ t('auth.chooseHelper') }}</p>

      <button class="auth-google-btn" :disabled="busy" @click="onGoogleSignIn">
        <svg class="auth-google-icon" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
        </svg>
        <span>{{ busy ? t('auth.busy') : t('auth.useGoogle') }}</span>
      </button>

      <div class="auth-divider">
        <span class="auth-divider-line"></span>
        <span class="auth-divider-or">{{ t('auth.or') }}</span>
        <span class="auth-divider-line"></span>
      </div>

      <button class="auth-cta auth-cta-secondary" :disabled="busy" @click="step = 'email'; error = ''">
        {{ t('auth.useEmail') }}
      </button>

      <p v-if="error" class="auth-error">{{ error }}</p>
    </template>

    <!-- Step 1: enter email. In default (sign-in) mode the Google button is
         shown alongside; in signup-only mode it's omitted because the user
         already picked "Use email" on the previous step. The "what does signing
         in get me" helper text lives in the AuthDialog wrapper (below the skip
         button), so it doesn't clutter the form here. -->
    <template v-if="step === 'email'">
      <p v-if="signupOnly" class="auth-helper">{{ t('auth.emailNeutralHelper') }}</p>

      <template v-if="!signupOnly && showGoogleOption">
        <button class="auth-google-btn" :disabled="busy" @click="onGoogleSignIn">
          <svg class="auth-google-icon" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          <span>{{ busy ? t('auth.busy') : t('auth.continueWithGoogle') }}</span>
        </button>

        <div class="auth-divider">
          <span class="auth-divider-line"></span>
          <span class="auth-divider-or">{{ t('auth.or') }}</span>
          <span class="auth-divider-line"></span>
        </div>
      </template>

      <label class="auth-label">{{ t('auth.emailLabel') }}</label>
      <input
        v-model="form.email" type="email" class="auth-input"
        autocomplete="email" :placeholder="t('auth.emailPlaceholder')"
        @keyup.enter="onSubmitEmail"
      />
      <p v-if="!signupOnly" class="auth-flow-hint">{{ t('auth.emailFirstFlowHint') }}</p>

      <p v-if="error" class="auth-error">{{ error }}</p>

      <button class="auth-cta" :disabled="busy || !form.email" @click="onSubmitEmail">
        <span v-if="busy" class="auth-spinner" />
        {{ busy ? t('auth.busy') : (signupOnly ? t('auth.continueNeutral') : t('auth.continueLabel')) }}
      </button>

      <button v-if="signupOnly" class="auth-link" @click="backToStart">{{ t('auth.backToStart') }}</button>
    </template>

    <!-- Step 2a: existing user — enter password -->
    <template v-if="step === 'password'">
      <p class="auth-helper">{{ t('auth.welcomeBack', { email: form.email }) }}</p>

      <label class="auth-label">{{ t('auth.passwordLabel') }}</label>
      <input
        v-model="form.password" type="password" class="auth-input"
        autocomplete="current-password" :placeholder="t('auth.passwordPlaceholder')"
        @keyup.enter="onSignIn"
      />

      <p v-if="error" class="auth-error">{{ error }}</p>

      <button class="auth-cta" :disabled="busy || !form.password" @click="onSignIn">
        <span v-if="busy" class="auth-spinner" />
        {{ busy ? t('auth.busy') : t('auth.signIn') }}
      </button>

      <button class="auth-link" @click="step = 'forgot'; error = ''">{{ t('auth.forgotPassword') }}</button>
      <button class="auth-link" @click="backToEmail">{{ t('auth.useDifferentEmail') }}</button>
    </template>

    <!-- Step 2b: new user — create account -->
    <template v-if="step === 'create'">
      <p class="auth-helper">{{ t('auth.createAccountFor', { email: form.email }) }}</p>

      <label class="auth-label">{{ t('auth.nameLabel') }}</label>
      <input
        v-model="form.name" type="text" class="auth-input"
        autocomplete="name" :placeholder="t('auth.namePlaceholder')"
        @keyup.enter="onCreateAccount"
      />

      <label class="auth-label">{{ t('auth.passwordLabel') }}</label>
      <input
        v-model="form.password" type="password" class="auth-input"
        autocomplete="new-password" :placeholder="t('auth.passwordPlaceholder')"
        @keyup.enter="onCreateAccount"
      />

      <p v-if="error" class="auth-error">{{ error }}</p>

      <button class="auth-cta" :disabled="busy || !form.name || !form.password" @click="onCreateAccount">
        <span v-if="busy" class="auth-spinner" />
        {{ busy ? t('auth.busy') : t('auth.sendCode') }}
      </button>

      <button class="auth-link" @click="backToStart">{{ t('auth.useDifferentEmail') }}</button>
    </template>

    <!-- OTP verification (after sign-up) -->
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

      <button class="auth-link" @click="backToStart">{{ t('auth.backToStart') }}</button>
    </template>

    <!-- Forgot password — request reset code -->
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

      <button class="auth-link" @click="backToEmail">{{ t('auth.backToStart') }}</button>
    </template>

    <!-- Reset password — submit OTP + new password -->
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

      <button class="auth-cta" :disabled="busy || form.otp.length !== 6 || !form.newPassword" @click="onConfirmReset">
        <span v-if="busy" class="auth-spinner" />
        {{ busy ? t('auth.busy') : t('auth.resetPassword') }}
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useAuth } from '../../composables/useAuth'
import { useI18n } from '../../i18n/useI18n'

const props = defineProps({
  // Controls whether the form should reset itself when this prop flips true.
  // Used by AuthDialog when its modal opens; SetupWizard can leave it default.
  resetSignal: { type: Number, default: 0 },
  // First-launch wizard mode: present a "choose Google or email" gateway and
  // route email straight into account creation (no sign-in branch). The whole
  // form is framed as "set up your account", not "sign in".
  signupOnly: { type: Boolean, default: false },
})
const emit = defineEmits(['success'])

const auth = useAuth()
const { t } = useI18n()

const initialStep = () => props.signupOnly ? 'choose' : 'email'
const step = ref(initialStep())
// Google sign-in is offered to all locales — Chinese users with VPN can use it,
// and the loopback flow gracefully times out with a clear error otherwise.
const showGoogleOption = computed(() => true)

const form = ref({ name: '', email: '', password: '', otp: '', newPassword: '' })
const error = ref('')
const info  = ref('')
const busy  = ref(false)

watch(() => props.resetSignal, () => {
  step.value = initialStep()
  form.value = { name: '', email: '', password: '', otp: '', newPassword: '' }
  error.value = ''
  info.value  = ''
  busy.value  = false
})

watch(step, (s) => {
  // When the user backs out to the start screen, clear any partially-typed
  // fields so they don't leak into a different downstream branch.
  if (s === 'email' || s === 'choose') {
    form.value.password = ''
    form.value.name = ''
    form.value.otp = ''
    form.value.newPassword = ''
  }
})

function backToStart() {
  step.value = initialStep()
  error.value = ''
  info.value = ''
}

function onAuthSuccess() {
  emit('success')
}

async function onSubmitEmail() {
  error.value = ''
  busy.value = true
  try {
    const e = form.value.email.trim().toLowerCase()
    form.value.email = e
    const r = await auth.checkEmail(e)
    if (!r.ok) { error.value = r.error || t('auth.errorGeneric'); return }
    step.value = r.data?.exists ? 'password' : 'create'
  } finally { busy.value = false }
}

async function onSignIn() {
  error.value = ''
  busy.value = true
  try {
    const r = await auth.signInWithEmail(form.value.email, form.value.password)
    if (!r.ok) { error.value = r.error || t('auth.errorGeneric'); return }
    onAuthSuccess()
  } finally { busy.value = false }
}

async function onCreateAccount() {
  error.value = ''
  busy.value = true
  try {
    const e = form.value.email.trim().toLowerCase()
    form.value.email = e
    const r = await auth.signUpStart(e, form.value.password, form.value.name.trim())
    if (!r.ok) { error.value = r.error || t('auth.errorGeneric'); return }
    step.value = 'verify'
    info.value = ''
  } finally { busy.value = false }
}

async function onSubmitOtp() {
  error.value = ''
  busy.value = true
  try {
    const r = await auth.signUpVerify(form.value.email, form.value.otp)
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
    const r = await auth.confirmPasswordReset(form.value.email, form.value.otp, form.value.newPassword)
    if (!r.ok) { error.value = r.error || t('auth.errorGeneric'); return }
    const login = await auth.signInWithEmail(form.value.email, form.value.newPassword)
    if (login.ok) onAuthSuccess()
    else { step.value = 'password'; info.value = t('auth.resetSuccessLogin') }
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
</script>

<style scoped>
.auth-panel {
  display: flex;
  flex-direction: column;
  min-height: 280px;
}
.auth-helper {
  margin: 0 0 14px;
  font-size: 13.5px;
  color: var(--text-secondary);
  line-height: 1.5;
  text-align: center;
}
.auth-label {
  display: block;
  margin: 10px 0 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}
.auth-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  outline: none;
  transition: border-color 120ms, box-shadow 120ms;
  box-sizing: border-box;
  font-family: inherit;
  color: var(--text-primary);
}
.auth-input:focus {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 3px rgba(15,15,15,0.08);
}
.auth-input-otp {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  letter-spacing: 0.4em;
  font-size: 18px;
  text-align: center;
  padding: 12px;
}
.auth-cta {
  margin-top: 14px;
  width: 100%;
  padding: 11px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: filter 120ms, transform 120ms;
  font-family: inherit;
}
.auth-cta:hover:not(:disabled) { filter: brightness(1.1); }
.auth-cta:active:not(:disabled) { transform: translateY(1px); }
.auth-cta:disabled { opacity: 0.5; cursor: not-allowed; }
.auth-cta-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}
.auth-cta-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--text-secondary);
  filter: none;
}
.auth-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: auth-spin 0.7s linear infinite;
}
@keyframes auth-spin { to { transform: rotate(360deg); } }
.auth-link {
  display: block;
  margin: 8px auto 0;
  font-size: 12.5px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  font-family: inherit;
}
.auth-link:hover { color: var(--text-primary); }
.auth-error {
  margin: 8px 0 0;
  padding: 8px 12px;
  font-size: 12.5px;
  color: #DC2626;
  background: rgba(239,68,68,0.06);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 8px;
}
.auth-info {
  margin: 8px 0 0;
  font-size: 12.5px;
  color: var(--text-secondary);
}
.auth-flow-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted, var(--text-secondary));
  line-height: 1.45;
}
.auth-google-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 11px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: background 120ms, border-color 120ms;
  font-family: inherit;
}
.auth-google-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--text-secondary);
}
.auth-google-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.auth-google-icon { width: 18px; height: 18px; flex-shrink: 0; }
.auth-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 14px 0;
}
.auth-divider-line {
  flex: 1;
  height: 1px;
  background: var(--border);
}
.auth-divider-or {
  font-size: 11.5px;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
</style>
