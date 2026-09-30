import crypto from 'crypto'

export const authorizationFor = ({ challenge, method, uri, username, password, cnonce = randomCnonce() }) => {
  const scheme = /^\s*(\w+)/.exec(challenge || '')?.[1]?.toLowerCase()
  if (scheme === 'basic') return basicHeader({ username, password })
  if (scheme !== 'digest') return null
  return digestHeader({ params: parseChallenge(challenge), method, uri, username, password, cnonce })
}

export const parseChallenge = (challenge) =>
  Object.fromEntries(
    [...String(challenge).matchAll(/(\w+)=(?:"([^"]*)"|([^\s,]*))/g)]
      .map(([, key, quoted, bare]) => [key.toLowerCase(), quoted ?? bare]),
  )

const basicHeader = ({ username, password }) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`

const digestHeader = ({ params, method, uri, username, password, cnonce }) => {
  const algorithm = params.algorithm || 'MD5'
  const hash = hasherFor(algorithm)
  const ha1 = hash(`${username}:${params.realm}:${password}`)
  const ha2 = hash(`${method.toUpperCase()}:${uri}`)
  const usesQop = (params.qop || '').split(',').map((q) => q.trim()).includes('auth')
  const response = usesQop
    ? hash(`${ha1}:${params.nonce}:${NONCE_COUNT}:${cnonce}:auth:${ha2}`)
    : hash(`${ha1}:${params.nonce}:${ha2}`)
  const fields = [
    `username="${username}"`,
    `realm="${params.realm}"`,
    `nonce="${params.nonce}"`,
    `uri="${uri}"`,
    `algorithm=${algorithm}`,
    `response="${response}"`,
    ...(params.opaque !== undefined ? [`opaque="${params.opaque}"`] : []),
    ...(usesQop ? ['qop=auth', `nc=${NONCE_COUNT}`, `cnonce="${cnonce}"`] : []),
  ]
  return `Digest ${fields.join(', ')}`
}

const hasherFor = (algorithm) => {
  const name = /^sha-256/i.test(algorithm) ? 'sha256' : 'md5'
  return (text) => crypto.createHash(name).update(text).digest('hex')
}

const randomCnonce = () => crypto.randomBytes(8).toString('hex')

const NONCE_COUNT = '00000001'
