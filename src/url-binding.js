import os from 'os'

export const sameOrigin = (a, b) => {
  const first = originOf(a)
  const second = originOf(b)
  return Boolean(first && second && first === second)
}

export const isThisMachineHost = (host, { interfaces = os.networkInterfaces() } = {}) => {
  const name = normaliseHost(host)
  if (!name) return false
  if (LOOPBACK_NAMES.has(name) || name.startsWith('127.')) return true
  return localAddressesOf(interfaces).has(name)
}

export const isThisMachineUrl = (url, options) => {
  const parsed = parseUrl(url)
  return Boolean(parsed && isThisMachineHost(parsed.hostname, options))
}

export const keepsSecretBinding = ({ url, previous, interfaces }) =>
  sameOrigin(url, previous) || (isThisMachineUrl(url, { interfaces }) && isThisMachineUrl(previous, { interfaces }))

export const hostOf = (url) => normaliseHost(parseUrl(url)?.hostname)

export const portOf = (url) => {
  const parsed = parseUrl(url)
  if (!parsed) return ''
  return parsed.port || DEFAULT_PORTS[parsed.protocol] || ''
}

const originOf = (url) => {
  const parsed = parseUrl(url)
  if (!parsed) return null
  return `${parsed.protocol}//${normaliseHost(parsed.hostname)}:${portOf(url)}`
}

const parseUrl = (url) => {
  const text = String(url ?? '').trim()
  if (!text) return null
  try {
    const parsed = new URL(text)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null
  } catch {
    return null
  }
}

const localAddressesOf = (interfaces) =>
  new Set(
    Object.values(interfaces || {})
      .flat()
      .filter(Boolean)
      .map((i) => normaliseHost(i.address)),
  )

const normaliseHost = (host) =>
  String(host ?? '').trim().toLowerCase().replace(/^\[(.*)\]$/, '$1').replace(/^::ffff:/, '').replace(/\.$/, '')

const LOOPBACK_NAMES = new Set(['localhost', '::1', 'host.docker.internal'])

const DEFAULT_PORTS = { 'http:': '80', 'https:': '443' }
