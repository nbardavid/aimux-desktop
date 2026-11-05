import { LucideProvider } from 'lucide-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
import '@fontsource/geist-mono/600.css'
import '@xterm/xterm/css/xterm.css'

import './styles.css'

// In a plain browser (vite dev only), Tauri's IPC is answered from fixtures, and
// `?gallery` shows the UI primitives instead of the app.
const preview = import.meta.env.DEV && !('__TAURI_INTERNALS__' in window)
const gallery = preview && new URLSearchParams(location.search).has('gallery')

async function start() {
  if (preview) await import('./dev/mock-ipc')
  const Root = gallery ? (await import('./dev/gallery')).Gallery : App
  const root = document.querySelector('#root')
  if (root) {
    createRoot(root).render(
      <StrictMode>
        {/* Every icon in the app's one stroke. */}
        <LucideProvider strokeWidth={1.5}>
          <Root />
        </LucideProvider>
      </StrictMode>
    )
  }
}

void start()
