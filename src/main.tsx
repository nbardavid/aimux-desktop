import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app'
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
