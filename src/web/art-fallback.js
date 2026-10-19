export const artHueOf = (title) =>
  [...String(title || '')].reduce((hash, char) => (hash * 31 + char.codePointAt(0)) % 360, 7)

export const artFallbackStyle = (title) => ({ '--art-hue': String(artHueOf(title)) })
