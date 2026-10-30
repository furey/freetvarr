import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const THEME = join(ROOT, 'docs', '.vitepress', 'theme')

export const palettes = {
  dark: {
    p: '#0b1117', k1: '#1c2630', k2: '#26323e', k3: '#3a4856',
    ink: '#8d9aa7', hi: '#f2f5f7', b: '#3ba4ff', o: '#f28c28', y: '#f5c542'
  },
  light: {
    p: '#ffffff', k1: '#e6ebf0', k2: '#d9e0e7', k3: '#b4c0cb',
    ink: '#5b6773', hi: '#0b1117', b: '#1a87e6', o: '#d9730f', y: '#e0b000'
  }
}

const main = async () => {
  await writeFile(join(THEME, 'illustrations.js'), illustrationsModule())
  await writeFile(join(THEME, 'illustrations.css'), illustrationsCss())
  console.log(`wrote ${illustrations.length} illustrations to ${relative(ROOT, THEME)}`)
}

export const themedSvg = ({ id, label, build }) => svgDocument({
  body: scopeIds({ id, svg: styleVarAttributes(build(themedTokens)) }),
  className: ' class="ftv-ill"',
  label
})

export const flatSvg = ({ illustration: { label, build }, theme }) => svgDocument({
  body: build(palettes[theme]),
  style: '<style>text{font-family:Figtree,ui-sans-serif,system-ui,sans-serif;font-weight:700}</style>',
  label
})

const illustrationsModule = () => {
  const entries = illustrations.map((illustration) => [
    illustration.id,
    { label: illustration.label, svg: themedSvg(illustration) }
  ])
  return `export const illustrations = ${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`
}

const illustrationsCss = () => [
  `.ftv-ill {\n  ${tokenBlock(palettes.dark)}\n}`,
  `html:not(.dark) .ftv-ill {\n  ${tokenBlock(palettes.light)}\n}`,
  '.ftv-ill text {\n  font-family: var(--vp-font-family-base);\n  font-weight: 700;\n}'
].join('\n\n') + '\n'

const tokenNames = Object.keys(palettes.dark)

const themedTokens = Object.fromEntries(tokenNames.map((name) => [name, `var(--ill-${name})`]))

const tokenBlock = (palette) => tokenNames.map((name) => `--ill-${name}: ${palette[name]};`).join('\n  ')

const live = (c) => [
  panel(c),
  '<clipPath id="screen"><rect x="48" y="30" width="150" height="86" rx="4"/></clipPath>',
  rect({ x: 40, y: 22, w: 166, h: 102, r: 8, fill: c.k2 }),
  `<g clip-path="url(#screen)">${landscape({ c, x: 48, y: 30, w: 150, h: 86 })}</g>`,
  rect({ x: 58, y: 104, w: 130, h: 4, r: 2, fill: c.p, op: 0.45 }),
  rect({ x: 58, y: 104, w: 92, h: 4, r: 2, fill: c.hi }),
  rect({ x: 112, y: 124, w: 22, h: 12, fill: c.k2 }),
  rect({ x: 94, y: 136, w: 58, h: 6, r: 3, fill: c.k2 }),
  rect({ x: 190, y: 46, w: 62, h: 104, r: 12, fill: c.p }),
  rect({ x: 194, y: 50, w: 54, h: 96, r: 10, fill: c.k2 }),
  '<clipPath id="phone"><rect x="199" y="56" width="44" height="40" rx="4"/></clipPath>',
  `<g clip-path="url(#phone)">${landscape({ c, x: 199, y: 56, w: 44, h: 40 })}</g>`,
  rect({ x: 199, y: 103, w: 44, h: 5, r: 2.5, fill: c.k3 }),
  rect({ x: 199, y: 114, w: 30, h: 5, r: 2.5, fill: c.k3 }),
  rect({ x: 199, y: 125, w: 38, h: 5, r: 2.5, fill: c.k3 }),
  rect({ x: 264, y: 52, w: 18, h: 14, r: 3, fill: c.o }),
  rect({ x: 285, y: 52, w: 18, h: 14, r: 3, fill: c.b }),
  rect({ x: 264, y: 69, w: 18, h: 14, r: 3, fill: c.y }),
  rect({ x: 285, y: 69, w: 18, h: 14, r: 3, fill: c.k3 })
].join('')

