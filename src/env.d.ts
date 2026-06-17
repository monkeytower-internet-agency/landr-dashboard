// Global compile-time constants injected by vite.config.ts `define`.
// Keep in sync with the `define` block in vite.config.ts.
declare const __APP_VERSION__: string

// canvas-confetti does not ship bundled types; declare the module inline.
// The default export is the fire function; named exports for create/reset/etc.
declare module 'canvas-confetti' {
  interface Options {
    particleCount?: number
    angle?: number
    spread?: number
    startVelocity?: number
    decay?: number
    gravity?: number
    drift?: number
    flat?: boolean
    ticks?: number
    origin?: { x?: number; y?: number }
    colors?: string[]
    shapes?: string[]
    scalar?: number
    zIndex?: number
    disableForReducedMotion?: boolean
    resize?: boolean
    useWorker?: boolean
  }

  type ConfettiFn = (options?: Options) => Promise<null> | null
  const confetti: ConfettiFn & {
    reset: () => void
    create: (
      canvas: HTMLCanvasElement,
      options?: { resize?: boolean; useWorker?: boolean; disableForReducedMotion?: boolean },
    ) => ConfettiFn
  }
  export default confetti
}
