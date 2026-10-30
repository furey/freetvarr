export const showKeyOf = (title) => String(title ?? '')
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'untitled'

export const showHrefOf = (title) => `#/recordings/show/${rememberShowTitle(title)}`

export const rememberShowTitle = (title) => {
  const key = showKeyOf(title)
  const text = String(title ?? '').trim()
  if (text && key !== 'untitled') knownTitles.set(key, text)
  return key
}

export const knownShowTitleOf = (key) => knownTitles.get(key) || ''

const knownTitles = new Map()