const free = (c) => [
  panel(c),
  path({ d: 'M14 160L104 92L194 160Z', fill: c.k1 }),
  path({ d: 'M8 164L104 92L200 164', stroke: c.k3, sw: 6 }),
  rect({ x: 101, y: 44, w: 6, h: 50, fill: c.k3 }),
  rect({ x: 62, y: 44, w: 92, h: 4, r: 2, fill: c.k3 }),
  yagiElements({ c, x: 70, y: 46 }),
  path({ d: 'M176 30a26 26 0 0 1 0 32', stroke: c.y, sw: 4 }),
  path({ d: 'M190 20a40 40 0 0 1 0 52', stroke: c.y, sw: 4, op: 0.6 }),
  path({ d: 'M204 10a54 54 0 0 1 0 72', stroke: c.y, sw: 4, op: 0.3 }),
  path({ d: 'M107 84C150 84 168 116 214 116', stroke: c.ink, sw: 3 }),
  tunerBox({ c, x: 212, y: 100 })
].join('')

const tvGuide = (c) => [
  panel(c),
  ...[64, 128, 192, 256].map((x) => rect({ x, y: 14, w: 22, h: 5, r: 2.5, fill: c.k3 })),
  ...guideRows.flatMap((row, i) => [
    rect({ x: 22, y: 30 + i * 28, w: 30, h: 24, r: 4, fill: c.k2 }),
    ...row.map(([x, w, kind]) => guideBlock({ c, x, y: 30 + i * 28, w, kind }))
  ]),
  rect({ x: 159, y: 24, w: 3, h: 124, r: 1.5, fill: c.y }),
  circle({ cx: 160.5, cy: 24, r: 5, fill: c.y })
].join('')

const series = (c) => [
  panel(c),
  path({ d: 'M24 46a6 6 0 0 1 6-6h40l10 10h86a6 6 0 0 1 6 6v80a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6Z', fill: c.b, op: 0.45 }),
  episodeCard({ c, x: 100, y: 46, text: 'E03', rotate: 8 }),
  path({ d: 'M24 70a6 6 0 0 1 6-6h136a6 6 0 0 1 6 6v66a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6Z', fill: c.b }),
  label({ x: 40, y: 98, size: 15, fill: c.p, text: 'Season 2' }),
  rect({ x: 40, y: 110, w: 70, h: 5, r: 2.5, fill: c.p, op: 0.4 }),
  rect({ x: 40, y: 121, w: 48, h: 5, r: 2.5, fill: c.p, op: 0.4 }),
  episodeCard({ c, x: 196, y: 30, text: 'E04', rotate: -6 }),
  episodeCard({ c, x: 252, y: 62, text: 'E05', rotate: 5 }),
  path({ d: 'M244 104C230 128 204 132 182 120', stroke: c.ink, sw: 3, extra: ' stroke-dasharray="1 7"' }),
  path({ d: 'M190 114l-9 6 10 4', stroke: c.ink, sw: 3 })
].join('')

const hardlink = (c) => [
  panel(c),
  path({ d: 'M118 46C134 46 132 70 142 74', stroke: c.b, sw: 3 }),
  path({ d: 'M118 114C134 114 132 90 142 86', stroke: c.y, sw: 3 }),
  pathChip({ c, x: 12, y: 32, w: 106, text: 'recordings/', dot: c.b }),
  pathChip({ c, x: 12, y: 100, w: 106, text: 'TV/Show/', dot: c.y }),
  path({ d: fileShape({ x: 142, y: 36, w: 64, h: 88, fold: 16 }), fill: c.o }),
  path({ d: 'M190 36v10a6 6 0 0 0 6 6h10Z', fill: c.p, op: 0.3 }),
  label({ x: 174, y: 92, size: 15, fill: c.p, text: '.ts', anchor: 'middle' }),
  label({ x: 174, y: 110, size: 11, fill: c.p, text: '3 GB', anchor: 'middle', op: 0.7 }),
  path({ d: fileShape({ x: 234, y: 46, w: 54, h: 72, fold: 13 }), stroke: c.k3, sw: 2.5, extra: ' stroke-dasharray="5 5"' }),
  path({ d: 'M248 72l26 26M274 72l-26 26', stroke: c.k3, sw: 3 }),
  label({ x: 261, y: 140, size: 11, fill: c.ink, text: 'no copy', anchor: 'middle' })
].join('')

const plex = (c) => [
  panel(c),
  rect({ x: 22, y: 18, w: 92, h: 128, r: 10, fill: c.k1 }),
  rect({ x: 206, y: 18, w: 92, h: 128, r: 10, fill: c.k1 }),
  poster({ c, x: 36, y: 26 }),
  poster({ c, x: 220, y: 26 }),
  path({ d: 'M132 64H186', stroke: c.y, sw: 4 }),
  path({ d: 'M176 54l10 10-10 10', stroke: c.y, sw: 4 }),
  path({ d: 'M188 96H134', stroke: c.ink, sw: 4 }),
  path({ d: 'M144 86l-10 10 10 10', stroke: c.ink, sw: 4 })
].join('')

