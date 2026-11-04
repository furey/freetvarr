import { spawn } from 'node:child_process'
export const launch = async ({ bin, port, args }) => {
  const proc = spawn(bin, [`--remote-debugging-port=${port}`, ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
  let ws
  for (let i = 0; i < 100 && !ws; i++) {
    await new Promise((r) => setTimeout(r, 100))
    ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j) => j.webSocketDebuggerUrl).catch(() => null)
  }
  const sock = new WebSocket(ws)
  await new Promise((r) => sock.addEventListener('open', r))
  let id = 0
  const pending = new Map()
  const listeners = []
  sock.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    } else listeners.forEach((l) => l(msg))
  })
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    sock.send(JSON.stringify({ id: n, method, params, sessionId }))
  })
  const once = (method) => new Promise((r) => { const l = (m) => { if (m.method === method) { listeners.splice(listeners.indexOf(l), 1); r(m.params) } }; listeners.push(l) })
  const on = (fn) => listeners.push(fn)
  const close = () => { sock.close(); proc.kill() }
  return { send, once, on, close, proc }
}
