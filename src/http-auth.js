import crypto from 'crypto'

export const authorizationFor = ({
  challenge,
  method,
  uri,
  username,
  password,
  nonceCount = 1,
  cnonce = randomCnonce(),
}) => {
  const scheme = /^\s*(\w+)/.exec(challenge || '')?.[1]?.toLowerCase()
  if (scheme === 'basic') return basicHeader({ username, password })
  if (scheme !== 'digest') return null
  const nc = formatNonceCount(nonceCount)
  return digestHeader({ params: parseChallenge(challenge), method, uri, username, password, nc, cnonce })
}

export const createChallengeCache = ({ maxIdleMs = CHALLENGE_MAX_IDLE_MS, now = Date.now } = {}) => {
  const entries = new Map()
  const remember = (key, challenge) => {
    if (challenge) entries.set(key, { challenge, usedAt: now(), uses: 0 })
  }
  const next = (key) => {
    const entry = entries.get(key)
    if (!entry) return null
    if (now() - entry.usedAt > maxIdleMs) {
      entries.delete(key)
      return null
    }
    entry.uses += 1
    entry.usedAt = now()
    return { challenge: entry.challenge, nonceCount: entry.uses }
  }
  const forget = (key) => entries.delete(key)
  return { remember, next, forget }
}

export const parseChallenge = (challenge) =>
  Object.fromEntries(
    [...String(challenge).matchAll(/(\w+)=(?:"([^"]*)"|([^\s,]*))/g)]
      .map(([, key, quoted, bare]) => [key.toLowerCase(), quoted ?? bare]),
  )

const basicHeader = ({ username, password }) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`

const digestHeader = ({ params, method, uri, username, password, nc, cnonce }) => {
  const algorithm = params.algorithm || 'MD5'
  const hash = hasherFor(algorithm)
  const ha1 = hash(`${username}:${params.realm}:${password}`)
  const ha2 = hash(`${method.toUpperCase()}:${uri}`)
  const usesQop = (params.qop || '').split(',').map((q) => q.trim()).includes('auth')
  const response = usesQop
    ? hash(`${ha1}:${params.nonce}:${nc}:${cnonce}:auth:${ha2}`)
    : hash(`${ha1}:${params.nonce}:${ha2}`)
  const fields = [
    `username="${username}"`,
    `realm="${params.realm}"`,
    `nonce="${params.nonce}"`,
    `uri="${uri}"`,
    `algorithm=${algorithm}`,
    `response="${response}"`,
    ...(params.opaque !== undefined ? [`opaque="${params.opaque}"`] : []),
    ...(usesQop ? ['qop=auth', `nc=${nc}`, `cnonce="${cnonce}"`] : []),
  ]
  return `Digest ${fields.join(', ')}`
}

const hasherFor = (algorithm) => {
  const name = /^sha-256/i.test(algorithm) ? 'sha256' : 'md5'
  return (text) => crypto.createHash(name).update(text).digest('hex')
}

const randomCnonce = () => crypto.randomBytes(8).toString('hex')

const formatNonceCount = (n) => n.toString(16).padStart(8, '0')

const CHALLENGE_MAX_IDLE_MS = 90_000
