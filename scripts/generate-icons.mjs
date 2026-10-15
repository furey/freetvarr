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
const ANY_SCALE = 1.25

const main = async () => {
  await writeSvg('favicon.svg', faviconSvg(), [WEB, DOCS_PUBLIC])
  await writePng({ name: 'icon-192.png', svg: iconSvg({ scale: ANY_SCALE }), size: 192 })
  await writePng({ name: 'icon-512.png', svg: iconSvg({ scale: ANY_SCALE }), size: 512 })
  await writePng({ name: 'icon-maskable-512.png', svg: iconSvg({ scale: 1 }), size: 512 })
  await writePng({ name: 'icon-monochrome-512.png', svg: monochromeSvg(), size: 512, transparent: true })
  await writePng({ name: 'apple-touch-icon.png', svg: iconSvg({ scale: ANY_SCALE }), size: 180 })
  await writeFile(path.join(WEB, 'favicon.ico'), await icoFrom([16, 32]))
}

const iconSvg = ({ scale }) => svgDocument({
  size: 512,
  background: BACKGROUND,
  body: scaledAroundCentre({ scale, body: monogram({ ink: INK, chips: CHIP_COLOURS }) })
})

const monochromeSvg = () => svgDocument({
  size: 512,
  body: monogram({ ink: INK, chips: CHIP_COLOURS.map(() => INK) })
})

const faviconSvg = () => svgDocument({
  size: 32,
  background: BACKGROUND,
  body: [
    rect({ x: 8, y: 2, width: 6, height: 18, fill: INK }),
    rect({ x: 8, y: 2, width: 16, height: 6, fill: INK }),
    rect({ x: 8, y: 12, width: 12, height: 4, fill: INK }),
    ...CHIP_COLOURS.map((fill, index) => rect({ x: 2 + index * 10, y: 24, width: 8, height: 6, fill }))
  ].join('')
})

const monogram = ({ ink, chips }) => [
  `<path d="M166 116H352V168H222V200H316V248H222V326H166Z" fill="${ink}"/>`,
  ...chips.map((fill, index) => rect({ x: 116 + index * 98, y: 352, width: 84, height: 44, fill }))
].join('')

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

const scaledAroundCentre = ({ scale, body }) => scale === 1
  ? body
  : `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${body}</g>`

const rect = ({ x, y, width, height, fill }) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`

await main()
