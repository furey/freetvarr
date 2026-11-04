import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const NOTED_FROM = 40

const updatingGuide = fs.readFileSync(new URL('../docs/guide/updating.md', import.meta.url), 'utf8')

const migrationNumbers = fs.readdirSync(new URL('../migrations/', import.meta.url))
  .map((name) => /^(\d{4})_/.exec(name)?.[1])
  .filter((number) => number && Number(number) >= NOTED_FROM)

test('updating guide: every migration from 0040 on has a version note naming it', () => {
  for (const number of migrationNumbers) {
    assert.ok(updatingGuide.includes(`\`${number}\``), `no version note names ${number}`)
  }
})
