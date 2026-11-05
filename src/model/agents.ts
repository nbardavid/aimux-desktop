// A chat's model and reasoning effort, from the list Claude Code itself gives on startup.
// `default` and an empty effort leave Claude Code its own choice.

export interface ModelInfo {
  /** What `--model` takes: an alias (`opus`) or a full id (`claude-opus-5`). */
  value: string
  name: string
  description: string
  efforts: string[]
}

const ALL_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

/** Until Claude Code has answered (or when it cannot), its aliases. */
export const FALLBACK_MODELS: ModelInfo[] = [
  {
    description: 'Claude Code’s own choice',
    efforts: ALL_EFFORTS,
    name: 'Default',
    value: 'default',
  },
  {
    description: 'Complex work and everyday tasks',
    efforts: ALL_EFFORTS,
    name: 'Opus',
    value: 'opus',
  },
  { description: 'Simpler tasks, faster', efforts: ALL_EFFORTS, name: 'Sonnet', value: 'sonnet' },
  { description: 'Quick answers', efforts: ALL_EFFORTS, name: 'Haiku', value: 'haiku' },
]

interface RawModel {
  value?: unknown
  displayName?: unknown
  description?: unknown
  supportedEffortLevels?: unknown
}

/** The `models` of Claude Code's `initialize` answer. */
export function parseModels(json: string): ModelInfo[] {
  const raw = JSON.parse(json) as unknown
  if (!Array.isArray(raw)) return []
  return (raw as RawModel[]).flatMap((m) => {
    if (typeof m.value !== 'string' || typeof m.displayName !== 'string') return []
    const efforts = Array.isArray(m.supportedEffortLevels)
      ? m.supportedEffortLevels.filter((e): e is string => typeof e === 'string')
      : []
    return [
      {
        description: typeof m.description === 'string' ? m.description : '',
        efforts,
        name: m.displayName.replace(/\s*\(recommended\)$/i, ''),
        value: m.value,
      },
    ]
  })
}

export const effortLabel = (effort: string) =>
  effort === 'xhigh' ? 'Extra high' : effort.charAt(0).toUpperCase() + effort.slice(1)

export interface ChatSettings {
  model: string
  effort: string
}

export const DEFAULT_CHAT: ChatSettings = { effort: '', model: 'default' }

/** Keeps a model the list offers and an effort that model takes. */
export function normalize(settings: ChatSettings, models: ModelInfo[]): ChatSettings {
  const model = models.find((m) => m.value === settings.model) ?? models[0]
  if (!model) return DEFAULT_CHAT
  return {
    effort: model.efforts.includes(settings.effort) ? settings.effort : '',
    model: model.value,
  }
}

/** The next effort the model takes, back to its default after the last. */
export function cycleEffort(settings: ChatSettings, models: ModelInfo[]): ChatSettings {
  const levels = ['', ...(models.find((m) => m.value === settings.model)?.efforts ?? [])]
  const next = levels[(levels.indexOf(settings.effort) + 1) % levels.length] ?? ''
  return { ...settings, effort: next }
}

/** "Opus 5.5 · High", leaving a default effort unsaid. */
export function describe(settings: ChatSettings, models: ModelInfo[]): string {
  const model = models.find((m) => m.value === settings.model)
  return [model?.name ?? 'Claude', settings.effort === '' ? '' : effortLabel(settings.effort)]
    .filter(Boolean)
    .join(' · ')
}

/** What `chat_start` passes on: nothing for Claude Code's defaults. */
export const chatFlags = (settings: ChatSettings) => ({
  effort: settings.effort,
  model: settings.model === 'default' ? '' : settings.model,
})
