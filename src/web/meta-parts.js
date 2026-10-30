export const metaPartsOf = (text) => {
  const parts = String(text ?? '').split(SEPARATOR).map((part) => part.trim()).filter(Boolean)
  return parts.map((part, index) => {
    const shown = index < parts.length - 1 ? `${part} ·` : part
    return { text: shown, whole: shown.length <= WHOLE_MAX }
  })
}

const SEPARATOR = ' · '
const WHOLE_MAX = 32