const adCut = (c) => [
  panel(c),
  rect({ x: 20, y: 86, w: 100, h: 30, r: 5, fill: c.b, op: 0.45 }),
  rect({ x: 200, y: 86, w: 100, h: 30, r: 5, fill: c.b, op: 0.45 }),
  rect({ x: 30, y: 98, w: 44, h: 6, r: 3, fill: c.hi, op: 0.4 }),
  rect({ x: 210, y: 98, w: 56, h: 6, r: 3, fill: c.hi, op: 0.4 }),
  rect({ x: 126, y: 86, w: 68, h: 30, r: 5, fill: 'none', extra: ` stroke="${c.k3}" stroke-width="2" stroke-dasharray="4 4"` }),
  path({ d: 'M123 74V128M197 74V128', stroke: c.ink, sw: 2.5, extra: ' stroke-dasharray="2 6"' }),
  '<g transform="rotate(-7 160 44)">',
  rect({ x: 124, y: 28, w: 72, h: 32, r: 5, fill: c.y }),
  label({ x: 160, y: 49, size: 13, fill: c.p, text: 'AD', anchor: 'middle' }),
  '</g>',
  path({ d: 'M160 66v10', stroke: c.y, sw: 3, op: 0.6 }),
  rect({ x: 20, y: 136, w: 40, h: 8, r: 3, fill: c.b, op: 0.25 }),
  rect({ x: 62, y: 136, w: 22, h: 8, r: 3, fill: c.y, op: 0.5 }),
  rect({ x: 86, y: 136, w: 40, h: 8, r: 3, fill: c.b, op: 0.25 }),
  label({ x: 134, y: 144, size: 11, fill: c.ink, text: '.orig kept' })
].join('')

const removes = (c) => [
  panel(c),
  rect({ x: 18, y: 22, w: 174, h: 116, r: 8, fill: c.k1 }),
  dvrRow({ c, y: 36, active: false }),
  dvrRow({ c, y: 74, active: true }),
  dvrRow({ c, y: 112, active: false }),
  path({ d: 'M192 85H222', stroke: c.ink, sw: 2.5, extra: ' stroke-dasharray="2 6"' }),
  path({ d: fileShape({ x: 228, y: 44, w: 58, h: 78, fold: 14 }), stroke: c.ink, sw: 2.5, extra: ' stroke-dasharray="6 5"' }),
  circle({ cx: 284, cy: 46, r: 13, fill: c.y }),
  path({ d: 'M277 46l5 5 9-10', stroke: c.p, sw: 3 }),
  rect({ x: 242, y: 78, w: 30, h: 5, r: 2.5, fill: c.k3 }),
  rect({ x: 242, y: 89, w: 22, h: 5, r: 2.5, fill: c.k3 })
].join('')

const lan = (c) => [
  panel(c),
  path({ d: 'M34 72L160 20L286 72V144a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4Z', fill: c.k1 }),
  path({ d: 'M22 76L160 18L298 76', stroke: c.k3, sw: 6 }),
  path({ d: 'M86 110H136M184 110H226', stroke: c.ink, sw: 2.5 }),
  rect({ x: 136, y: 84, w: 48, h: 48, r: 7, fill: c.o }),
  rect({ x: 144, y: 96, w: 32, h: 4, r: 2, fill: c.p, op: 0.4 }),
  rect({ x: 144, y: 106, w: 32, h: 4, r: 2, fill: c.p, op: 0.4 }),
  rect({ x: 144, y: 116, w: 32, h: 4, r: 2, fill: c.p, op: 0.4 }),
  path({ d: 'M150 62a10 4 0 0 1 20 0v14a10 4 0 0 1-20 0Z', fill: c.y }),
  path({ d: 'M150 62a10 4 0 0 0 20 0', stroke: c.p, sw: 1.5, op: 0.5 }),
  path({ d: 'M160 80v4', stroke: c.ink, sw: 2.5 }),
  rect({ x: 60, y: 90, w: 26, h: 42, r: 5, fill: c.b }),
  rect({ x: 64, y: 95, w: 18, h: 26, r: 2, fill: c.p, op: 0.35 }),
  rect({ x: 228, y: 92, w: 46, h: 30, r: 3, fill: c.b }),
  rect({ x: 232, y: 96, w: 38, h: 22, r: 1.5, fill: c.p, op: 0.35 }),
  rect({ x: 222, y: 122, w: 58, h: 5, r: 2.5, fill: c.k3 })
].join('')

