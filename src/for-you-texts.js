import crypto from 'node:crypto'

export const MAX_TEXT_LENGTH = 600

export const embedTextOf = ({ title, synopsis }) => {
  const name = cleanOf(title)
  const about = cleanOf(synopsis)
  if (!name) return ''
  return (about ? `${name}. ${about}` : name).slice(0, MAX_TEXT_LENGTH)
}

export const textHashOf = (text) => crypto.createHash('sha1').update(text).digest('hex')

export const distinctTextsOf = (items = []) => {
  const byHash = new Map()
  for (const item of items) {
    const text = embedTextOf(item)
    if (!text) continue
    const hash = textHashOf(text)
    if (!byHash.has(hash)) byHash.set(hash, { hash, text })
  }
  return [...byHash.values()]
}

export const vectorToBuffer = (vector) => Buffer.from(Float32Array.from(vector).buffer)

export const vectorFromBuffer = (buffer) => {
  const bytes = Buffer.from(buffer)
  const copy = new ArrayBuffer(bytes.length)
  new Uint8Array(copy).set(bytes)
  return new Float32Array(copy)
}

const cleanOf = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
