<template>
  <div class="auth-page">
    <div class="auth-container">
      <div class="auth-header">
        <h1 class="auth-title">ClankAI</h1>
        <p class="auth-subtitle">{{ isLogin ? 'Welcome back' : 'Create an account' }}</p>
      </div>

      <div class="auth-tabs">
        <button 
          :class="['tab', { active: !isLogin }]" 
          @click="isLogin = false"
        >
          Register
        </button>
        <button 
          :class="['tab', { active: isLogin }]" 
          @click="isLogin = true"
        >
          Login
        </button>
      </div>

      <form @submit.prevent="handleSubmit" class="auth-form">
        <div class="form-group">
          <label>Email</label>
          <input 
            v-model="email" 
            type="email" 
            required 
            placeholder="your@email.com"
            :disabled="loading"
          />
        </div>

        <div class="form-group">
          <label>Password</label>
          <input 
            v-model="password" 
            type="password" 
            required 
            placeholder="Minimum 6 characters"
            :disabled="loading"
          />
        </div>

        <template v-if="!isLogin">
          <div class="form-group">
            <label>Verification Code</label>
            <div class="code-input-group">
              <input 
                v-model="code" 
                type="text" 
                required 
                placeholder="6-digit code"
                :disabled="loading || !codeSent"
                maxlength="6"
              />
              <button 
                type="button"
                class="send-code-btn"
                @click="sendCode"
                :disabled="loading || countdown > 0"
              >
                {{ countdown > 0 ? `${countdown}s` : (codeSent ? 'Resend' : 'Send Code') }}
              </button>
            </div>
          </div>
        </template>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <button 
          type="submit" 
          class="submit-btn"
          :disabled="loading || (!isLogin && !codeSent)"
        >
          {{ loading ? 'Please wait...' : (isLogin ? 'Login' : 'Register') }}
        </button>
      </form>

      <div v-if="isLogin" class="auth-footer">
        <p>Don't have an account? <a href="#" @click.prevent="isLogin = false">Register</a></p>
      </div>
      <div v-else class="auth-footer">
        <p>Already have an account? <a href="#" @click.prevent="isLogin = true">Login</a></p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()

const isLogin = ref(true)
const email = ref('')
const password = ref('')
const code = ref('')
const loading = ref(false)
const error = ref('')
const codeSent = ref(false)
const countdown = ref(0)

let countdownTimer = null

watch(isLogin, () => {
  error.value = ''
  code.value = ''
  codeSent.value = false
})

function startCountdown() {
  countdown.value = 60
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
    }
  }, 1000)
}

async function sendCode() {
  if (!email.value || countdown.value > 0) return
  
  loading.value = true
  error.value = ''
  
  try {
    await userStore.sendVerificationCode(email.value)
    codeSent.value = true
    startCountdown()
  } catch (e) {
    error.value = e.message || 'Failed to send verification code'
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  loading.value = true
  error.value = ''
  
  try {
    if (isLogin.value) {
      await userStore.login(email.value, password.value)
    } else {
      await userStore.register(email.value, password.value, code.value)
    }
  } catch (e) {
    error.value = e.message || 'Authentication failed'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  padding: 20px;
}

.auth-container {
  width: 100%;
  max-width: 400px;
  background: white;
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.auth-header {
  text-align: center;
  margin-bottom: 30px;
}

.auth-title {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 8px 0;
}

.auth-subtitle {
  color: #666;
  margin: 0;
}

.auth-tabs {
  display: flex;
  margin-bottom: 24px;
  background: #f5f5f5;
  border-radius: 8px;
  padding: 4px;
}

.tab {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-weight: 500;
  color: #666;
  border-radius: 6px;
  transition: all 0.2s;
}

.tab.active {
  background: white;
  color: #1a1a1a;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.form-group input {
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #1a1a2e;
}

.form-group input:disabled {
  background: #f5f5f5;
}

.code-input-group {
  display: flex;
  gap: 10px;
}

.code-input-group input {
  flex: 1;
}

.send-code-btn {
  padding: 12px 16px;
  background: #1a1a2e;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}

.send-code-btn:hover:not(:disabled) {
  background: #2a2a4e;
}

.send-code-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  padding: 12px;
  background: #fee;
  color: #c00;
  border-radius: 8px;
  font-size: 14px;
}

.submit-btn {
  padding: 14px;
  background: linear-gradient(135deg, #1a1a2e 0%, #2a2a4e 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(26, 26, 46, 0.3);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.auth-footer {
  margin-top: 24px;
  text-align: center;
  color: #666;
  font-size: 14px;
}

.auth-footer a {
  color: #1a1a2e;
  font-weight: 500;
  text-decoration: none;
}

.auth-footer a:hover {
  text-decoration: underline;
}
</style>