const tvApps = (c) => [
  panel(c),
  rect({ x: 28, y: 16, w: 206, h: 118, r: 8, fill: c.k2 }),
  rect({ x: 36, y: 24, w: 190, h: 102, r: 4, fill: c.p }),
  rect({ x: 46, y: 34, w: 88, h: 46, r: 4, fill: c.o }),
  circle({ cx: 114, cy: 50, r: 8, fill: c.y }),
  path({ d: 'M46 80V66L70 54L94 70L112 62L134 72V80Z', fill: c.p, op: 0.3 }),
  rect({ x: 142, y: 34, w: 74, h: 6, r: 3, fill: c.hi, op: 0.6 }),
  rect({ x: 142, y: 46, w: 52, h: 5, r: 2.5, fill: c.k3 }),
  rect({ x: 142, y: 66, w: 36, h: 14, r: 7, fill: c.hi, op: 0.85 }),
  ...[c.b, c.k2, c.y, c.k2].map((fill, i) => rect({ x: 46 + i * 46, y: 92, w: 34, h: 24, r: 3, fill, op: i % 2 ? undefined : 0.7 })),
  rect({ x: 118, y: 134, w: 26, h: 8, fill: c.k2 }),
  rect({ x: 96, y: 142, w: 70, h: 6, r: 3, fill: c.k2 }),
  rect({ x: 258, y: 48, w: 34, h: 100, r: 17, fill: c.k1 }),
  circle({ cx: 275, cy: 76, r: 12, fill: c.k3 }),
  circle({ cx: 275, cy: 76, r: 5, fill: c.o }),
  circle({ cx: 268, cy: 104, r: 4, fill: c.k3 }),
  circle({ cx: 282, cy: 104, r: 4, fill: c.k3 }),
  rect({ x: 268, y: 116, w: 14, h: 18, r: 7, fill: c.k3 })
].join('')

const recordings = (c) => [
  panel(c),
  ...spines.map(([x, w, h, colour, op]) => [
    rect({ x, y: 128 - h, w, h, r: 3, fill: c[colour], op }),
    rect({ x: x + w / 2 - 4, y: 128 - h + 10, w: 8, h: Math.min(h - 28, 40), r: 4, fill: c.p, op: 0.35 })
  ].join('')),
  '<g transform="rotate(14 262 128)">',
  rect({ x: 236, y: 46, w: 54, h: 82, r: 4, fill: c.b }),
  circle({ cx: 272, cy: 66, r: 8, fill: c.y }),
  path({ d: 'M236 128V104L254 90L270 102L290 92V128Z', fill: c.p, op: 0.3 }),
  '</g>',
  rect({ x: 14, y: 128, w: 292, h: 8, r: 2, fill: c.k3 }),
  rect({ x: 26, y: 136, w: 8, h: 14, fill: c.k2 }),
  rect({ x: 286, y: 136, w: 8, h: 14, fill: c.k2 })
].join('')

const leavingFetch = (c) => [
  panel(c),
  rect({ x: 18, y: 92, w: 150, h: 46, r: 6, fill: c.k2 }),
  rect({ x: 30, y: 113, w: 22, h: 5, r: 2.5, fill: c.k3 }),
  circle({ cx: 152, cy: 115, r: 3.5, fill: c.k3 }),
  '<g transform="rotate(-14 22 92)">',
  rect({ x: 22, y: 80, w: 150, h: 12, r: 4, fill: c.k1 }),
  '</g>',
  path({ d: 'M96 90C104 44 170 22 226 40', stroke: c.o, sw: 10 }),
  path({ d: 'M212 22l22 20-26 14', stroke: c.o, sw: 10 }),
  rect({ x: 236, y: 92, w: 66, h: 26, r: 5, fill: c.b }),
  circle({ cx: 248, cy: 105, r: 3, fill: c.y }),
  rect({ x: 236, y: 122, w: 66, h: 26, r: 5, fill: c.b, op: 0.55 }),
  circle({ cx: 248, cy: 135, r: 3, fill: c.y })
].join('')

const gettingStarted = (c) => [
  panel(c),
  rect({ x: 12, y: 34, w: 106, h: 84, r: 8, fill: c.k2 }),
  windowDots({ c, x: 22, y: 44 }),
  path({ d: 'M22 66l7 5-7 5', stroke: c.y, sw: 3 }),
  rect({ x: 36, y: 68, w: 62, h: 6, r: 3, fill: c.hi, op: 0.7 }),
  rect({ x: 22, y: 86, w: 72, h: 5, r: 2.5, fill: c.k3 }),
  rect({ x: 22, y: 98, w: 50, h: 5, r: 2.5, fill: c.k3 }),
  arrow({ c, x1: 122, x2: 138, y: 76 }),
  rect({ x: 142, y: 34, w: 80, h: 38, r: 6, fill: c.o }),
  label({ x: 182, y: 57, size: 11, fill: c.p, text: 'TVHeadend', anchor: 'middle' }),
  rect({ x: 142, y: 80, w: 80, h: 38, r: 6, fill: c.b }),
  label({ x: 182, y: 103, size: 11, fill: c.p, text: 'Freetvarr', anchor: 'middle' }),
  arrow({ c, x1: 226, x2: 240, y: 76 }),
  rect({ x: 244, y: 22, w: 66, h: 108, r: 8, fill: c.k2 }),
  rect({ x: 250, y: 36, w: 54, h: 88, r: 4, fill: c.p }),
  setupStep({ c, y: 50, state: 'done' }),
  setupStep({ c, y: 78, state: 'current' }),
  setupStep({ c, y: 106, state: 'next' }),
  path({ d: 'M262 58V70M262 86V98', stroke: c.k3, sw: 2 }),
  label({ x: 277, y: 150, size: 11, fill: c.ink, text: 'setup', anchor: 'middle' })
].join('')

