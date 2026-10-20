import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import axios from 'axios'

import { db, getSetting, setSetting } from './db.js'
import {
  MODELS,
  dailyTextsOf,
  decideTier,
  embedModelIn,
  embedderOf,
  probeKeyOf,
  staticCapabilityOf,
  tierOverrideFrom,
} from './for-you-capability.js'
import { distinctTextsOf, vectorFromBuffer, vectorToBuffer } from './for-you-texts.js'

export const SETTINGS = {
  enabled: 'for_you_enabled',
  tierOverride: 'for_you_tier_override',
  ollamaUrl: 'for_you_ollama_url',
  ollamaModel: 'for_you_ollama_model',
  probe: 'for_you_probe',
  embedRun: 'for_you_embed_last',
  upkeep: 'for_you_upkeep_last',
}

export const fetchOllamaTags = (url) => axios.get(`${url}/api/tags`, {
  timeout: OLLAMA_TIMEOUT_MS,
  maxContentLength: OLLAMA_TAGS_MAX_BYTES,
  validateStatus: () => true,
})

export const forYouEnabledFrom = (stored) => stored !== 'false'

export const modelCacheDir = () => path.join(path.dirname(process.env.DB_PATH || path.join(REPO_ROOT, 'config', 'state.db')), 'models')

export const readProbe = async () => parseJson(await getSetting(SETTINGS.probe))

export const readEmbedRun = async () => parseJson(await getSetting(SETTINGS.embedRun))

export const currentTier = async () => {
  const probe = await readProbe()
  const override = tierOverrideFrom(await getSetting(SETTINGS.tierOverride))
  if (!probe) return { tier: 'basic', reason: 'Not checked yet', source: 'pending', override }
  return { ...decideTier({ ...probe.inputs, override }), override }
}

export const currentEmbedder = async () => {
  const { tier } = await currentTier()
  const probe = await readProbe()
  return embedderOf({ tier, ollama: probe?.inputs?.ollama || null })
}

export const runProbe = async ({ version, nowMs = Date.now() } = {}) => {
  probing ??= probeNow({ version, nowMs }).finally(() => { probing = null })
  return probing
}

export const probeIfStale = async ({ version }) => {
  const probe = await readProbe()
  if (probe?.key === probeKeyOf({ version, host: os.hostname(), arch: os.arch() })) return { probe, fresh: false }
  return { probe: await runProbe({ version }), fresh: true }
}

export const runEmbeddings = async ({ nowMs = Date.now() } = {}) => {
  embedding ??= embedNow({ nowMs }).finally(() => { embedding = null })
  return embedding
}

export const isEmbedding = () => Boolean(embedding)

export const loadVectors = async (modelId) => {
  if (!modelId) return null
  const version = vectorVersion
  if (vectorCache?.modelId === modelId && vectorCache.version === version) return vectorCache.vectors
  const rows = await db('text_embeddings').where({ model_id: modelId }).select('text_hash', 'vector').catch(() => [])
  const vectors = new Map(rows.map((row) => [row.text_hash, vectorFromBuffer(row.vector)]))
  vectorCache = { modelId, version, vectors }
  return vectors
}

export const vectorsVersion = () => vectorVersion

const probeNow = async ({ version, nowMs }) => {
  const capability = await readStaticCapability()
  const onnx = await checkOnnx()
  const benchTexts = await benchTextsOf()
  const bench = onnx.ok && benchTexts.length ? await benchModel({ texts: benchTexts, capability }) : { ok: false, error: onnx.ok ? 'no guide text to test with' : 'skipped' }
  const dailyTexts = await measureDailyTexts(nowMs)
  const ollama = await checkOllama()
  const inputs = { capability, onnx, bench, dailyTexts, ollama }
  const decision = decideTier({ ...inputs, override: 'auto' })
  const probe = {
    key: probeKeyOf({ version, host: os.hostname(), arch: os.arch() }),
    version,
    host: os.hostname(),
    at: nowMs,
    inputs,
    auto: decision,
  }
  await setSetting(SETTINGS.probe, JSON.stringify(probe))
  console.log(`[for-you] probe: ${decision.tier} (${decision.reason})`)
  return probe
}

