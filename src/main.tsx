import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { queryClient } from '@/lib/queryClient'
import { initSentry } from '@/lib/sentry'

// landr-52ik.1 — strictly gated on VITE_SENTRY_DSN; complete no-op until a
// Sentry project + DSN are provisioned (human-only, see the handoff). As
// early as possible, before the app renders. See src/lib/sentry.ts for the
// full gating + captureError() wiring rationale.
initSentry()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Stub: m05.11 ships the real PWA wiring.
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
