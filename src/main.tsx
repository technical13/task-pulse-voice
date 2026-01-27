import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { I18nextProvider } from 'react-i18next'
import './index.css'
import App from './App.tsx'
import { i18n } from './i18n'

const convexUrl = import.meta.env.VITE_CONVEX_URL
const hasConvexUrl = typeof convexUrl === 'string' && convexUrl.length > 0

if (!hasConvexUrl) {
  console.error(
    'VITE_CONVEX_URL не задан. Укажите переменную окружения VITE_CONVEX_URL для настройки backend.',
  )
}

const root = createRoot(document.getElementById('root')!)

if (!hasConvexUrl) {
  root.render(
    <StrictMode>
      <div
        style={{
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          padding: '32px',
          lineHeight: 1.5,
        }}
      >
        <h1 style={{ fontSize: '20px', margin: '0 0 12px' }}>
          Backend не настроен
        </h1>
        <p style={{ margin: 0 }}>
          Укажите <strong>VITE_CONVEX_URL</strong> в environment variables и
          перезапустите приложение.
        </p>
      </div>
    </StrictMode>,
  )
} else {
  const convex = new ConvexReactClient(convexUrl)
  root.render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <ConvexProvider client={convex}>
          <App />
        </ConvexProvider>
      </I18nextProvider>
    </StrictMode>,
  )
}
