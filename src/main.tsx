import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app'
import '@fontsource/funnel-display/600.css'
import '@fontsource/funnel-sans/400.css'
import '@fontsource/funnel-sans/500.css'
import '@fontsource/funnel-sans/600.css'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
import '@fontsource/geist-mono/600.css'

import './styles.css'

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
