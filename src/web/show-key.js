export const showKeyOf = (title) => String(title ?? '')
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'untitled'

export const showHrefOf = (title) => `#/recordings/show/${showKeyOf(title)}`
