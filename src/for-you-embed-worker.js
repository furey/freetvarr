import { performance } from 'node:perf_hooks'

const main = async () => {
  const job = JSON.parse(await readStdin())
  if (job.mode === 'check') return checkRuntime()
  const extractor = await loadExtractor(job)
  if (job.mode === 'bench') return bench({ extractor, texts: job.texts })
  return embedAll({ extractor, texts: job.texts, batchSize: job.batchSize || DEFAULT_BATCH })
}

const checkRuntime = async () => {
  const ort = await import('onnxruntime-node')
  emit({ type: 'check', ok: true, version: ort.env?.versions?.node || ort.env?.versions?.common || null })
}

const loadExtractor = async ({ model, dtype, cacheDir, threads }) => {
  const started = performance.now()
  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = cacheDir
  env.allowLocalModels = false
  const extractor = await pipeline('feature-extraction', model, {
    dtype,
    device: 'cpu',
    session_options: { intraOpNumThreads: threads || 1, interOpNumThreads: 1 },
  })
  emit({ type: 'ready', loadMs: Math.round(performance.now() - started) })
  return extractor
}

const bench = async ({ extractor, texts }) => {
  await embedBatch({ extractor, texts: texts.slice(0, 2) })
  const started = performance.now()
  await embedBatch({ extractor, texts })
  const ms = performance.now() - started
  emit({ type: 'bench', ok: true, texts: texts.length, msPerText: Math.round((ms / texts.length) * 10) / 10, peakRssMb: peakRssMb() })
}

const embedAll = async ({ extractor, texts, batchSize }) => {
  const started = performance.now()
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const vectors = await embedBatch({ extractor, texts: batch.map((item) => item.text) })
    emit({
      type: 'vectors',
      items: batch.map((item, index) => ({ hash: item.hash, vector: Buffer.from(vectors[index].buffer).toString('base64') })),
    })
  }
  emit({ type: 'done', count: texts.length, ms: Math.round(performance.now() - started), peakRssMb: peakRssMb() })
}

const embedBatch = async ({ extractor, texts }) => {
  const output = await extractor(texts, { pooling: 'mean', normalize: true })
  const dims = output.dims.at(-1)
  return texts.map((_, index) => Float32Array.from(output.data.subarray(index * dims, (index + 1) * dims)))
}

const readStdin = async () => {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const emit = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

const peakRssMb = () => Math.round(process.resourceUsage().maxRSS / 1024)

const DEFAULT_BATCH = 16

main().then(
  () => process.exit(0),
  (err) => {
    emit({ type: 'error', message: err?.message || String(err) })
    process.exit(1)
  },
)
