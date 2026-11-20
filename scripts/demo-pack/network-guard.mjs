import fs from 'node:fs'
import net from 'node:net'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'])
const LOG_FILE = process.env.NETWORK_GUARD_LOG || ''
const realConnect = net.Socket.prototype.connect
const reported = new Set()

const targetOf = (args) => {
  const [first, second] = args
  if (Array.isArray(first)) return targetOf(first)
  if (first && typeof first === 'object') return { host: first.host ?? 'localhost', port: first.port, path: first.path }
  return { host: typeof second === 'string' ? second : 'localhost', port: first }
}

const report = ({ host, port }) => {
  const line = `[network-guard] blocked ${host}:${port}`
  if (reported.has(line)) return
  reported.add(line)
  console.error(line)
  if (LOG_FILE) fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${host}:${port}\n`)
}

net.Socket.prototype.connect = function guardedConnect(...args) {
  const target = targetOf(args)
  if (target.path || LOOPBACK_HOSTS.has(String(target.host).toLowerCase())) return realConnect.apply(this, args)
  report(target)
  process.nextTick(() => this.destroy(Object.assign(new Error(`network-guard: ${target.host} is outside the demo pack`), { code: 'ECONNREFUSED' })))
  return this
}

console.error('[network-guard] only loopback connections are allowed')
