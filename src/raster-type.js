export const rasterTypeOf = (body) => {
  if (!Buffer.isBuffer(body)) return null
  return SIGNATURES.find(({ matches }) => matches(body))?.type ?? null
}

export const isSvgBody = (body) =>
  Buffer.isBuffer(body) && body.length <= SVG_MAX_BYTES && SVG_START.test(body.toString('utf8', 0, SVG_SNIFF_BYTES))

export const isRenderableSvg = (body) => isSvgBody(body) && !SVG_FILTER.test(body.toString('utf8'))

export const mentionsSvg = (body) => Buffer.isBuffer(body) && SVG_TAG.test(body.toString('utf8'))

export const sourceImageTypeOf = (body) => rasterTypeOf(body) ?? (isRenderableSvg(body) ? SVG_TYPE : null)

export const IMAGE_RESPONSE_CSP = "default-src 'none'; sandbox"

const startsWith = (body, bytes) => bytes.every((byte, at) => body[at] === byte)

const SIGNATURES = [
  { type: 'image/jpeg', matches: (body) => startsWith(body, [0xff, 0xd8, 0xff]) },
  { type: 'image/png', matches: (body) => startsWith(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { type: 'image/gif', matches: (body) => ['GIF87a', 'GIF89a'].includes(body.toString('latin1', 0, 6)) },
  {
    type: 'image/webp',
    matches: (body) => body.toString('latin1', 0, 4) === 'RIFF' && body.toString('latin1', 8, 12) === 'WEBP',
  },
]

const SVG_TYPE = 'image/svg+xml'
const SVG_MAX_BYTES = 1024 * 1024
const SVG_SNIFF_BYTES = 4096
const SVG_FILTER = /<\s*([\w-]+:)?filter\b|\bfilter\s*[=:]/i
const SVG_TAG = /<\s*([\w-]+:)?svg\b/i
const SVG_START = /^﻿?\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE\s+svg[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i
