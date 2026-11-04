export const rasterTypeOf = (body) => {
  if (!Buffer.isBuffer(body)) return null
  return SIGNATURES.find(({ matches }) => matches(body))?.type ?? null
}

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
