import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { API_BASE } from './api/base'

// Free-tier hosting puts the API to sleep when idle. Waking it now, in
// parallel with the app booting, hides most of the cold-start wait.
fetch(`${API_BASE}/api/health`).catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
