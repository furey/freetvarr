import sharp from 'sharp'

import { db } from './db.js'
import { showTitleKey } from './show-artwork.js'

export const PLACEHOLDER_FAMILIES = 5
export const LOGO_LIKE_FAMILIES = 3
export const LOGO_LIKE_DISTANCE = 16
export const PLACEHOLDER_CLEAR_SHARE = 0.2
export const LOGO_MATCH_DISTANCE = 10

export const pictureTraitsOf = async (body) => {
  const small = await smallCopyOf(body)
  const [hash, clearShare] = await Promise.all([hashOfSmallCopy(small), clearShareOf(small)])
  return { hash, clearShare }
}

export const pictureHashOf = async (body) => hashOfSmallCopy(await smallCopyOf(body))

const smallCopyOf = (body) => sharp(body, { limitInputPixels: MAX_INPUT_PIXELS })
  .resize(SMALL_COPY_PX, SMALL_COPY_PX, { fit: 'inside', withoutEnlargement: true })
  .ensureAlpha()
  .png()
  .toBuffer()

const hashOfSmallCopy = async (small) => {
  const flat = await sharp(small).flatten({ background: '#000' }).png().toBuffer()
  const trimmed = await sharp(flat).trim({ threshold: TRIM_THRESHOLD }).toBuffer().catch(() => flat)
  const pixels = await sharp(trimmed).greyscale().resize(HASH_SIZE + 1, HASH_SIZE, { fit: 'fill' }).raw().toBuffer()
  let bits = 0n
  for (let y = 0; y < HASH_SIZE; y += 1) {
    for (let x = 0; x < HASH_SIZE; x += 1) {
      const at = y * (HASH_SIZE + 1) + x
      bits = (bits << 1n) | (pixels[at] > pixels[at + 1] ? 1n : 0n)
    }
  }
  return bits.toString(16).padStart(HASH_HEX_LENGTH, '0')
}

export const hashDistanceOf = (a, b) => {
  let difference = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let count = 0
  while (difference) {
    count += Number(difference & 1n)
    difference >>= 1n
  }
  return count
}

export const isUsableLogoHash = (hash) => {
  const set = hashDistanceOf(hash, ZERO_HASH)
  return set >= MIN_LOGO_BITS && set <= HASH_BITS - MIN_LOGO_BITS
}

export const titleFamilyOf = (title) => showTitleKey(title).split(' ').find((word) => !FAMILY_STOP_WORDS.has(word)) ?? null

export const placeholderReasonOf = ({ source, traits = null, families = 0, logoHashes = [] }) => {
  if (PLACEHOLDER_NAME.test(fileNameOf(source))) return 'name'
  if (families >= PLACEHOLDER_FAMILIES) return 'repeated'
  if (!traits) return null
  if (traits.clearShare >= PLACEHOLDER_CLEAR_SHARE) return 'transparent'
  const logoDistance = Math.min(HASH_BITS, ...logoHashes.map((logo) => hashDistanceOf(logo, traits.hash)))
  if (logoDistance <= LOGO_MATCH_DISTANCE) return 'logo'
  if (families >= LOGO_LIKE_FAMILIES && logoDistance <= LOGO_LIKE_DISTANCE) return 'repeated'
  return null
}

