import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

import { parseCommands, type SlashCommand } from '../chat/model'
import { FALLBACK_MODELS, type ModelInfo, parseModels } from '../model/agents'

const KEY = 'logit.models'

interface Offer {
  models: ModelInfo[]
  /** Claude's `/` commands from `$HOME`, for a chat that has not answered yet. */
  commands: SlashCommand[]
}

function parse(json: string): Offer {
  const answer = JSON.parse(json) as { commands?: unknown } | null
  return { commands: parseCommands(answer?.commands), models: parseModels(json) }
}

function cached(): Offer {
  // The last answer Claude Code gave, so the pickers are right before it answers again.
  try {
    const raw = localStorage.getItem(KEY)
    const offer = raw === null ? { commands: [], models: [] } : parse(raw)
    return offer.models.length > 0 ? offer : { ...offer, models: FALLBACK_MODELS }
  } catch {
    return { commands: [], models: FALLBACK_MODELS }
  }
}

/** The models and commands Claude Code offers, asked once per launch. */
export function useModels() {
  const [offer, setOffer] = useState(cached)
  useEffect(() => {
    void invoke<string>('claude_models')
      .then((json) => {
        const answer = parse(json)
        if (answer.models.length === 0) return
        setOffer(answer)
        try {
          localStorage.setItem(KEY, json)
        } catch {
          // The cache only saves a fallback list on the next launch.
        }
      })
      .catch(() => {})
  }, [])
  return offer
}
