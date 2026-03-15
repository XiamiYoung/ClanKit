const getRegion = () => {
  const saved = localStorage.getItem('user-region')
  if (saved) return saved
  
  const lang = navigator.language || navigator.userLanguage
  if (lang.startsWith('zh')) return 'cn'
  return 'global'
}

const getApiConfig = () => {
  const region = getRegion()
  
  if (region === 'cn') {
    return {
      baseUrl: localStorage.getItem('api-cn-url') || '',
      apiKey: localStorage.getItem('api-cn-key') || ''
    }
  } else {
    return {
      baseUrl: localStorage.getItem('api-global-url') || '',
      apiKey: localStorage.getItem('api-global-key') || ''
    }
  }
}

const getCloud = () => {
  const config = getApiConfig()
  if (!config.baseUrl) {
    throw new Error('API not configured')
  }
  return config
}

async function request(endpoint, data = {}) {
  const config = getCloud()
  const url = `${config.baseUrl}${endpoint}`
  
  const headers = {
    'Content-Type': 'application/json'
  }
  
  if (config.apiKey) {
    headers['X-API-Key'] = config.apiKey
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  })
  
  const result = await response.json()
  
  if (!response.ok) {
    throw new Error(result.error || 'Request failed')
  }
  
  return result
}

export const authService = {
  getRegion,
  
  setRegion(region) {
    localStorage.setItem('user-region', region)
  },
  
  setApiConfig(region, baseUrl, apiKey) {
    if (region === 'cn') {
      localStorage.setItem('api-cn-url', baseUrl)
      localStorage.setItem('api-cn-key', apiKey)
    } else {
      localStorage.setItem('api-global-url', baseUrl)
      localStorage.setItem('api-global-key', apiKey)
    }
  },
  
  isConfigured() {
    try {
      const config = getCloud()
      return !!config.baseUrl
    } catch {
      return false
    }
  },
  
  async sendVerificationCode(email) {
    return request('/send-code', { email })
  },
  
  async verifyCode(email, code) {
    return request('/verify-code', { email, code })
  },
  
  async register(email, password, code) {
    const result = await request('/register', {
      email,
      password,
      code
    })
    
    return result
  },
  
  async login(email, password) {
    const result = await request('/login', {
      email,
      password
    })
    
    if (result.uid) {
      localStorage.setItem('auth_token', result.uid)
      localStorage.setItem('user_id', result.uid)
      localStorage.setItem('user_email', email)
    }
    
    return result
  },
  
  async getUserInfo(userId) {
    const config = getCloud()
    const url = `${config.baseUrl}/user-info?userId=${userId}`
    
    const headers = {}
    if (config.apiKey) {
      headers['X-API-Key'] = config.apiKey
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers
    })
    
    const result = await response.json()
    
    if (!response.ok) {
      throw new Error(result.error || 'Request failed')
    }
    
    return result
  },
  
  logout() {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_id')
    localStorage.removeItem('user_email')
  },
  
  isLoggedIn() {
    return !!localStorage.getItem('auth_token')
  },
  
  getCurrentUser() {
    return {
      id: localStorage.getItem('user_id'),
      email: localStorage.getItem('user_email')
    }
  }
}