const hardware = (c) => [
  panel(c),
  rect({ x: 45, y: 24, w: 6, h: 74, fill: c.k3 }),
  rect({ x: 10, y: 24, w: 80, h: 4, r: 2, fill: c.k3 }),
  yagiElements({ c, x: 16, y: 26, scale: 0.8 }),
  path({ d: 'M48 98C48 120 80 117 108 117', stroke: c.ink, sw: 3 }),
  tunerBox({ c, x: 108, y: 100 }),
  path({ d: 'M196 117H228', stroke: c.ink, sw: 3 }),
  rect({ x: 228, y: 44, w: 76, h: 94, r: 8, fill: c.k2 }),
  ...[238, 268].map((x) => [
    rect({ x, y: 54, w: 26, h: 66, r: 4, fill: c.k1 }),
    rect({ x: x + 7, y: 64, w: 12, h: 4, r: 2, fill: c.k3 }),
    rect({ x: x + 7, y: 72, w: 12, h: 4, r: 2, fill: c.k3 })
  ].join('')),
  circle({ cx: 244, cy: 128, r: 3, fill: c.o }),
  circle({ cx: 254, cy: 128, r: 3, fill: c.k3 }),
  label({ x: 48, y: 152, size: 11, fill: c.ink, text: 'aerial', anchor: 'middle' }),
  label({ x: 152, y: 152, size: 11, fill: c.ink, text: 'tuner', anchor: 'middle' }),
  label({ x: 266, y: 152, size: 11, fill: c.ink, text: 'NAS', anchor: 'middle' })
].join('')

const sonarrRadarr = (c) => [
  panel(c),
  rect({ x: 14, y: 26, w: 122, h: 108, r: 8, fill: c.k1 }),
  listRow({ c, y: 40, active: false }),
  listRow({ c, y: 70, active: true }),
  listRow({ c, y: 100, active: false }),
  path({ d: 'M140 80H164', stroke: c.ink, sw: 2.5, extra: ' stroke-dasharray="2 6"' }),
  path({ d: 'M174 46h34v58l-17-12-17 12Z', fill: c.y }),
  path({ d: 'M168 104L214 46', stroke: c.p, sw: 7 }),
  path({ d: 'M168 104L214 46', stroke: c.ink, sw: 3 }),
  path({ d: 'M220 80H240', stroke: c.ink, sw: 2.5, extra: ' stroke-dasharray="2 6"' }),
  '<g transform="rotate(14 272 48)">',
  path({ d: fileShape({ x: 258, y: 24, w: 30, h: 40, fold: 9 }), fill: c.o }),
  '</g>',
  '<g transform="rotate(-16 246 80)">',
  rect({ x: 244, y: 74, w: 62, h: 8, r: 3, fill: c.k3 }),
  rect({ x: 266, y: 69, w: 18, h: 6, r: 2, fill: c.k3 }),
  '</g>',
  path({ d: 'M250 88h52l-6 52a4 4 0 0 1-4 4h-32a4 4 0 0 1-4-4Z', fill: c.k2 }),
  path({ d: 'M266 98l2 36M276 98v36M286 98l-2 36', stroke: c.p, sw: 2.5, op: 0.4 })
].join('')

const activity = (c) => [
  panel(c),
  rect({ x: 14, y: 12, w: 292, h: 136, r: 8, fill: c.k1 }),
  rect({ x: 26, y: 22, w: 112, h: 24, r: 12, fill: c.k2 }),
  rect({ x: 29, y: 25, w: 52, h: 18, r: 9, fill: c.p }),
  label({ x: 55, y: 38, size: 11, fill: c.hi, text: 'Now', anchor: 'middle' }),
  label({ x: 109, y: 38, size: 11, fill: c.ink, text: 'Syncs', anchor: 'middle' }),
  jobRow({ c, y: 58, colour: c.b, progress: 0.62 }),
  jobRow({ c, y: 84, colour: c.o, progress: 0.34, recording: true }),
  rect({ x: 26, y: 114, w: 268, h: 1, fill: c.k3 }),
  ...syncHistory.map((state, i) => circle({ cx: 32 + i * 18.5, cy: 131, r: 4.5, fill: state ? c.y : c.k3 }))
].join('')

