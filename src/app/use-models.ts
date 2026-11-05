import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

import { FALLBACK_MODELS, type ModelInfo, parseModels } from '../model/agents'

const KEY = 'aimux.models'

function cached(): ModelInfo[] {
  // The last list Claude Code gave, so the picker is right before it answers again.
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw === null ? [] : parseModels(raw)
    return list.length > 0 ? list : FALLBACK_MODELS
  } catch {
    return FALLBACK_MODELS
  }
}

/** The models Claude Code offers, asked once per launch. */
export function useModels() {
  const [models, setModels] = useState(cached)
  useEffect(() => {
    void invoke<string>('claude_models')
      .then((json) => {
        const list = parseModels(json)
        if (list.length === 0) return
        setModels(list)
        try {
          localStorage.setItem(KEY, json)
        } catch {
          // The cache only saves a fallback list on the next launch.
        }
      })
      .catch(() => {})
  }, [])
  return models
}
