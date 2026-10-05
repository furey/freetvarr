import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const CSRF_SECRET_FILE = 'csrf-secret'

export const resolveCsrfSecret = async ({ envSecret, configDir }) => {
  if (envSecret) return { secret: envSecret, source: 'env' }
  const file = path.join(configDir, CSRF_SECRET_FILE)
  const stored = await readSecret(file)
  if (stored) return { secret: stored, source: 'file', file }
  await fs.mkdir(configDir, { recursive: true })
  const secret = crypto.randomBytes(32).toString('hex')
  try {
    await fs.writeFile(file, secret, { mode: 0o600, flag: stored === null ? 'wx' : 'w' })
    return { secret, source: 'generated', file }
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
    return { secret: await readSecret(file), source: 'file', file }
  }
}

const readSecret = async (file) => {
  try {
    return (await fs.readFile(file, 'utf8')).trim()
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}
