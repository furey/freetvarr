export const foldText = (text) => withoutAccents(String(text ?? '')).toLowerCase()

export const withoutAccents = (text) => (ASCII_ONLY.test(text) ? text : text.normalize('NFKD').replace(/[̀-ͯ]/g, ''))

export const normaliseSearchText = (text) => foldText(text)
  .replace(/[’'`]/g, '')
  .replace(/[&+]/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

export const withoutRegionWords = (normalised) => normalised
  .split(' ')
  .filter((word) => !REGION_WORDS.has(word))
  .join(' ')

export const wordsOfTitle = (title) => foldText(title)
  .replace(/[’'`]/g, '')
  .replace(/[&+]/g, ' and ')
  .split(/[^a-z0-9]+/)
  .filter(Boolean)

export const startsAtWord = ({ haystack, needle }) => ` ${haystack}`.includes(` ${needle}`)

const ASCII_ONLY = /^[\x00-\x7f]*$/

export const REGION_WORDS = new Set(['au', 'australia', 'nz'])
