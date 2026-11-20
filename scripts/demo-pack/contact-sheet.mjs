import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

import { MANIFEST_FILE, cachePathOf, readJson, titlesByKey } from './pack-lib.mjs'

const OUT_DIR = path.resolve(process.argv[2] || 'scripts/.cache/demo-pack/contact')
const LABEL_HEIGHT = 40
const GAP = 8
const HEADING_HEIGHT = 56
const BACKGROUND = { r: 18, g: 18, b: 20 }
const SHAPES = {
  wide: { width: 400, height: 225, columns: 4 },
  tall: { width: 180, height: 270, columns: 8 },
  logo: { width: 180, height: 120, columns: 8 },
}

const main = async () => {
  const manifest = await readJson(MANIFEST_FILE)
  const byKey = titlesByKey(manifest)
  const version = manifest.version
  const sections = [
    { name: 'hero', heading: 'Home hero backdrops (in order)', shape: 'wide', items: manifest.tours.hero.map((key) => byKey.get(key)).map((t) => tileOf(t, 'backdrop')) },
    { name: 'backdrops', heading: 'Backdrops', shape: 'wide', items: manifest.titles.filter((t) => t.kind !== 'sport').map((t) => tileOf(t, 'backdrop')) },
    { name: 'posters', heading: 'Posters', shape: 'tall', items: manifest.titles.filter((t) => t.images.poster).map((t) => tileOf(t, 'poster')) },
    { name: 'sport', heading: 'Sport photos (CC0, Wikimedia Commons)', shape: 'wide', items: manifest.titles.filter((t) => t.kind === 'sport').map((t) => tileOf(t, 'backdrop')) },
    { name: 'stills', heading: 'Episode stills (library shows)', shape: 'wide', items: manifest.titles.flatMap((t) => (t.episodes ?? []).filter((e) => e.still).map((e) => ({ label: `${t.title} ${e.code.toUpperCase()}`, sub: e.name, image: e.still }))) },
    { name: 'logos', heading: 'Channel logos', shape: 'logo', items: manifest.channels.map((c) => ({ label: c.name, sub: `logo, ${c.logoImage.width}x${c.logoImage.height}`, image: c.logoImage, contain: true })) },
  ]
  await fs.mkdir(OUT_DIR, { recursive: true })
  const rendered = []
  for (const section of sections) {
    const sheet = await renderSection({ section, version })
    await fs.writeFile(path.join(OUT_DIR, `contact-${section.name}.png`), sheet.buffer)
    rendered.push(sheet)
    console.log(`[contact] ${section.name}: ${section.items.length} images`)
  }
  const width = Math.max(...rendered.map((s) => s.width))
  const height = rendered.reduce((sum, s) => sum + s.height, 0)
  let top = 0
  const layers = rendered.map((s) => {
    const layer = { input: s.buffer, top, left: 0 }
    top += s.height
    return layer
  })
  await sharp({ create: { width, height, channels: 3, background: BACKGROUND } }).composite(layers).png().toFile(path.join(OUT_DIR, 'contact-sheet.png'))
  console.log(`[contact] wrote ${path.join(OUT_DIR, 'contact-sheet.png')}`)
}

const tileOf = (title, surface) => {
  const image = title.images[surface]
  const flags = [image.source, `${image.width}x${image.height}`, surface === 'backdrop' && image.textless === false ? 'HAS TEXT' : null].filter(Boolean)
  return { label: title.title, sub: `${surface}, ${flags.join(', ')}`, image }
}

const renderSection = async ({ section, version }) => {
  const shape = SHAPES[section.shape]
  const tileWidth = shape.width + GAP
  const tileHeight = shape.height + LABEL_HEIGHT + GAP
  const columns = Math.min(shape.columns, Math.max(1, section.items.length))
  const rows = Math.ceil(section.items.length / columns)
  const width = Math.max(columns * tileWidth + GAP, 900)
  const height = HEADING_HEIGHT + rows * tileHeight + GAP
  const layers = [{ input: textSvg({ width, height: HEADING_HEIGHT, lines: [section.heading], size: 26, weight: 700 }), top: 0, left: 0 }]
  for (const [index, item] of section.items.entries()) {
    const left = GAP + (index % columns) * tileWidth
    const top = HEADING_HEIGHT + Math.floor(index / columns) * tileHeight
    const picture = await sharp(cachePathOf({ version, file: item.image.file }))
      .resize(shape.width, shape.height, item.contain ? { fit: 'contain', background: { r: 60, g: 60, b: 64 } } : { fit: 'cover' })
      .toBuffer()
    layers.push({ input: picture, top, left })
    layers.push({ input: textSvg({ width: shape.width, height: LABEL_HEIGHT, lines: [item.label, item.sub], size: 13 }), top: top + shape.height, left })
  }
  const buffer = await sharp({ create: { width, height, channels: 3, background: BACKGROUND } }).composite(layers).png().toBuffer()
  return { buffer, width, height }
}

const textSvg = ({ width, height, lines, size, weight = 400 }) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${lines
  .map((line, i) => `<text x="${size >= 20 ? 12 : 2}" y="${(i + 1) * (size + 4) + (size >= 20 ? 12 : 0)}" font-family="Helvetica, Arial, sans-serif" font-size="${i === 0 ? size : size - 2}" font-weight="${i === 0 ? weight : 400}" fill="${i === 0 ? '#f2f2f2' : '#a8a8b0'}">${escapeXml(clip(line, Math.floor(width / (size * 0.52))))}</text>`)
  .join('')}</svg>`)

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

await main()
