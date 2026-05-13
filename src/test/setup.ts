import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

vi.stubEnv('VITE_SUPABASE_URL', 'http://stub.invalid')
vi.stubEnv('VITE_SUPABASE_PUB_KEY', 'sb_publishable_stub')
vi.stubEnv('VITE_API_BASE_URL', 'http://stub.invalid')

// Node 25 ships a built-in Web Storage that requires --localstorage-file
// to be functional; without it, globalThis.localStorage exists as an inert
// empty object and jsdom defers to it. Polyfill an in-memory Storage so
// tests that touch localStorage behave like a browser.
function makeMemoryStorage(): Storage {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    clear() {
      store = {}
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : null
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null
    },
    removeItem(key: string) {
      delete store[key]
    },
    setItem(key: string, value: string) {
      store[key] = String(value)
    },
  }
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: makeMemoryStorage(),
  })
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: makeMemoryStorage(),
  })
}
