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
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string): MediaQueryList =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    })
  }
  // landr-wmsc — jsdom doesn't ship Element.prototype.scrollIntoView;
  // cmdk calls it whenever the selected CommandItem changes (so the row
  // stays in view inside its scroll container). Tests would otherwise
  // throw `i.scrollIntoView is not a function` the moment the palette
  // mounts. Stub with a noop — the visual scroll isn't asserted on.
  if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {}
  }
  // landr-ri8a — jsdom doesn't implement Document.elementFromPoint or
  // Range.getClientRects, which ProseMirror (the TipTap engine in the email
  // RichTextEditor) calls from its mousedown coords handling. Without these a
  // click inside the contenteditable throws an *uncaught* exception that fails
  // the whole test file. Stub them so the editor mounts/edits cleanly; tests
  // drive formatting via the toolbar, not by coordinate mapping.
  if (typeof document !== 'undefined' && !document.elementFromPoint) {
    document.elementFromPoint = () => null
  }
  if (
    typeof Range !== 'undefined' &&
    typeof Range.prototype.getClientRects !== 'function'
  ) {
    Range.prototype.getClientRects = function () {
      return {
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
      } as unknown as DOMRectList
    }
    Range.prototype.getBoundingClientRect = function () {
      return {
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect
    }
  }

  // landr-fzcg — jsdom doesn't ship ResizeObserver; Radix's Tooltip /
  // Popper rely on it. A noop polyfill is enough — Radix doesn't act on
  // the measurements during these tests.
  if (typeof window.ResizeObserver === 'undefined') {
    class ResizeObserverPolyfill {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverPolyfill,
    })
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverPolyfill,
    })
  }
}
