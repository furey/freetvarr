import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const SERVER_URL = (process.env.FREETVARR_URL || 'http://127.0.0.1:3801').replace(/\/$/, '')
const OUT = process.argv[2]
const GUIDE_DAYS = [0, 1, 2]
const PROBE_WIDTH = 192
const PARALLEL = 8
const LOGO_MAX_ENTROPY = 4.2
const LOGO_MIN_COLOURS = 100
const LOGO_MAX_ALPHA_ENTROPY = 6

const run = async () => {
  if (!OUT) throw new Error('usage: node capture-placeholders.mjs <out-file>')
  const programmes = await pictureProgrammes()
  const probes = await inBatches(programmes, probeOf)
  const placeholders = placeholdersOf(probes.filter(Boolean))
  const swappable = await showPicturesOf([...new Set(placeholders.map(({ title }) => title))])
  await writeFile(OUT, placeholders.map(({ id, title }) => `${id}\t${title}\t${swappable.has(title) ? 'show' : 'none'}`).join('\n'))
  console.log(`[placeholders] ${placeholders.length} of ${programmes.length} guide pictures are channel logos`)
}

const pictureProgrammes = async () => {
  const seen = new Map()
  for (const day of GUIDE_DAYS) {
    const guide = await (await fetch(`${SERVER_URL}/api/epg/guide?day=${day}`)).json()
    for (const programme of Object.values(guide.programs || {}).flat()) {
      if (programme?.has_image) seen.set(String(programme.program_id), programme.title)
    }
  }
  return [...seen].map(([id, title]) => ({ id, title }))
}

const showPicturesOf = async (titles) => {
  const probes = await inBatches(titles, (title) => probeOf({ title, path: `/api/epg/show-image?title=${encodeURIComponent(title)}&w=${PROBE_WIDTH}` }))
  return new Set(probes.filter((probe) => probe && !looksLikeLogo(probe)).map(({ title }) => title))
}

const probeOf = async ({ id, title, path = `/api/epg/image/${encodeURIComponent(id)}?w=${PROBE_WIDTH}` }) => {
  const reply = await fetch(`${SERVER_URL}${path}`)
  if (!reply.ok) return null
  const body = Buffer.from(await reply.arrayBuffer())
  const { entropy } = await sharp(body).stats()
  const { hasAlpha } = await sharp(body).metadata()
  return { id, title, entropy, hasAlpha, colours: await coloursOf(body), hash: createHash('sha1').update(body).digest('hex') }
}

const coloursOf = async (body) => {
  const pixels = await sharp(body).resize(48, 27, { fit: 'fill' }).removeAlpha().raw().toBuffer()
  const colours = new Set()
  for (let i = 0; i < pixels.length; i += 3) colours.add(`${pixels[i] >> 4},${pixels[i + 1] >> 4},${pixels[i + 2] >> 4}`)
  return colours.size
}

const placeholdersOf = (probes) => {
  const titlesByHash = new Map()
  for (const { hash, title } of probes) titlesByHash.set(hash, (titlesByHash.get(hash) ?? new Set()).add(title))
  const isShared = ({ hash }) => titlesByHash.get(hash).size > 1
  return probes.filter((probe) => isShared(probe) || looksLikeLogo(probe))
}

const looksLikeLogo = ({ entropy, colours, hasAlpha }) => (hasAlpha && entropy < LOGO_MAX_ALPHA_ENTROPY) || (entropy < LOGO_MAX_ENTROPY && colours >= LOGO_MIN_COLOURS)

const inBatches = async (items, work) => {
  const results = []
  for (let i = 0; i < items.length; i += PARALLEL) results.push(...await Promise.all(items.slice(i, i + PARALLEL).map(work)))
  return results
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
