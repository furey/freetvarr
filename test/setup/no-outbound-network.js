import net from 'node:net'

const violations = []

const normalizeArgs = (args) => {
  const [first, second] = args
  if (first !== null && typeof first === 'object') return first
  if (typeof first === 'string' && Number.isNaN(Number(first))) return { path: first }
  return { port: first, host: typeof second === 'string' ? second : undefined }
}

const isLoopbackHost = (host) => {
  if (!host) return true
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase()
  return bare === 'localhost' || bare === '::1' || bare === '::' || bare === '0.0.0.0' || /^127\./.test(bare)
}

const originalConnect = net.Socket.prototype.connect

net.Socket.prototype.connect = function connect(...args) {
  const options = normalizeArgs(args)
  if (!options.path && !isLoopbackHost(options.host)) {
    const message = `Test opened an outbound connection to ${options.host}:${options.port}`
    violations.push(message)
    const error = new Error(message)
    error.code = 'ENETBLOCKED'
    throw error
  }
  return originalConnect.apply(this, args)
}

process.on('exit', () => {
  if (!violations.length) return
  process.stderr.write(`${[...new Set(violations)].join('\n')}\n`)
  process.exitCode = 1
})
