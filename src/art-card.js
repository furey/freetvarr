import fs from 'fs'

import { artHueOf } from './web/art-fallback.js'

export const CARD_VERSION = 'card-v1'
export const CARD_TYPE = 'image/svg+xml'

export const titleCardSvg = ({ title, shape = 'landscape', year = null, logo = null }) => {
  const box = shape === 'poster' ? POSTER_BOX : LANDSCAPE_BOX
  const hue = artHueOf(title)
  const yearBlock = year ? YEAR_FONT_PX * YEAR_LINE_HEIGHT + YEAR_GAP_PX : 0
  const textBottom = box.height - PADDING_PX - yearBlock
  const maxWidth = (box.width - PADDING_PX * 2) * TITLE_WIDTH_SHARE
  const fontPx = titleFontPxOf({ title, maxWidth })
  const lines = titleLinesOf({ title, maxWidth, fontPx })
  const titleTop = textBottom - lines.length * fontPx * TITLE_LINE_HEIGHT
  const body = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="0 0 ${box.width} ${box.height}">`,
    gradientOf({ hue, box }),
    `<rect width="${box.width}" height="${box.height}" fill="url(#fill)"/>`,
    `<g fill="#fff">${lines.map((line, at) => textPathsOf({
      text: line,
      left: PADDING_PX,
      top: titleTop + at * fontPx * TITLE_LINE_HEIGHT,
      fontPx,
      lineHeight: TITLE_LINE_HEIGHT,
    })).join('')}</g>`,
    year ? `<g fill="#fff" fill-opacity="${YEAR_OPACITY}">${textPathsOf({
      text: String(year),
      left: PADDING_PX,
      top: textBottom + YEAR_GAP_PX,
      fontPx: YEAR_FONT_PX,
      lineHeight: YEAR_LINE_HEIGHT,
    })}</g>` : '',
    logo ? logoImageOf({ logo, box }) : '',
    '</svg>',
  ].join('')
  return { body: Buffer.from(body), contentType: CARD_TYPE }
}

export const titleLinesOf = ({ title, maxWidth, fontPx = TITLE_FONT_PX, maxLines = MAX_TITLE_LINES }) => {
  const words = wordsOf({ title, maxWidth, fontPx })
  if (!words.length) return []
  const greedy = wrapWords({ words, width: maxWidth, fontPx })
  if (greedy.length > maxLines) return clampLines({ lines: greedy.slice(0, maxLines), maxWidth, fontPx })
  return wrapWords({ words, width: balancedWidthOf({ words, lineCount: greedy.length, maxWidth, fontPx }), fontPx })
}

export const titleFontPxOf = ({ title, maxWidth }) => {
  const widest = Math.max(0, ...String(title || '').trim().split(/\s+/).map((word) => textWidthOf({ text: word, fontPx: 1 })))
  if (!widest) return TITLE_FONT_PX
  return Math.max(MIN_TITLE_FONT_PX, Math.min(TITLE_FONT_PX, Math.floor((maxWidth / widest) * 10) / 10))
}

export const textWidthOf = ({ text, fontPx = TITLE_FONT_PX }) => [...text]
  .reduce((width, char) => width + advanceOf({ char, fontPx }), 0)

export const linearGradientOf = ({ angleDeg, width, height }) => {
  const radians = (angleDeg * Math.PI) / 180
  const dx = Math.sin(radians)
  const dy = -Math.cos(radians)
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2
  const round = (value) => Math.round(value * 100) / 100
  return {
    x1: round(width / 2 - dx * half),
    y1: round(height / 2 - dy * half),
    x2: round(width / 2 + dx * half),
    y2: round(height / 2 + dy * half),
  }
}

export const hslHexOf = ({ hue, saturation, lightness }) => {
  const s = saturation / 100
  const l = lightness / 100
  const chroma = s * Math.min(l, 1 - l)
  const channel = (offset) => {
    const k = (offset + hue / 30) % 12
    const value = l - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(value * 255).toString(16).padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

const gradientOf = ({ hue, box }) => {
  const { x1, y1, x2, y2 } = linearGradientOf({ angleDeg: GRADIENT_ANGLE_DEG, width: box.width, height: box.height })
  const stops = [
    [0, hslHexOf({ hue, saturation: 62, lightness: 44 })],
    [0.6, hslHexOf({ hue, saturation: 55, lightness: 18 })],
    [1, SURFACE_COLOUR],
  ]
  return [
    `<defs><linearGradient id="fill" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">`,
    stops.map(([offset, colour]) => `<stop offset="${offset}" stop-color="${colour}"/>`).join(''),
    '</linearGradient></defs>',
  ].join('')
}

