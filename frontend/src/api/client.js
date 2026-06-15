import axios from 'axios'

const client = axios.create({ baseURL: '/api' })

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Single-flight refresh: if several requests 401 at once, they all await the
// same refresh call instead of firing N refreshes.
let refreshPromise = null

function clearAndRedirect() {
  localStorage.removeItem('token')
  localStorage.removeItem('username')
  localStorage.removeItem('refresh_token')
  if (location.pathname !== '/login') location.assign('/login')
}

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const status = error.response?.status

    // Only attempt refresh on a 401, once per request, and never for the
    // refresh endpoint itself (avoids an infinite loop).
    if (
      status === 401 &&
      original &&
      !original._retried &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      original._retried = true
      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) {
        clearAndRedirect()
        return Promise.reject(error)
      }

      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post('/api/auth/refresh', { refresh_token: refreshToken })
            .finally(() => {
              refreshPromise = null
            })
        }
        const res = await refreshPromise
        const newToken = res.data.access_token
        localStorage.setItem('token', newToken)
        if (res.data.refresh_token) {
          localStorage.setItem('refresh_token', res.data.refresh_token)
        }
        original.headers.Authorization = `Bearer ${newToken}`
        return client(original)
      } catch (e) {
        clearAndRedirect()
        return Promise.reject(e)
      }
    }

    return Promise.reject(error)
  }
)

export default client