const troubleshooting = (c) => [
  panel(c),
  rect({ x: 22, y: 16, w: 186, h: 128, r: 8, fill: c.k1 }),
  rect({ x: 30, y: 82, w: 170, h: 26, r: 6, fill: c.o, op: 0.2 }),
  ...healthChecks.map(([text, ok], i) => healthRow({ c, y: 32 + i * 30, text, ok })),
  path({ d: 'M206 95C222 95 222 80 236 80', stroke: c.ink, sw: 2.5, extra: ' stroke-dasharray="2 6"' }),
  rect({ x: 238, y: 50, w: 66, h: 60, r: 8, fill: c.b }),
  label({ x: 252, y: 72, size: 13, fill: c.p, text: 'Fix' }),
  rect({ x: 252, y: 82, w: 38, h: 4, r: 2, fill: c.p, op: 0.45 }),
  rect({ x: 252, y: 92, w: 28, h: 4, r: 2, fill: c.p, op: 0.45 })
].join('')

export const illustrations = [
  { id: 'live-tv', label: 'A TV, a phone, and channel tiles, all playing the same live channel', build: live },
  { id: 'free-to-run', label: 'A rooftop aerial wired to a network tuner', build: free },
  { id: 'tv-guide', label: 'A TV guide grid with a now line and one programme set to record', build: tvGuide },
  { id: 'series-folders', label: 'Episodes E03, E04, and E05 filed into a Season 2 folder', build: series },
  { id: 'hardlink-imports', label: 'One .ts file linked from both recordings/ and TV/Show/, with no second copy', build: hardlink },
  { id: 'plex-integration', label: 'The same poster and watched progress in two libraries, synced both ways', build: plex },
  { id: 'ad-removal', label: 'An ad break cut out of a recording, with the .orig file kept', build: adCut },
  { id: 'removes-that-work', label: 'A recording list entry kept while its file is deleted', build: removes },
  { id: 'authless-lan', label: 'A server and two devices inside one home network', build: lan },
  { id: 'tv-apps', label: 'A TV app with a TV guide on a TV, and its remote', build: tvApps },
  { id: 'recordings', label: 'A shelf of recordings with one programme pulled out', build: recordings },
  { id: 'leaving-fetch', label: 'A set-top box left behind for a tuner and storage you own', build: leavingFetch },
  { id: 'getting-started', label: 'An install command starts TVHeadend and Freetvarr, then setup runs in the browser', build: gettingStarted },
  { id: 'hardware', label: 'An aerial wired to a network tuner, wired to a NAS', build: hardware },
  { id: 'sonarr-radarr', label: 'A deleted episode is unmonitored, and its file goes to the recycle bin', build: sonarrRadarr },
  { id: 'activity', label: 'The Activity page: jobs running now, and a row of past syncs', build: activity },
  { id: 'troubleshooting', label: 'A Health check list with one failed check that links to its fix', build: troubleshooting }
]

const guideRows = [
  [[64, 82, 'tint'], [150, 72, 'mid'], [226, 76, 'tint']],
  [[64, 40, 'dim'], [108, 118, 'rec'], [230, 72, 'tint']],
  [[64, 120, 'solid'], [188, 114, 'tint']],
  [[64, 56, 'tint'], [124, 92, 'mid'], [220, 82, 'dim']]
]

const spines = [
  [26, 34, 92, 'b', 1], [62, 22, 80, 'k2', 1], [86, 30, 98, 'o', 1], [118, 18, 72, 'y', 1],
  [138, 26, 88, 'b', 0.5], [166, 34, 96, 'k2', 1], [202, 22, 84, 'o', 0.55]
]

const syncHistory = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1]

const healthChecks = [['TVHeadend', true], ['TV guide', true], ['Folders', false], ['Plex', true]]

const healthRow = ({ c, y, text, ok }) => [
  circle({ cx: 46, cy: y, r: 9, fill: ok ? c.y : c.o }),
  ok
    ? path({ d: `M41.5 ${y}l3 3 6-6.5`, stroke: c.p, sw: 2.5 })
    : path({ d: `M46 ${y - 4.5}v5M46 ${y + 4}v0.5`, stroke: c.p, sw: 2.5 }),
  label({ x: 64, y: y + 4.5, size: 12, fill: ok ? c.ink : c.hi, text })
].join('')