const readStaticCapability = async () => {
  const [cpuinfo, meminfo, cgroupMax, cgroupCurrent] = await Promise.all([
    readText('/proc/cpuinfo'),
    readText('/proc/meminfo'),
    readText('/sys/fs/cgroup/memory.max').then((text) => text || readText('/sys/fs/cgroup/memory/memory.limit_in_bytes')),
    readText('/sys/fs/cgroup/memory.current').then((text) => text || readText('/sys/fs/cgroup/memory/memory.usage_in_bytes')),
  ])
  const constrained = typeof process.constrainedMemory === 'function' ? process.constrainedMemory() : 0
  const capability = staticCapabilityOf({
    arch: os.arch(),
    cores: os.availableParallelism(),
    cpuinfo,
    meminfo: meminfo || `MemAvailable: ${Math.round(os.freemem() / 1024)} kB`,
    cgroupMax: cgroupMax || (constrained > 0 ? String(constrained) : ''),
    cgroupCurrent: cgroupCurrent || String(process.memoryUsage().rss),
  })
  return { ...capability, totalMb: Math.round(os.totalmem() / MB), platform: os.platform() }
}

const checkOnnx = async () => {
  const result = await runWorker({ job: { mode: 'check' }, timeoutMs: CHECK_TIMEOUT_MS })
  const check = result.messages.find((message) => message.type === 'check')
  if (check?.ok) return { ok: true, version: check.version }
  return { ok: false, error: failureOf(result) }
}

const benchModel = async ({ texts, capability }) => {
  const model = MODELS.standard
  const result = await runWorker({
    job: { mode: 'bench', model: model.id, dtype: model.dtype, cacheDir: modelCacheDir(), threads: threadsFor(capability), texts },
    timeoutMs: BENCH_TIMEOUT_MS,
  })
  const ready = result.messages.find((message) => message.type === 'ready')
  const bench = result.messages.find((message) => message.type === 'bench')
  if (!bench?.ok) return { ok: false, error: failureOf(result), model: model.id }
  return { ok: true, model: model.id, loadMs: ready?.loadMs ?? null, msPerText: bench.msPerText, texts: bench.texts, peakRssMb: bench.peakRssMb }
}

const checkOllama = async () => {
  const url = String((await getSetting(SETTINGS.ollamaUrl)) || '').trim().replace(/\/$/, '')
  if (!url) return null
  try {
    const res = await fetchOllamaTags(url)
    if (res.status !== 200) return { url, model: null, error: `HTTP ${res.status}` }
    const model = embedModelIn({ tags: res.data?.models || [], wanted: (await getSetting(SETTINGS.ollamaModel)) || null })
    return { url, model, error: model ? null : 'no embedding model listed' }
  } catch (err) {
    return { url, model: null, error: err.message }
  }
}

const embedNow = async ({ nowMs }) => {
  const embedder = await currentEmbedder()
  if (!embedder) return { skipped: true, reason: 'basic tier' }
  const texts = await textsToEmbed({ modelId: embedder.id, nowMs })
  const started = Date.now()
  const stats = texts.length
    ? (embedder.kind === 'ollama' ? await embedWithOllama({ embedder, texts }) : await embedWithWorker({ embedder, texts }))
    : { count: 0, ok: true }
  const run = { at: nowMs, model: embedder.id, wanted: texts.length, ...stats, wallMs: Date.now() - started }
  await setSetting(SETTINGS.embedRun, JSON.stringify(run))
  await pruneVectors({ modelId: embedder.id, nowMs })
  vectorVersion += 1
  console.log(`[for-you] embedded ${run.count ?? 0} of ${texts.length} text(s) with ${embedder.id} in ${Math.round(run.wallMs / 1000)} s`)
  return run
}

