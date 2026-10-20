export const TIERS = ['basic', 'standard', 'plus']
export const TIER_OVERRIDES = ['auto', ...TIERS]
export const DEFAULT_DAILY_TEXTS = 600
export const MIN_HEADROOM_MB = 400
export const BASIC_BUDGET_S = 5 * 60
export const PLUS_BUDGET_S = 2 * 60
export const PLUS_SLOWDOWN = 2.5

export const MODELS = {
  standard: { id: 'Xenova/all-MiniLM-L6-v2', dtype: 'q8', dims: 384 },
  plus: { id: 'Xenova/bge-small-en-v1.5', dtype: 'q8', dims: 384 },
}

export const tierOverrideFrom = (stored) => (TIER_OVERRIDES.includes(stored) ? stored : 'auto')

export const cpuFlagsOf = (cpuinfo = '') => {
  const line = String(cpuinfo).split('\n').find((row) => /^(flags|features)\s*:/i.test(row)) || ''
  const flags = new Set(line.split(':').slice(1).join(':').trim().split(/\s+/).filter(Boolean))
  return { avx: flags.has('avx'), avx2: flags.has('avx2'), asimd: flags.has('asimd') }
}

export const memAvailableMbOf = (meminfo = '') => {
  const match = String(meminfo).match(/^MemAvailable:\s+(\d+)\s*kB/m)
  return match ? Math.round(Number(match[1]) / 1024) : null
}

export const cgroupHeadroomMbOf = ({ max, current }) => {
  const limit = Number(String(max ?? '').trim())
  const used = Number(String(current ?? '').trim())
  if (!Number.isFinite(limit) || limit <= 0 || limit > UNLIMITED_BYTES) return null
  if (!Number.isFinite(used)) return null
  return Math.max(0, Math.round((limit - used) / MB))
}

export const headroomMbOf = ({ availableMb, cgroupMb }) => {
  const known = [availableMb, cgroupMb].filter((value) => Number.isFinite(value))
  return known.length ? Math.min(...known) : null
}

export const staticCapabilityOf = ({ arch, cores, cpuinfo, meminfo, cgroupMax, cgroupCurrent }) => {
  const availableMb = memAvailableMbOf(meminfo)
  const cgroupMb = cgroupHeadroomMbOf({ max: cgroupMax, current: cgroupCurrent })
  return {
    arch,
    cores,
    flags: cpuFlagsOf(cpuinfo),
    availableMb,
    cgroupMb,
    headroomMb: headroomMbOf({ availableMb, cgroupMb }),
  }
}

export const dailyTextsOf = ({ distinctTexts, spanMs, dayMs = DAY_MS }) => {
  if (!(distinctTexts > 0) || !(spanMs > 0)) return DEFAULT_DAILY_TEXTS
  return Math.max(1, Math.round(distinctTexts / Math.max(1, spanMs / dayMs)))
}

export const decideTier = ({
  capability = {},
  onnx = { ok: false },
  bench = null,
  dailyTexts = DEFAULT_DAILY_TEXTS,
  ollama = null,
  override = 'auto',
}) => {
  const auto = autoTierOf({ capability, onnx, bench, dailyTexts, ollama })
  if (override === 'auto' || !TIERS.includes(override)) return { ...auto, source: 'auto' }
  if (override === 'basic') return { tier: 'basic', reason: 'Set to basic in settings', source: 'override' }
  const canEmbed = (onnx.ok && bench?.ok) || Boolean(ollama?.model)
  if (!canEmbed) return { ...auto, source: 'auto', overrideIgnored: override }
  return { tier: override, reason: `Set to ${override} in settings`, source: 'override' }
}

export const embedderOf = ({ tier, ollama = null }) => {
  if (tier === 'basic') return null
  if (tier === 'plus' && ollama?.model) return { kind: 'ollama', id: `ollama:${ollama.model}`, url: ollama.url, model: ollama.model }
  const model = MODELS[tier] || MODELS.standard
  return { kind: 'local', ...model }
}

export const embedModelIn = ({ tags = [], wanted = null }) => {
  const names = tags.map((tag) => String(tag?.name || tag?.model || '')).filter(Boolean)
  if (wanted) return names.find((name) => name === wanted || name.split(':')[0] === wanted) || null
  return names.find((name) => /embed|bge|minilm|e5/i.test(name)) || null
}

export const probeKeyOf = ({ version, host, arch }) => `${version}|${host}|${arch}`

const autoTierOf = ({ capability, onnx, bench, dailyTexts, ollama }) => {
  if (ollama?.model) return { tier: 'plus', reason: `Ollama has the embedding model ${ollama.model}` }
  if (!onnx.ok) return { tier: 'basic', reason: 'This box cannot run the suggestion model', detail: onnx.error || 'failed to load' }
  if (Number.isFinite(capability.headroomMb) && capability.headroomMb < MIN_HEADROOM_MB) {
    return { tier: 'basic', reason: `Only ${capability.headroomMb} MB of memory is free (needs ${MIN_HEADROOM_MB} MB)` }
  }
  if (!bench?.ok) return { tier: 'basic', reason: 'The speed check did not finish', detail: bench?.error || 'no result' }
  const dailySeconds = (bench.msPerText * dailyTexts) / 1000
  if (dailySeconds > BASIC_BUDGET_S) {
    return { tier: 'basic', reason: `Embedding ${dailyTexts} new texts a day would take ${Math.round(dailySeconds)} s` }
  }
  const plusSeconds = dailySeconds * PLUS_SLOWDOWN
  if (plusSeconds < PLUS_BUDGET_S) {
    return { tier: 'plus', reason: `About ${Math.round(plusSeconds)} s a day with the larger model` }
  }
  return { tier: 'standard', reason: `About ${Math.round(dailySeconds)} s a day for ${dailyTexts} new texts` }
}

const MB = 1024 * 1024
const DAY_MS = 24 * 60 * 60 * 1000
const UNLIMITED_BYTES = 2 ** 60
