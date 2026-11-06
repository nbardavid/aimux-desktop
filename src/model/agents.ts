// A chat's model and reasoning effort, from the list Claude Code itself gives on startup.
// `default` and an empty effort leave Claude Code its own choice.

export interface ModelInfo {
  /** What `--model` takes: an alias (`opus`) or a full id (`claude-opus-5`). */
  value: string
  name: string
  description: string
  efforts: string[]
  /** The model an alias stands for today (`default` → `claude-opus-5-5`). */
  resolved?: string
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
  resolvedModel?: unknown
  displayName?: unknown
  description?: unknown
  supportedEffortLevels?: unknown
}

/** The `models` of Claude Code's `initialize` answer (the whole answer, or that list alone). */
export function parseModels(json: string): ModelInfo[] {
  const parsed = JSON.parse(json) as unknown
  const raw = Array.isArray(parsed) ? parsed : (parsed as { models?: unknown } | null)?.models
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
        resolved: typeof m.resolvedModel === 'string' ? m.resolvedModel : m.value,
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

/** What `chat_start` passes on: nothing for Claude Code's defaults. */
export const chatFlags = (settings: ChatSettings) => ({
  effort: settings.effort,
  model: settings.model === 'default' ? '' : settings.model,
})

/**
 * A model as the app names it: "Sonnet 5.5", and the default by the model it runs ("Opus
 * 5.5"); "Default" is only a row of the picker.
 */
export function modelName(value: string, models: ModelInfo[]): string {
  const model = models.find((m) => m.value === value)
  if (!model) return value === 'default' ? 'Default' : value || 'Claude'
  const twin =
    model.value === 'default'
      ? models.find((m) => m !== model && m.resolved !== undefined && m.resolved === model.resolved)
      : undefined
  return twin ? twin.name : model.name
}

/** An effort as the slider says it: Auto for Claude Code's own choice. */
export const effortName = (effort: string) => (effort === '' ? 'Auto' : effortLabel(effort))

/** A chat's model as its footer says it: "Sonnet 5.5 · High", "Opus 5.5 · Auto". */
export function agentLabel(settings: ChatSettings, models: ModelInfo[]): string {
  const name = modelName(settings.model, models)
  const model = models.find((m) => m.value === settings.model)
  if (!model || model.efforts.length === 0) return name
  return `${name} · ${effortName(settings.effort)}`
}

/**
 * What a chat's record keeps for the model Claude Code says it runs (`claude-sonnet-5-5` at
 * start, "Sonnet 5.5" after `/model`): the record's own when that is the same model.
 */
export function reportedModel(reported: string, current: string, models: ModelInfo[]): string {
  const said = reported.toLowerCase()
  const is = (m: ModelInfo) => [m.value, m.resolved, m.name].some((x) => x?.toLowerCase() === said)
  const now = models.find((m) => m.value === (current || 'default'))
  if (now && is(now)) return current
  const match = models.find((m) => m.value !== 'default' && is(m)) ?? models.find(is)
  if (!match) return current
  return match.value === 'default' ? '' : match.value
}

/**
 * `/model sonnet` or `/effort high` typed in a chat: the settings it asks for, or null when
 * it names nothing the model list offers (the picker then opens). `auto` is the default effort.
 */
export function agentCommand(
  name: 'model' | 'effort',
  args: string,
  settings: ChatSettings,
  models: ModelInfo[]
): ChatSettings | null {
  const said = args.trim().toLowerCase()
  if (said === '') return null
  if (name === 'model') {
    const m = models.find((x) => x.value.toLowerCase() === said || x.name.toLowerCase() === said)
    return m ? normalize({ ...settings, model: m.value }, models) : null
  }
  if (said === 'auto') return { ...settings, effort: '' }
  const efforts = models.find((m) => m.value === settings.model)?.efforts ?? []
  const level = efforts.find((e) => e === said || effortLabel(e).toLowerCase() === said)
  return level === undefined ? null : { ...settings, effort: level }
}