const jobRow = ({ c, y, colour, progress, recording = false }) => [
  rect({ x: 26, y, w: 20, h: 20, r: 5, fill: colour }),
  recording ? circle({ cx: 36, cy: y + 10, r: 4, fill: c.p }) : '',
  rect({ x: 56, y: y + 3, w: 78, h: 6, r: 3, fill: c.k3 }),
  rect({ x: 56, y: y + 13, w: 50, h: 4, r: 2, fill: c.k2 }),
  rect({ x: 160, y: y + 7, w: 134, h: 6, r: 3, fill: c.k2 }),
  rect({ x: 160, y: y + 7, w: 134 * progress, h: 6, r: 3, fill: colour })
].join('')

const listRow = ({ c, y, active }) => [
  active ? rect({ x: 20, y: y - 6, w: 110, h: 32, r: 6, fill: c.b, op: 0.2 }) : '',
  rect({ x: 26, y, w: 20, h: 20, r: 4, fill: active ? c.b : c.k2 }),
  rect({ x: 54, y: y + 3, w: active ? 50 : 56, h: 6, r: 3, fill: c.k3 }),
  rect({ x: 54, y: y + 13, w: 34, h: 4, r: 2, fill: c.k2 }),
  active ? path({ d: `M112 ${y + 5}h12M114 ${y + 7}l1 10h6l1-10`, stroke: c.b, sw: 2 }) : ''
].join('')

const setupStep = ({ c, y, state }) => {
  const fill = { done: c.y, current: c.b, next: c.k3 }[state]
  return [
    circle({ cx: 262, cy: y, r: 7, fill }),
    state === 'done' ? path({ d: `M258.5 ${y}l2.5 2.5 4.5-5`, stroke: c.p, sw: 2 }) : '',
    rect({ x: 274, y: y - 3, w: state === 'next' ? 20 : 24, h: 6, r: 3, fill: state === 'next' ? c.k2 : c.k3 })
  ].join('')
}

const windowDots = ({ c, x, y }) =>
  [0, 9, 18].map((dx) => circle({ cx: x + dx, cy: y, r: 3, fill: c.k3 })).join('')

const arrow = ({ c, x1, x2, y }) => [
  path({ d: `M${x1} ${y}H${x2}`, stroke: c.ink, sw: 3 }),
  path({ d: `M${x2 - 5} ${y - 5}l5 5-5 5`, stroke: c.ink, sw: 3 })
].join('')

const tunerBox = ({ c, x, y }) => [
  rect({ x, y, w: 88, h: 34, r: 6, fill: c.b }),
  circle({ cx: x + 16, cy: y + 17, r: 3.5, fill: c.y }),
  circle({ cx: x + 28, cy: y + 17, r: 3.5, fill: c.p, op: 0.45 }),
  ...[9, 15.5, 22].map((dy) => rect({ x: x + 46, y: y + dy, w: 32, h: 3, r: 1.5, fill: c.p, op: 0.35 })),
  rect({ x: x + 8, y: y + 34, w: 10, h: 4, r: 1, fill: c.k3 }),
  rect({ x: x + 70, y: y + 34, w: 10, h: 4, r: 1, fill: c.k3 })
].join('')

const yagiElements = ({ c, x, y, scale = 1 }) =>
  [30, 27, 24, 21, 18, 15, 12]
    .map((h) => h * scale)
    .map((h, i) => rect({ x: x + i * 12 * scale, y: y - h / 2, w: 4, h, r: 2, fill: c.y }))
    .join('')

const landscape = ({ c, x, y, w, h }) => [
  rect({ x, y, w, h, fill: c.o, op: 0.22 }),
  circle({ cx: x + w * 0.7, cy: y + h * 0.36, r: Math.min(w, h) * 0.14, fill: c.y }),
  path({
    d: `M${x} ${y + h}V${y + h * 0.72}Q${x + w * 0.28} ${y + h * 0.42} ${x + w * 0.52} ${y + h * 0.66}T${x + w} ${y + h * 0.6}V${y + h}Z`,
    fill: c.o
  })
].join('')

const guideBlock = ({ c, x, y, w, kind }) => {
  const fills = {
    tint: { fill: c.b, op: 0.28, bar: c.hi, barOp: 0.3 },
    mid: { fill: c.b, op: 0.55, bar: c.hi, barOp: 0.45 },
    solid: { fill: c.b, op: undefined, bar: c.p, barOp: 0.5 },
    rec: { fill: c.o, op: undefined, bar: c.p, barOp: 0.5 },
    dim: { fill: c.k1, op: undefined, bar: c.k3, barOp: undefined }
  }[kind]
  const dot = kind === 'rec' ? circle({ cx: x + 11, cy: y + 12, r: 3.5, fill: c.p }) : ''
  const barX = kind === 'rec' ? x + 20 : x + 8
  return [
    rect({ x, y, w, h: 24, r: 4, fill: fills.fill, op: fills.op }),
    dot,
    rect({ x: barX, y: y + 9, w: Math.min(w - (barX - x) - 8, 44), h: 6, r: 3, fill: fills.bar, op: fills.barOp })
  ].join('')
}

