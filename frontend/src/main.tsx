import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Free-tier hosting puts the API to sleep when idle. Waking it now, in
// parallel with the app booting, hides most of the cold-start wait.
fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}/api/health`).catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