const textsToEmbed = async ({ modelId, nowMs }) => {
  const [guideRows, recordings] = await Promise.all([
    db('guide_programs').where('end', '>', nowMs - DAY_MS).select('program_json'),
    db('recordings').select('title', 'synopsis'),
  ])
  const items = [...recordings, ...guideRows.map((row) => parseJson(row.program_json)).filter(Boolean)]
  const distinct = distinctTextsOf(items)
  const known = new Set()
  for (let i = 0; i < distinct.length; i += SQL_CHUNK) {
    const hashes = distinct.slice(i, i + SQL_CHUNK).map((item) => item.hash)
    const rows = await db('text_embeddings').where({ model_id: modelId }).whereIn('text_hash', hashes).select('text_hash')
    for (const row of rows) known.add(row.text_hash)
  }
  return distinct.filter((item) => !known.has(item.hash))
}

const embedWithWorker = async ({ embedder, texts }) => {
  let saved = 0
  let writes = Promise.resolve()
  const capability = (await readProbe())?.inputs?.capability || {}
  const result = await runWorker({
    job: { mode: 'embed', model: embedder.id, dtype: embedder.dtype, cacheDir: modelCacheDir(), threads: threadsFor(capability), texts },
    timeoutMs: EMBED_TIMEOUT_MS,
    onMessage: (message) => {
      if (message.type !== 'vectors') return
      const rows = message.items.map((item) => ({
        text_hash: item.hash,
        model_id: embedder.id,
        dims: embedder.dims,
        vector: Buffer.from(item.vector, 'base64'),
        created_at: Date.now(),
      }))
      writes = writes.then(() => db('text_embeddings').insert(rows).onConflict(['text_hash', 'model_id']).merge()).then(() => { saved += rows.length })
    },
  })
  await writes.catch(() => {})
  const done = result.messages.find((message) => message.type === 'done')
  return {
    ok: Boolean(done),
    count: saved,
    ms: done?.ms ?? null,
    msPerText: done?.count ? Math.round((done.ms / done.count) * 10) / 10 : null,
    peakRssMb: done?.peakRssMb ?? null,
    error: done ? null : failureOf(result),
  }
}

const embedWithOllama = async ({ embedder, texts }) => {
  let saved = 0
  const started = Date.now()
  for (let i = 0; i < texts.length; i += OLLAMA_BATCH) {
    const batch = texts.slice(i, i + OLLAMA_BATCH)
    const res = await axios.post(`${embedder.url}/api/embed`, { model: embedder.model, input: batch.map((item) => item.text) }, {
      timeout: OLLAMA_EMBED_TIMEOUT_MS,
      maxContentLength: OLLAMA_EMBED_MAX_BYTES,
    })
    const vectors = res.data?.embeddings || []
    const rows = batch.map((item, index) => vectors[index] && ({
      text_hash: item.hash,
      model_id: embedder.id,
      dims: vectors[index].length,
      vector: vectorToBuffer(normalised(vectors[index])),
      created_at: Date.now(),
    })).filter(Boolean)
    if (rows.length) await db('text_embeddings').insert(rows).onConflict(['text_hash', 'model_id']).merge()
    saved += rows.length
  }
  const ms = Date.now() - started
  return { ok: true, count: saved, ms, msPerText: saved ? Math.round((ms / saved) * 10) / 10 : null }
}

const pruneVectors = async ({ modelId, nowMs }) => {
  await db('text_embeddings').whereNot({ model_id: modelId }).delete().catch(() => {})
  await db('text_embeddings').where('created_at', '<', nowMs - VECTOR_TTL_MS).delete().catch(() => {})
}

