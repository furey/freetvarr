export const artHueOf = (title) =>
  [...String(title || '')].reduce((hash, char) => (hash * 31 + char.codePointAt(0)) % 360, 7)

export const artFallbackStyle = (title) => ({ '--art-hue': String(artHueOf(title)) })

export const ART_STATE_HEADER = 'X-Art-State'
export const ART_FINAL = 'final'
export const ART_PROBE_LOADED = 'loaded'
export const ART_PROBE_CANCELLED = 'cancelled'

export const artProbeStateOf = ({ ok, state }) => {
  if (ok) return ART_PROBE_LOADED
  return state === ART_FINAL ? ART_FINAL : 'pending'
}
