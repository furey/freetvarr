import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRowScrollMemory } from '../src/web/row-scroll-memory.js'

test('createRowScrollMemory: keeps each row on its own and starts unknown rows at the left', () => {
  const memory = createRowScrollMemory()
  memory.remember({ key: 'movies', left: 812.6 })
  memory.remember({ key: 'shows', left: -4 })
  assert.equal(memory.recall('movies'), 813)
  assert.equal(memory.recall('shows'), 0)
  assert.equal(memory.recall('oneoffs'), 0)
  memory.forget()
  assert.equal(memory.recall('movies'), 0)
})
