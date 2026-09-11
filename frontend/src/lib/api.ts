import axios from 'axios'

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

function resolveApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim()
  const hasWindow = typeof window !== 'undefined'

  if (!configuredUrl) {
    if (hasWindow) {
      return `${window.location.protocol}//${window.location.hostname}:8003`
    }
    return 'http://localhost:8003'
  }

  if (!hasWindow) {
    return configuredUrl
  }

  try {
    const parsed = new URL(configuredUrl)
    if (isLocalHost(parsed.hostname) && !isLocalHost(window.location.hostname)) {
      const protocol = parsed.protocol || window.location.protocol
      const port = parsed.port || '8003'
      return `${protocol}//${window.location.hostname}:${port}`
    }
  } catch {
    return configuredUrl
  }

  return configuredUrl
}

export const API_BASE_URL = resolveApiBaseUrl()

export const api = axios.create({
  baseURL: API_BASE_URL,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return `Nao foi possivel conectar com a API (${API_BASE_URL})`
    }
    if (typeof error.response?.data?.detail === 'string') {
      return error.response.data.detail
    }
    if (Array.isArray(error.response?.data?.detail)) {
      return error.response?.data?.detail?.[0]?.msg || 'Erro na requisicao'
    }
  }
  return 'Erro inesperado'
}