export const createPlaceholderPictures = ({ database = db, traitsOf = pictureTraitsOf, now = Date.now } = {}) => {
  const checks = new Map()
  const guideFamilies = new Map()
  const sourcesByHash = new Map()
  let logoHashes = []
  let loading = null

  const load = () => {
    loading ??= database('picture_checks').select('source_url', 'hash', 'clear_share', 'families')
      .then((rows) => rows.forEach((row) => index({
        source: row.source_url,
        traits: { hash: row.hash, clearShare: Number(row.clear_share) },
        families: new Set(String(row.families ?? '').split(' ').filter(Boolean)),
      })))
      .catch(() => {})
    return loading
  }

  const index = ({ source, traits, families }) => {
    checks.set(source, { traits, families })
    const sources = sourcesByHash.get(traits.hash) ?? new Set()
    sourcesByHash.set(traits.hash, sources.add(source))
  }

  const familiesOf = (source) => {
    const families = new Set(guideFamilies.get(source))
    const hash = checks.get(source)?.traits.hash
    const twins = hash ? sourcesByHash.get(hash) : [source]
    for (const twin of twins) {
      for (const family of checks.get(twin)?.families ?? []) families.add(family)
      for (const family of guideFamilies.get(twin) ?? []) families.add(family)
    }
    return families.size
  }

  const reasonFor = (source) => placeholderReasonOf({
    source,
    traits: checks.get(source)?.traits ?? null,
    families: familiesOf(source),
    logoHashes,
  })

  const noteTitles = (uses = []) => {
    for (const { source, title } of uses) {
      const family = titleFamilyOf(title)
      if (!source || !family) continue
      const families = guideFamilies.get(source) ?? new Set()
      if (families.size < MAX_FAMILIES) guideFamilies.set(source, families.add(family))
    }
  }

  const setLogoHashes = (hashes = []) => {
    logoHashes = [...new Set(hashes.filter((hash) => hash && isUsableLogoHash(hash)))]
  }

  const check = async ({ source, title = null, image = null }) => {
    if (!source) return null
    await load()
    if (title) noteTitles([{ source, title }])
    if (checks.has(source) || !image) return reasonFor(source)
    const loaded = typeof image === 'function' ? await image() : image
    if (!loaded?.body) return reasonFor(source)
    const traits = await traitsOf(loaded.body).catch(() => null)
    if (!traits) return reasonFor(source)
    const families = new Set(guideFamilies.get(source))
    index({ source, traits, families })
    await database('picture_checks').insert({
      source_url: source,
      hash: traits.hash,
      clear_share: traits.clearShare,
      families: [...families].join(' '),
      checked_at: now(),
    }).onConflict('source_url').merge().catch(() => {})
    return reasonFor(source)
  }

  const saveFamilies = async () => {
    await load()
    const changed = [...guideFamilies].filter(([source, families]) => {
      const known = checks.get(source)?.families
      return known && [...families].some((family) => !known.has(family))
    })
    for (const [source, families] of changed) {
      const known = checks.get(source).families
      for (const family of families) if (known.size < MAX_FAMILIES) known.add(family)
      await database('picture_checks').where({ source_url: source }).update({ families: [...known].join(' ') }).catch(() => {})
    }
    return changed.length
  }

  const isPlaceholder = (source) => Boolean(source && reasonFor(source))

  const placeholderSources = async () => {
    await load()
    return new Set([...new Set([...checks.keys(), ...guideFamilies.keys()])].filter(isPlaceholder))
  }

  return { check, noteTitles, saveFamilies, setLogoHashes, isPlaceholder, placeholderSources, load }
}

const clearShareOf = async (small) => {
  const { data, info } = await sharp(small)
    .resize(ALPHA_WIDTH, ALPHA_HEIGHT, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let clear = 0
  for (let at = info.channels - 1; at < data.length; at += info.channels) if (data[at] < HALF_ALPHA) clear += 1
  return clear / (info.width * info.height)
}

const fileNameOf = (source) => {
  const text = String(source ?? '')
  try {
    return decodeURIComponent(new URL(text).pathname.split('/').pop() ?? '')
  } catch {
    return text.split(/[/?#]/).pop() ?? ''
  }
}

const PLACEHOLDER_NAME = /default[_-]?program(me)?[_-]?image|(^|[_-])logo([_.-]|$)/i
const FAMILY_STOP_WORDS = new Set(['the', 'a', 'an'])
const MAX_FAMILIES = 8
const HASH_SIZE = 8
const HASH_BITS = HASH_SIZE * HASH_SIZE
const HASH_HEX_LENGTH = HASH_BITS / 4
const ZERO_HASH = '0'.repeat(HASH_HEX_LENGTH)
const MIN_LOGO_BITS = 8
const TRIM_THRESHOLD = 20
const ALPHA_WIDTH = 64
const ALPHA_HEIGHT = 36
const HALF_ALPHA = 128
const MAX_INPUT_PIXELS = 40_000_000
const SMALL_COPY_PX = 256
