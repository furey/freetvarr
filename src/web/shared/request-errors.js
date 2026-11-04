export const OFFLINE_MESSAGE = 'Could not reach Freetvarr. Check the connection, then try again.'
export const RATE_LIMITED_MESSAGE = 'Too many tries in a minute. Wait a moment, then try again.'

export const reachServer = async (send) => {
  try {
    return await send()
  } catch (cause) {
    throw Object.assign(new Error(OFFLINE_MESSAGE), { status: 0, code: 'offline', stage: null, data: {}, cause })
  }
}

export const failureText = ({ action, err }) => {
  const message = String(err?.message ?? '')
  if (STANDALONE_CODES.includes(err?.code) || /^Could not\b/.test(message)) return message
  return `${action}: ${message}`
}

export const responseErrorOf = ({ status, data = {} }) => Object.assign(new Error(messageOf({ status, data })), {
  code: data.code || (status === 429 ? 'rate-limited' : null),
  stage: data.stage || null,
  status,
  data,
})

const STANDALONE_CODES = ['offline', 'rate-limited']

const messageOf = ({ status, data }) => data.error || data.reason || (status === 429 ? RATE_LIMITED_MESSAGE : `HTTP ${status}`)
