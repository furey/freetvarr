export const trustworthyOriginHeaders = () => (req, res, next) => {
  if (isTrustworthyRequest(req)) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Origin-Agent-Cluster', '?1')
  }
  next()
}

export const isTrustworthyRequest = (req) => req.secure || isLoopbackHost(req.hostname)

const isLoopbackHost = (hostname = '') => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host)
}
