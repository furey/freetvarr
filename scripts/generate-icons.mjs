import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WEB = path.join(ROOT, 'src', 'web')
const DOCS_PUBLIC = path.join(ROOT, 'docs', 'public')

const BACKGROUND = '#28231b'
const INK = '#fffcfb'
const CHIP_COLOURS = ['#1eb6ff', '#ff8a00', '#e2b03c']
const SAFE_ZONE_RADIUS = 204.8
const CHIP_ROW = { chipWidth: 4, chipHeight: 3, gap: 1.75 }

const main = async () => {
  await writeSvg('favicon.svg', faviconSvg(), [WEB, DOCS_PUBLIC])
  await writePng({ name: 'icon-192.png', svg: iconSvg(), size: 192 })
  await writePng({ name: 'icon-512.png', svg: iconSvg(), size: 512 })
  await writePng({ name: 'icon-maskable-512.png', svg: iconSvg(), size: 512 })
  await writePng({ name: 'icon-monochrome-512.png', svg: monochromeSvg(), size: 512, transparent: true })
  await writePng({ name: 'apple-touch-icon.png', svg: iconSvg(), size: 180 })
  await writeFile(path.join(WEB, 'favicon.ico'), await icoFrom([16, 32]))
}

const iconSvg = () => svgDocument({
  size: 512,
  background: BACKGROUND,
  body: chipRowInSafeZone(CHIP_COLOURS)
})

const monochromeSvg = () => svgDocument({
  size: 512,
  body: chipRowInSafeZone(CHIP_COLOURS.map(() => INK))
})

const faviconSvg = () => svgDocument({
  size: 32,
  background: BACKGROUND,
  body: CHIP_COLOURS
    .map((fill, index) => rect({ x: 2 + index * 10, y: 14, width: 8, height: 4, fill }))
    .join('')
})

const chipRowInSafeZone = (fills) => {
  const { chipWidth, chipHeight, gap } = CHIP_ROW
  const rowWidth = 3 * chipWidth + 2 * gap
  const unit = SAFE_ZONE_RADIUS / Math.hypot(rowWidth / 2, chipHeight / 2)
  const left = 256 - (rowWidth * unit) / 2
  const top = 256 - (chipHeight * unit) / 2
  return fills.map((fill, index) => rect({
    x: round(left + index * (chipWidth + gap) * unit),
    y: round(top),
    width: round(chipWidth * unit),
    height: round(chipHeight * unit),
    fill
  })).join('')
}

const writeSvg = async (name, svg, directories) => {
  for (const directory of directories) await writeFile(path.join(directory, name), svg)
}

const writePng = async ({ name, svg, size, transparent = false }) => {
  const image = sharp(Buffer.from(svg)).resize(size, size)
  const pixels = transparent ? image : image.flatten({ background: BACKGROUND }).removeAlpha()
  await pixels.png().toFile(path.join(WEB, name))
}

const icoFrom = async (sizes) => {
  const images = await Promise.all(sizes.map((size) =>
    sharp(Buffer.from(faviconSvg())).resize(size, size).png().toBuffer()))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length + images.length * 16
  const entries = images.map((image, index) => {
    const entry = icoDirectoryEntry({ size: sizes[index], byteLength: image.length, offset })
    offset += image.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images])
}

const icoDirectoryEntry = ({ size, byteLength, offset }) => {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size % 256, 0)
  entry.writeUInt8(size % 256, 1)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(byteLength, 8)
  entry.writeUInt32LE(offset, 12)
  return entry
}

const svgDocument = ({ size, background, body }) => [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`,
  ...(background ? [`  <rect width="${size}" height="${size}" fill="${background}"/>`] : []),
  `  ${body}`,
  '</svg>',
  ''
].join('\n')

const round = (value) => Math.round(value * 100) / 100

const rect = ({ x, y, width, height, fill }) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`

await main()
