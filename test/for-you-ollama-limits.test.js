import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-ollama-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const { fetchOllamaTags } = await import('../src/for-you-engine.js')
const { db } = await import('../src/db.js')

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const serve = async (body) => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(body)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}

test('fetchOllamaTags reads a normal tag list', async () => {
  const { server, url } = await serve(JSON.stringify({ models: [{ name: 'nomic-embed-text' }] }))
  try {
    const res = await fetchOllamaTags(url)
    assert.equal(res.status, 200)
    assert.equal(res.data.models[0].name, 'nomic-embed-text')
  } finally {
    server.close()
  }
})

test('fetchOllamaTags refuses a response over the size limit', async () => {
  const { server, url } = await serve(JSON.stringify({ models: [], padding: 'x'.repeat(2 * 1024 * 1024) }))
  try {
    await assert.rejects(fetchOllamaTags(url), /maxContentLength/)
  } finally {
    server.close()
  }
})
