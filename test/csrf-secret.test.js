import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { CSRF_SECRET_FILE, resolveCsrfSecret } from '../src/csrf-secret.js'

const tempDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-csrf-'))

test('resolveCsrfSecret: an env secret wins and no file is written', async () => {
  const configDir = await tempDir()
  const result = await resolveCsrfSecret({ envSecret: 'from-env', configDir })
  assert.deepEqual(result, { secret: 'from-env', source: 'env' })
  await assert.rejects(fs.access(path.join(configDir, CSRF_SECRET_FILE)))
})

test('resolveCsrfSecret: generates a 32-byte secret readable only by its owner', async () => {
  const configDir = path.join(await tempDir(), 'missing', 'config')
  const result = await resolveCsrfSecret({ configDir })
  assert.equal(result.source, 'generated')
  assert.match(result.secret, /^[0-9a-f]{64}$/)
  const stat = await fs.stat(result.file)
  assert.equal(stat.mode & 0o777, 0o600)
  assert.equal(await fs.readFile(result.file, 'utf8'), result.secret)
})

test('resolveCsrfSecret: a later start reuses the stored secret', async () => {
  const configDir = await tempDir()
  const first = await resolveCsrfSecret({ configDir })
  const second = await resolveCsrfSecret({ configDir })
  assert.equal(second.source, 'file')
  assert.equal(second.secret, first.secret)
})

test('resolveCsrfSecret: an empty file is replaced with a new secret', async () => {
  const configDir = await tempDir()
  await fs.writeFile(path.join(configDir, CSRF_SECRET_FILE), '\n')
  const result = await resolveCsrfSecret({ configDir })
  assert.equal(result.source, 'generated')
  assert.match(result.secret, /^[0-9a-f]{64}$/)
})

test('resolveCsrfSecret: an unwritable folder throws', { skip: process.getuid?.() === 0 }, async () => {
  const configDir = await tempDir()
  await fs.chmod(configDir, 0o500)
  await assert.rejects(resolveCsrfSecret({ configDir }), { code: 'EACCES' })
  await fs.chmod(configDir, 0o700)
})
