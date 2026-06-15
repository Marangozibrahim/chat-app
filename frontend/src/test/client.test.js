import { beforeEach, describe, expect, it, vi } from 'vitest'

// Capture the interceptor handlers that client.js registers so we can drive
// them directly, and stub axios.create + the bare axios.post used for refresh.
const responseHandlers = { onFulfilled: null, onRejected: null }
const requestHandlers = { onFulfilled: null }
const instanceCall = vi.fn((cfg) => Promise.resolve({ retried: true, config: cfg }))
const barePost = vi.fn()

vi.mock('axios', () => {
  const instance = (cfg) => instanceCall(cfg)
  instance.interceptors = {
    request: { use: (fn) => (requestHandlers.onFulfilled = fn) },
    response: {
      use: (ok, err) => {
        responseHandlers.onFulfilled = ok
        responseHandlers.onRejected = err
      },
    },
  }
  const axios = { create: () => instance, post: (...a) => barePost(...a) }
  return { default: axios }
})

// Import after the mock is in place so the module registers against our stubs.
await import('../api/client.js')

beforeEach(() => {
  localStorage.clear()
  instanceCall.mockClear()
  barePost.mockClear()
})

describe('request interceptor', () => {
  it('attaches a bearer token when present', () => {
    localStorage.setItem('token', 'abc')
    const cfg = requestHandlers.onFulfilled({ headers: {} })
    expect(cfg.headers.Authorization).toBe('Bearer abc')
  })

  it('omits the header when no token', () => {
    const cfg = requestHandlers.onFulfilled({ headers: {} })
    expect(cfg.headers.Authorization).toBeUndefined()
  })
})

describe('response interceptor refresh flow', () => {
  it('refreshes on 401 and retries the original request', async () => {
    localStorage.setItem('refresh_token', 'refresh-1')
    barePost.mockResolvedValueOnce({
      data: { access_token: 'new-access', refresh_token: 'refresh-2' },
    })

    const error = {
      response: { status: 401 },
      config: { url: '/rooms', headers: {} },
    }
    await responseHandlers.onRejected(error)

    expect(barePost).toHaveBeenCalledWith('/api/auth/refresh', {
      refresh_token: 'refresh-1',
    })
    expect(localStorage.getItem('token')).toBe('new-access')
    expect(localStorage.getItem('refresh_token')).toBe('refresh-2')
    // original request retried with the fresh bearer
    expect(instanceCall).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Authorization: 'Bearer new-access' },
      })
    )
  })

  it('does not retry a second time on a repeat 401', async () => {
    localStorage.setItem('refresh_token', 'refresh-1')
    const error = {
      response: { status: 401 },
      config: { url: '/rooms', headers: {}, _retried: true },
    }
    await expect(responseHandlers.onRejected(error)).rejects.toBe(error)
    expect(barePost).not.toHaveBeenCalled()
  })

  it('does not attempt refresh for the login route', async () => {
    const error = {
      response: { status: 401 },
      config: { url: '/auth/login', headers: {} },
    }
    await expect(responseHandlers.onRejected(error)).rejects.toBe(error)
    expect(barePost).not.toHaveBeenCalled()
  })

  it('passes through non-401 errors untouched', async () => {
    const error = { response: { status: 500 }, config: { url: '/rooms', headers: {} } }
    await expect(responseHandlers.onRejected(error)).rejects.toBe(error)
    expect(barePost).not.toHaveBeenCalled()
  })
})
