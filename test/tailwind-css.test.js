import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TAILWIND_CLI = path.join(ROOT, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs')

const buildTailwindCss = async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [TAILWIND_CLI, '-i', 'src/tailwind.css', '--minify'],
    { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 },
  )
  return stdout.trimEnd()
}

test('src/web/tailwind.css matches a fresh build of the classes in src/web', async () => {
  const committed = (await fs.readFile(path.join(ROOT, 'src', 'web', 'tailwind.css'), 'utf8')).trimEnd()
  const fresh = await buildTailwindCss()
  assert.ok(fresh === committed, 'src/web/tailwind.css is stale: run npm run build:css')
})