const logoImageOf = ({ logo, box }) => {
  const scale = Math.min(LOGO_HEIGHT_PX / logo.height, LOGO_MAX_WIDTH_PX / logo.width)
  const width = Math.round(logo.width * scale * 100) / 100
  const height = Math.round(logo.height * scale * 100) / 100
  const href = `data:image/png;base64,${logo.body.toString('base64')}`
  return `<image x="${box.width - PADDING_PX - width}" y="${PADDING_PX}" width="${width}" height="${height}" opacity="${LOGO_OPACITY}" href="${href}"/>`
}

const textPathsOf = ({ text, left, top, fontPx, lineHeight }) => {
  const font = glyphFont()
  const scale = fontPx / font.unitsPerEm
  const contentHeight = (font.ascender - font.descender) * scale
  const baseline = top + (fontPx * lineHeight - contentHeight) / 2 + font.ascender * scale
  let x = left
  const paths = []
  for (const char of text) {
    const glyph = glyphOf(char)
    if (glyph?.[1]) paths.push(`<path transform="translate(${fixed(x)} ${fixed(baseline)}) scale(${fixed(scale, 5)} ${fixed(-scale, 5)})" d="${glyph[1]}"/>`)
    x += advanceOf({ char, fontPx })
  }
  return paths.join('')
}

const wordsOf = ({ title, maxWidth, fontPx }) => String(title || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .flatMap((word) => piecesOf({ word, maxWidth, fontPx }))

const piecesOf = ({ word, maxWidth, fontPx }) => {
  if (textWidthOf({ text: word, fontPx }) <= maxWidth) return [word]
  const pieces = ['']
  for (const char of word) {
    const next = `${pieces.at(-1)}${char}`
    if (pieces.at(-1) && textWidthOf({ text: next, fontPx }) > maxWidth) pieces.push(char)
    else pieces[pieces.length - 1] = next
  }
  return pieces
}

const wrapWords = ({ words, width, fontPx }) => {
  const lines = []
  for (const word of words) {
    const joined = lines.length ? `${lines.at(-1)} ${word}` : word
    if (lines.length && textWidthOf({ text: joined, fontPx }) <= width) lines[lines.length - 1] = joined
    else lines.push(word)
  }
  return lines
}

const balancedWidthOf = ({ words, lineCount, maxWidth, fontPx }) => {
  let low = 0
  let high = maxWidth
  while (high - low > BALANCE_STEP_PX) {
    const middle = (low + high) / 2
    const fits = words.every((word) => textWidthOf({ text: word, fontPx }) <= middle)
      && wrapWords({ words, width: middle, fontPx }).length <= lineCount
    if (fits) high = middle
    else low = middle
  }
  return high
}

const clampLines = ({ lines, maxWidth, fontPx }) => {
  let last = `${lines.at(-1)}${ELLIPSIS}`
  while (last.length > 1 && textWidthOf({ text: last, fontPx }) > maxWidth) last = `${[...last].slice(0, -2).join('').trimEnd()}${ELLIPSIS}`
  return [...lines.slice(0, -1), last]
}

const advanceOf = ({ char, fontPx }) => {
  const font = glyphFont()
  const glyph = glyphOf(char) ?? font.glyphs[SPACE_CODE]
  return (glyph[0] / font.unitsPerEm) * fontPx + TRACKING_EM * fontPx
}

const glyphOf = (char) => {
  const glyphs = glyphFont().glyphs
  const direct = glyphs[String(char.codePointAt(0))]
  if (direct) return direct
  const base = char.normalize('NFKD')[0]
  return base && base !== char ? glyphs[String(base.codePointAt(0))] ?? null : null
}

const glyphFont = () => {
  loadedFont ??= JSON.parse(fs.readFileSync(new URL('./art-card-glyphs.json', import.meta.url), 'utf8'))
  return loadedFont
}

const fixed = (value, digits = 2) => Number(value.toFixed(digits))

let loadedFont = null

const LANDSCAPE_BOX = { width: 256, height: 144 }
const POSTER_BOX = { width: 120, height: 180 }
const PADDING_PX = 12
const TITLE_FONT_PX = 19
const MIN_TITLE_FONT_PX = 13
const TITLE_LINE_HEIGHT = 1.05
const TITLE_WIDTH_SHARE = 0.88
const MAX_TITLE_LINES = 3
const TRACKING_EM = -0.01
const YEAR_FONT_PX = 13
const YEAR_LINE_HEIGHT = 1.2
const YEAR_GAP_PX = 4
const YEAR_OPACITY = 0.72
const LOGO_HEIGHT_PX = 22
const LOGO_MAX_WIDTH_PX = 56
const LOGO_OPACITY = 0.92
const GRADIENT_ANGLE_DEG = 135
const SURFACE_COLOUR = '#1c2630'
const BALANCE_STEP_PX = 0.5
const ELLIPSIS = '…'
const SPACE_CODE = '32'
