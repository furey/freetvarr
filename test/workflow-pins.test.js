import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKFLOWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows')

test('workflows pin every action to a full commit SHA with its tag beside it', async () => {
  const names = (await fs.readdir(WORKFLOWS)).filter((name) => /\.ya?ml$/.test(name))
  assert.ok(names.length > 0)
  for (const name of names) {
    const text = await fs.readFile(path.join(WORKFLOWS, name), 'utf8')
    for (const line of text.split('\n').filter((entry) => /^\s*-?\s*uses:/.test(entry))) {
      assert.match(line, /uses:\s+[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `${name}: ${line.trim()}`)
    }
  }
})
