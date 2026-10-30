import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_DAILY_TEXTS,
  cgroupHeadroomMbOf,
  cpuFlagsOf,
  dailyTextsOf,
  decideTier,
  embedModelIn,
  embedderOf,
  headroomMbOf,
  memAvailableMbOf,
  staticCapabilityOf,
  tierOverrideFrom,
} from '../src/for-you-capability.js'

const roomy = { headroomMb: 1800 }
const onnxOk = { ok: true }
const benchAt = (msPerText) => ({ ok: true, msPerText })

test('reads x86 and arm cpu flags', () => {
  assert.deepEqual(cpuFlagsOf('processor : 0\nflags\t\t: fpu sse sse2 avx avx2\n'), { avx: true, avx2: true, asimd: false })
  assert.deepEqual(cpuFlagsOf('Features\t: fp asimd evtstrm\n'), { avx: false, avx2: false, asimd: true })
  assert.deepEqual(cpuFlagsOf('flags : fpu sse sse2 sse4_2\n'), { avx: false, avx2: false, asimd: false })
  assert.deepEqual(cpuFlagsOf(''), { avx: false, avx2: false, asimd: false })
})

test('memory headroom uses MemAvailable, never MemFree', () => {
  const meminfo = 'MemTotal:        5914624 kB\nMemFree:          471040 kB\nMemAvailable:    1843200 kB\n'
  assert.equal(memAvailableMbOf(meminfo), 1800)
  assert.equal(memAvailableMbOf('MemFree: 471040 kB'), null)
})

test('cgroup headroom is the limit minus current use, and ignores unlimited', () => {
  assert.equal(cgroupHeadroomMbOf({ max: String(1024 * 1024 * 1024), current: String(512 * 1024 * 1024) }), 512)
  assert.equal(cgroupHeadroomMbOf({ max: 'max', current: '100' }), null)
  assert.equal(cgroupHeadroomMbOf({ max: '9223372036854771712', current: '100' }), null)
  assert.equal(headroomMbOf({ availableMb: 1800, cgroupMb: 512 }), 512)
  assert.equal(headroomMbOf({ availableMb: 1800, cgroupMb: null }), 1800)
  assert.equal(headroomMbOf({ availableMb: null, cgroupMb: null }), null)
})

test('static capability combines arch, cores, flags and memory', () => {
  const capability = staticCapabilityOf({
    arch: 'x64',
    cores: 2,
    cpuinfo: 'flags : sse4_2',
    meminfo: 'MemAvailable: 1843200 kB',
    cgroupMax: 'max',
    cgroupCurrent: '1',
  })
  assert.deepEqual(capability, { arch: 'x64', cores: 2, flags: { avx: false, avx2: false, asimd: false }, availableMb: 1800, cgroupMb: null, headroomMb: 1800 })
})

test('daily distinct texts come from the guide span, with a default', () => {
  const day = 24 * 60 * 60 * 1000
  assert.equal(dailyTextsOf({ distinctTexts: 3562, spanMs: 7 * day }), 509)
  assert.equal(dailyTextsOf({ distinctTexts: 300, spanMs: day / 2 }), 300)
  assert.equal(dailyTextsOf({ distinctTexts: 0, spanMs: day }), DEFAULT_DAILY_TEXTS)
})

test('basic when ONNX fails to load or crashes', () => {
  const decision = decideTier({ capability: roomy, onnx: { ok: false, error: 'SIGILL' }, bench: null })
  assert.equal(decision.tier, 'basic')
  assert.equal(decision.reason, 'This box cannot run the suggestion model')
  assert.match(decision.detail, /SIGILL/)
})

test('basic when memory headroom is under 400 MB', () => {
  assert.equal(decideTier({ capability: { headroomMb: 399 }, onnx: onnxOk, bench: benchAt(20) }).tier, 'basic')
  assert.equal(decideTier({ capability: { headroomMb: 400 }, onnx: onnxOk, bench: benchAt(20) }).tier, 'plus')
})

test('basic when the daily embedding time would pass five minutes', () => {
  assert.equal(decideTier({ capability: roomy, onnx: onnxOk, bench: benchAt(600), dailyTexts: 600 }).tier, 'basic')
  assert.equal(decideTier({ capability: roomy, onnx: onnxOk, bench: benchAt(500), dailyTexts: 600 }).tier, 'standard')
})

test('standard on a DS220+ class CPU, plus on a fast one', () => {
  assert.equal(decideTier({ capability: roomy, onnx: onnxOk, bench: benchAt(83), dailyTexts: 600 }).tier, 'standard')
  assert.equal(decideTier({ capability: roomy, onnx: onnxOk, bench: benchAt(20), dailyTexts: 600 }).tier, 'plus')
})

test('plus when Ollama lists an embedding model, even without ONNX', () => {
  const decision = decideTier({ capability: roomy, onnx: { ok: false }, ollama: { url: 'http://x', model: 'nomic-embed-text' } })
  assert.equal(decision.tier, 'plus')
})

test('overrides apply, but never force embeddings onto a host that cannot run them', () => {
  assert.equal(decideTier({ capability: roomy, onnx: onnxOk, bench: benchAt(20), override: 'basic' }).tier, 'basic')
  assert.equal(decideTier({ capability: roomy, onnx: onnxOk, bench: benchAt(400), override: 'plus' }).tier, 'plus')
  const ignored = decideTier({ capability: roomy, onnx: { ok: false }, override: 'standard' })
  assert.equal(ignored.tier, 'basic')
  assert.equal(ignored.overrideIgnored, 'standard')
  assert.equal(tierOverrideFrom('turbo'), 'auto')
  assert.equal(tierOverrideFrom('plus'), 'plus')
})

test('embedder follows the tier', () => {
  assert.equal(embedderOf({ tier: 'basic' }), null)
  assert.equal(embedderOf({ tier: 'standard' }).id, 'Xenova/all-MiniLM-L6-v2')
  assert.equal(embedderOf({ tier: 'plus' }).id, 'Xenova/bge-small-en-v1.5')
  assert.equal(embedderOf({ tier: 'plus', ollama: { url: 'http://x', model: 'nomic-embed-text' } }).id, 'ollama:nomic-embed-text')
})

test('finds an embedding model in the Ollama tag list', () => {
  const tags = [{ name: 'llama3:8b' }, { name: 'nomic-embed-text:latest' }]
  assert.equal(embedModelIn({ tags }), 'nomic-embed-text:latest')
  assert.equal(embedModelIn({ tags, wanted: 'nomic-embed-text' }), 'nomic-embed-text:latest')
  assert.equal(embedModelIn({ tags: [{ name: 'llama3:8b' }] }), null)
})
