import sharp from 'sharp'

import { facesFromScores } from './image-focus.js'

const main = async () => {
  const job = JSON.parse(await readStdin())
  sharp.concurrency(1)
  const session = await openSession(job.modelPath)
  for (const image of job.images) {
    const body = Buffer.from(image.body, 'base64')
    emit({ type: 'focus', id: image.id, ...await focusInputsOf({ session, body }) })
  }
}

const openSession = async (modelPath) => {
  try {
    const ort = await import('onnxruntime-node')
    const session = await ort.InferenceSession.create(modelPath, {
      intraOpNumThreads: 1,
      interOpNumThreads: 1,
      logSeverityLevel: QUIET_LOG_LEVEL,
    })
    return { ort, session }
  } catch {
    return null
  }
}

const focusInputsOf = async ({ session, body }) => {
  try {
    const faces = session ? await detectFaces({ ...session, body }) : []
    if (faces.length) return { faces, attention: null }
    return { faces: [], attention: await attentionOf(body) }
  } catch {
    return { faces: [], attention: null }
  }
}

const detectFaces = async ({ ort, session, body }) => {
  const { data } = await sharp(body)
    .resize({ width: INPUT_WIDTH, height: INPUT_HEIGHT, fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const input = new ort.Tensor('float32', planarOf(data), [1, 3, INPUT_HEIGHT, INPUT_WIDTH])
  const output = await session.run({ [session.inputNames[0]]: input })
  return facesFromScores({ scores: output.scores.data, boxes: output.boxes.data })
    .map((face) => ({ score: Math.round(face.score * 100) / 100, box: face.box }))
}

const planarOf = (data) => {
  const plane = INPUT_WIDTH * INPUT_HEIGHT
  const planar = new Float32Array(3 * plane)
  for (let pixel = 0; pixel < plane; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      planar[channel * plane + pixel] = (data[pixel * 3 + channel] - PIXEL_MEAN) / PIXEL_SCALE
    }
  }
  return planar
}

const attentionOf = async (body) => {
  const { width, height } = await sharp(body).metadata()
  if (!width || !height) return null
  const { info } = await sharp(body)
    .resize({ width: Math.max(1, Math.round(width / 2)), height, fit: 'cover', position: sharp.strategy.attention })
    .toBuffer({ resolveWithObject: true })
  if (!Number.isFinite(info.attentionX) || !Number.isFinite(info.attentionY)) return null
  return { x: info.attentionX / width, y: info.attentionY / height }
}

const readStdin = async () => {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const emit = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

const INPUT_WIDTH = 320
const INPUT_HEIGHT = 240
const PIXEL_MEAN = 127
const PIXEL_SCALE = 128
const QUIET_LOG_LEVEL = 3

main().then(
  () => process.exit(0),
  () => process.exit(1),
)