const episodeCard = ({ c, x, y, text, rotate }) => [
  `<g transform="rotate(${rotate} ${x + 23} ${y + 16})">`,
  rect({ x, y, w: 46, h: 32, r: 4, fill: c.k2 }),
  rect({ x, y, w: 46, h: 12, r: 4, fill: c.o }),
  rect({ x, y: y + 8, w: 46, h: 4, fill: c.o }),
  label({ x: x + 23, y: y + 27, size: 10, fill: c.hi, text, anchor: 'middle' }),
  '</g>'
].join('')

const pathChip = ({ c, x, y, w, text, dot }) => [
  rect({ x, y, w, h: 28, r: 14, fill: c.k2 }),
  circle({ cx: x + 15, cy: y + 14, r: 5, fill: dot }),
  label({ x: x + 27, y: y + 18.5, size: 12, fill: c.hi, text })
].join('')

const poster = ({ c, x, y }) => [
  `<clipPath id="poster-${x}"><rect x="${x}" y="${y}" width="64" height="92" rx="6"/></clipPath>`,
  rect({ x, y, w: 64, h: 92, r: 6, fill: c.k2 }),
  `<g clip-path="url(#poster-${x})">`,
  rect({ x, y, w: 64, h: 92, fill: c.b, op: 0.3 }),
  circle({ cx: x + 40, cy: y + 30, r: 11, fill: c.y }),
  path({ d: `M${x} ${y + 92}V${y + 62}L${x + 22} ${y + 44}L${x + 40} ${y + 60}L${x + 52} ${y + 50}L${x + 64} ${y + 60}V${y + 92}Z`, fill: c.b }),
  rect({ x: x + 8, y: y + 74, w: 36, h: 5, r: 2.5, fill: c.p, op: 0.55 }),
  '</g>',
  rect({ x, y: y + 100, w: 64, h: 5, r: 2.5, fill: c.k2 }),
  rect({ x, y: y + 100, w: 40, h: 5, r: 2.5, fill: c.y })
].join('')

const dvrRow = ({ c, y, active }) => [
  active ? rect({ x: 26, y: y - 6, w: 158, h: 34, r: 6, fill: c.b, op: 0.2 }) : '',
  rect({ x: 34, y, w: 22, h: 22, r: 4, fill: active ? c.b : c.k2 }),
  rect({ x: 64, y: y + 3, w: active ? 84 : 76, h: 6, r: 3, fill: c.k3 }),
  rect({ x: 64, y: y + 14, w: 48, h: 5, r: 2.5, fill: c.k2 })
].join('')

const fileShape = ({ x, y, w, h, fold = 14 }) =>
  `M${x + 6} ${y}h${w - fold - 6}l${fold} ${fold}v${h - fold - 6}a6 6 0 0 1-6 6h${-(w - 12)}a6 6 0 0 1-6-6v${-(h - 12)}a6 6 0 0 1 6-6Z`

const panel = (c) => rect({ x: 0, y: 0, w: 320, h: 160, r: 8, fill: c.p })

const rect = ({ x, y, w, h, r = 0, fill, op, extra = '' }) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${opacity(op)}${extra}/>`

const circle = ({ cx, cy, r, fill, op }) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${opacity(op)}/>`

const path = ({ d, fill = 'none', stroke, sw, op, extra = '' }) => {
  const strokeAttributes = stroke
    ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`
    : ''
  return `<path d="${d}" fill="${fill}"${strokeAttributes}${opacity(op)}${extra}/>`
}

const label = ({ x, y, size, fill, text, anchor = 'start', op }) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}"${opacity(op)}>${text}</text>`

const opacity = (op) => (op === undefined ? '' : ` opacity="${op}"`)

const svgDocument = ({ body, style = '', className = '', label }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160" width="320" height="160"${className} role="img" aria-label="${label}">${style}${body}</svg>`

const scopeIds = ({ id, svg }) => svg.replaceAll('id="', `id="${id}-`).replaceAll('url(#', `url(#${id}-`)

const tokenAttribute = /\s(fill|stroke)="(var\(--ill-\w+\))"/g

const styleVarAttributes = (svg) => svg.replace(/<(\w+)([^>]*?)(\/?)>/g, (tag, name, attributes, selfClosing) => {
  const declarations = [...attributes.matchAll(tokenAttribute)].map(([, property, value]) => `${property}:${value}`)
  if (!declarations.length) return tag
  return `<${name}${attributes.replace(tokenAttribute, '')} style="${declarations.join(';')}"${selfClosing}>`
})

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
