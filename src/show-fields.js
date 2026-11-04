export const showFieldErrorOf = ({ key, value }) => {
  const text = String(value ?? '').trim()
  if (REQUIRED_LABELS[key] && (!text || text === '.')) return `${REQUIRED_LABELS[key]} must not be empty.`
  if (key !== 'show_pattern' && escapesMediaRoot(text)) return `${key} must stay within the media root (no '..' or leading '/')`
  return null
}

const escapesMediaRoot = (value) =>
  value.startsWith('/')
  || value.startsWith('\\')
  || value.split(/[/\\]+/).includes('..')

const REQUIRED_LABELS = { show_pattern: 'The title match', dest_folder: 'The folder' }