const benchTextsOf = async () => {
  const rows = await db('guide_programs').where('end', '>', Date.now()).orderBy('start').limit(600).select('program_json').catch(() => [])
  const texts = distinctTextsOf(rows.map((row) => parseJson(row.program_json)).filter(Boolean))
    .map((item) => item.text)
    .filter((text) => text.length > 60)
  return texts.slice(0, BENCH_TEXTS)
}

const measureDailyTexts = async (nowMs) => {
  const rows = await db('guide_programs').where('start', '>', nowMs).select('program_json', 'start').catch(() => [])
  if (!rows.length) return dailyTextsOf({ distinctTexts: 0, spanMs: 0 })
  const spanMs = Math.max(...rows.map((row) => Number(row.start))) - nowMs
  const distinctTexts = distinctTextsOf(rows.map((row) => parseJson(row.program_json)).filter(Boolean)).length
  return dailyTextsOf({ distinctTexts, spanMs })
}

const runWorker = ({ job, timeoutMs, onMessage = () => {} }) => new Promise((resolve) => {
  const messages = []
  let stdout = ''
  let stderr = ''
  let child
  try {
    child = spawn(process.execPath, [WORKER_PATH], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, OMP_NUM_THREADS: String(job.threads || 1) } })
  } catch (err) {
    resolve({ code: null, signal: null, error: err.message, messages, stderr })
    return
  }
  try {
    os.setPriority(child.pid, LOW_PRIORITY)
  } catch {}
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
  child.stdout.on('data', (chunk) => {
    stdout += chunk
    let newline = stdout.indexOf('\n')
    while (newline >= 0) {
      const line = stdout.slice(0, newline)
      stdout = stdout.slice(newline + 1)
      const message = parseJson(line)
      if (message) {
        if (message.type !== 'vectors') messages.push(message)
        onMessage(message)
      }
      newline = stdout.indexOf('\n')
    }
  })
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-STDERR_TAIL) })
  child.stdin.on('error', () => {})
  child.on('error', (err) => {
    clearTimeout(timer)
    resolve({ code: null, signal: null, error: err.message, messages, stderr })
  })
  child.on('close', (code, signal) => {
    clearTimeout(timer)
    resolve({ code, signal, messages, stderr })
  })
  child.stdin.end(JSON.stringify(job))
})

const failureOf = (result) => {
  const error = result.messages.find((message) => message.type === 'error')
  if (error) return error.message.split('\n')[0].slice(0, 300)
  if (result.signal) return `the test process stopped with ${result.signal}`
  if (result.error) return result.error
  return `the test process exited with code ${result.code}${result.stderr ? `: ${result.stderr.trim().split('\n').at(-1)}` : ''}`
}

const threadsFor = (capability) => Math.max(1, Math.min(MAX_THREADS, (capability?.cores || 1) - 1))

const normalised = (vector) => {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map((value) => value / norm)
}

const readText = (file) => fs.readFile(file, 'utf8').catch(() => '')

const parseJson = (text) => {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

let probing = null
let embedding = null
let vectorCache = null
let vectorVersion = 0

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'for-you-embed-worker.js')
const MB = 1024 * 1024
const DAY_MS = 24 * 60 * 60 * 1000
const VECTOR_TTL_MS = 60 * DAY_MS
const LOW_PRIORITY = 19
const MAX_THREADS = 4
const BENCH_TEXTS = 20
const SQL_CHUNK = 400
const STDERR_TAIL = 2000
const CHECK_TIMEOUT_MS = 30 * 1000
const BENCH_TIMEOUT_MS = 5 * 60 * 1000
const EMBED_TIMEOUT_MS = 90 * 60 * 1000
const OLLAMA_TIMEOUT_MS = 3000
const OLLAMA_EMBED_TIMEOUT_MS = 60 * 1000
const OLLAMA_BATCH = 32
const OLLAMA_TAGS_MAX_BYTES = 1024 * 1024
const OLLAMA_EMBED_MAX_BYTES = 32 * 1024 * 1024
