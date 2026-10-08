import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { API_BASE } from './api/base'
import { initI18n } from './i18n'

// Free-tier hosting puts the API to sleep when idle. Waking it now, in
// parallel with the app booting, hides most of the cold-start wait.
fetch(`${API_BASE}/api/health`).catch(() => {})

// The language's text is loaded before anything is drawn, so the page never shows one language and then switches to another.
initI18n().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
})
