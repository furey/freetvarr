export const tvAppsHost = ({ tvhUrl, browserHost }) => {
  const parsed = parseUrl(tvhUrl)
  if (!parsed) return ''
  const host = parsed.hostname.replace(/^\[|\]$/g, '')
  const reachable = isPrivateToFreetvarr(host) ? String(browserHost ?? '') : host
  return isPrivateToFreetvarr(reachable) ? '' : reachable
}

export const tvAppsAddresses = ({ tvhUrl, host, authCode }) => {
  const parsed = parseUrl(tvhUrl)
  const name = String(host ?? '').trim()
  if (!parsed || !name || !authCode) return null
  const httpPort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
  const base = `${parsed.protocol}//${hostWithPort({ host: name, port: parsed.port })}${parsed.pathname.replace(/\/+$/, '')}`
  const auth = encodeURIComponent(authCode)
  return {
    playlist: `${base}/playlist/auth/channels.m3u?auth=${auth}`,
    guide: `${base}/xmltv/channels?auth=${auth}`,
    host: name,
    httpPort,
    htspPort: HTSP_PORT,
  }
}

const parseUrl = (text) => {
  try {
    return new URL(String(text ?? '').trim())
  } catch {
    return null
  }
}

const hostWithPort = ({ host, port }) => {
  const bracketed = host.includes(':') ? `[${host}]` : host
  return port ? `${bracketed}:${port}` : bracketed
}

const isPrivateToFreetvarr = (host) => PRIVATE_HOSTS.includes(host) || host.startsWith('127.')

const PRIVATE_HOSTS = ['localhost', '::1', 'host.docker.internal', 'tvheadend']
const HTSP_PORT = '9982'
