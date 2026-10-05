import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { tvhRead } from '../../src/tvheadend.js'

const run = promisify(execFile)

export const startTvheadend = async () => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-tvh-it-'))
  const port = await freePort()
  const name = `freetvarr-tvh-it-${process.pid}-${port}`
  const ids = process.getuid ? ['-e', `PUID=${process.getuid()}`, '-e', `PGID=${process.getgid()}`] : []
  await run('docker', [
    'run', '-d', '--name', name,
    '-p', `127.0.0.1:${port}:9981`,
    ...ids,
    '-v', `${configDir}:/config`,
    IMAGE,
  ])
  const url = `http://127.0.0.1:${port}`
  const stop = async () => {
    await run('docker', ['rm', '-f', name]).catch(() => null)
    await fs.rm(configDir, { recursive: true, force: true }).catch(() => null)
  }
  const ready = await eventually(() => anonymousStatus({ url }).then((s) => s === 200), { attempts: 120 })
  if (!ready) {
    await stop()
    throw new Error(`TVHeadend did not answer at ${url}`)
  }
  return { url, stop }
}

export const anonymousStatus = async ({ url }) => {
  try {
    await tvhRead('serverinfo', {}, { url, username: '', password: '' })
    return 200
  } catch (err) {
    return err.status ?? 0
  }
}

export const eventually = async (check, { attempts = 15, delayMs = 1000 } = {}) => {
  for (let i = 0; i < attempts; i += 1) {
    if (await check().catch(() => false)) return true
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return false
}

export const dockerAvailable = () => run('docker', ['version']).then(() => true, () => false)

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    server.close(() => resolve(port))
  })
})

const IMAGE = 'lscr.io/linuxserver/tvheadend:latest'
