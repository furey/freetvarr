export const sentenceCase = (label = '') => {
  const lower = String(label).toLowerCase()
  const capitalised = lower.charAt(0).toUpperCase() + lower.slice(1)
  return PROPER_WORDS.reduce((text, word) => text.replace(new RegExp(word, 'gi'), word), capitalised)
}

const PROPER_WORDS = ['A–Z', 'TVHeadend', 'Plex']
