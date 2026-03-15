import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '../services/auth'

export const useUserStore = defineStore('user', () => {
  const user = ref(null)
  const isLoading = ref(false)
  const isAuthenticated = ref(false)
  
  const userEmail = computed(() => user.value?.email || '')
  const userId = computed(() => user.value?.id || '')
  
  async function checkAuth() {
    if (!authService.isLoggedIn()) {
      isAuthenticated.value = false
      return false
    }
    
    try {
      isLoading.value = true
      const userId = localStorage.getItem('user_id')
      const userInfo = await authService.getUserInfo(userId)
      user.value = userInfo
      isAuthenticated.value = true
      return true
    } catch (error) {
      console.error('Auth check failed:', error)
      authService.logout()
      isAuthenticated.value = false
      return false
    } finally {
      isLoading.value = false
    }
  }
  
  async function login(email, password) {
    isLoading.value = true
    try {
      const result = await authService.login(email, password)
      await checkAuth()
      return result
    } finally {
      isLoading.value = false
    }
  }
  
  async function register(email, password, code) {
    isLoading.value = true
    try {
      const result = await authService.register(email, password, code)
      await checkAuth()
      return result
    } finally {
      isLoading.value = false
    }
  }
  
  function logout() {
    authService.logout()
    user.value = null
    isAuthenticated.value = false
  }
  
  function sendVerificationCode(email) {
    return authService.sendVerificationCode(email)
  }
  
  function verifyCode(email, code) {
    return authService.verifyCode(email, code)
  }
  
  function init() {
    const currentUser = authService.getCurrentUser()
    if (currentUser.id) {
      isAuthenticated.value = true
      user.value = currentUser
    }
  }
  
  return {
    user,
    isLoading,
    isAuthenticated,
    userEmail,
    userId,
    checkAuth,
    login,
    register,
    logout,
    sendVerificationCode,
    verifyCode,
    init
  }
})
