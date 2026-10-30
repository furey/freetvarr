import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'src')
const NOT_FOR_DEPLOY = new Set(['PATH', 'ARTWORK_PATH'])

const serverSources = () => fs.readdirSync(SRC)
  .filter((name) => name.endsWith('.js'))
  .map((name) => fs.readFileSync(path.join(SRC, name), 'utf8'))

const envNamesRead = () => {
  const names = serverSources().flatMap((text) => [...text.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]))
  return [...new Set(names)].filter((name) => !NOT_FOR_DEPLOY.has(name)).sort()
}

const composeText = () => fs.readFileSync(path.join(ROOT, 'docker-compose.example.yml'), 'utf8')

const freetvarrEnvironment = () => {
  const service = composeText().split(/\n  freetvarr:\n/)[1].split(/\n    volumes:\n/)[0]
  return service.split('\n')
    .map((line) => line.match(/^\s+- ([A-Z][A-Z0-9_]*)(?:=(.*))?$/))
    .filter(Boolean)
    .map(([, name, value]) => ({ name, value }))
}

test('compose: the freetvarr service passes every variable the server reads', () => {
  const passed = new Set(freetvarrEnvironment().map((entry) => entry.name))
  const missing = envNamesRead().filter((name) => !passed.has(name))
  assert.deepEqual(missing, [])
})

test('compose: an unset LIVE_TV_MAX_SESSIONS stays empty so the benchmark decides', () => {
  const entry = freetvarrEnvironment().find((e) => e.name === 'LIVE_TV_MAX_SESSIONS')
  assert.equal(entry.value, '${LIVE_TV_MAX_SESSIONS:-}')
})

test('compose: optional passthroughs default to empty', () => {
  const values = Object.fromEntries(freetvarrEnvironment().map((e) => [e.name, e.value]))
  for (const name of ['TVH_URL', 'LIVE_TV_VAAPI_DEVICE', 'MOVIES_ROOT']) {
    assert.equal(values[name], `\${${name}:-}`)
  }
})
