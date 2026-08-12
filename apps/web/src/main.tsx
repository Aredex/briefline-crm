import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/tailwind.css'
import './styles/tokens.css'
import './styles/global.css'
import './components/ui/ui.css'

// PH-07 dev mocks — enabled ONLY via VITE_ENABLE_MOCKS=true in development.
// Guard INT-001: the dynamic import never ships in the production bundle.
if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true') {
  void import('./mocks/enable').then(({ enableMocking }) => enableMocking())
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
