import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Inter, self-hosted (ADR 0071): no request to Google Fonts.
import '@fontsource-variable/inter/wght.css'
import './index.css'
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
