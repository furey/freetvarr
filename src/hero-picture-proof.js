import crypto from 'crypto'
import sharp from 'sharp'

import { withHeroWidth } from './web/home-hero.js'

export const HERO_PROOF_WIDTH = 1920
export const HERO_WARM_WIDTHS = [768, 1280]
export const MIN_HERO_PICTURE_WIDTH = 640
export const PROOF_PASS_TTL_MS = 6 * 60 * 60 * 1000
export const PROOF_FAIL_TTL_MS = 30 * 60 * 1000

export const createHeroPictureProof = ({
  resolve,
  measure = pictureWidthOf,
  noteServed = () => {},
  now = Date.now,
  yieldTurn = nextTurn,
  passTtlMs = PROOF_PASS_TTL_MS,
  failTtlMs = PROOF_FAIL_TTL_MS,
  minWidth = MIN_HERO_PICTURE_WIDTH,
  maxRemembered = MAX_REMEMBERED,
}) => {
  const verdicts = new Map()

  const remembered = (key) => {
    const saved = verdicts.get(key)
    if (!saved) return null
    if (saved.expiresAt > now()) return saved.verdict
    verdicts.delete(key)
    return null
  }

  const remember = ({ key, verdict, ttlMs }) => {
    verdicts.delete(key)
    verdicts.set(key, { verdict, expiresAt: now() + ttlMs })
    while (verdicts.size > maxRemembered) verdicts.delete(verdicts.keys().next().value)
    return verdict
  }

  const resolveAt = async (url, width) => {
    await yieldTurn()
    return Promise.resolve()
      .then(() => resolve(withHeroWidth(url, width)))
      .catch(() => ({ image: null, pending: false }))
  }

  const warm = async (url) => {
    for (const width of HERO_WARM_WIDTHS) await resolveAt(url, width)
  }

  const prove = async (url) => {
    const { image, pending } = await resolveAt(url, HERO_PROOF_WIDTH)
    if (!image) return pending ? PENDING : { status: 'missing', width: 0 }
    const width = isPicture(image) ? await Promise.resolve().then(() => measure(image)).catch(() => 0) : 0
    if (width < minWidth) return { status: width ? 'too-small' : 'unreadable', width }
    noteServed({ url: withHeroWidth(url, HERO_PROOF_WIDTH), body: image.body })
    await warm(url)
    return { status: 'pass', width, contentKey: contentKeyOf(image.body) }
  }

  const proofHeroPicture = async (url) => {
    if (!url) return { status: 'missing', width: 0 }
    const key = proofKeyOf(url)
    const known = remembered(key)
    if (known) return known
    const verdict = await prove(url)
    if (verdict.status === 'pending') return verdict
    return remember({ key, verdict, ttlMs: verdict.status === 'pass' ? passTtlMs : failTtlMs })
  }

  const forget = () => verdicts.clear()

  return { proofHeroPicture, forget }
}

export const isProven = (verdict) => verdict?.status === 'pass'

export const proofKeyOf = (url) => withHeroWidth(url, HERO_PROOF_WIDTH)

export const pictureWidthOf = async (image) => (await sharp(image.body).metadata()).width ?? 0

const contentKeyOf = (body) => crypto.createHash('sha1').update(body).digest('hex').slice(0, 16)

const isPicture = (image) => /^image\//.test(String(image.contentType || '')) && image.body?.length > 0

const nextTurn = () => new Promise((resolve) => setImmediate(resolve))

const PENDING = { status: 'pending', width: 0 }
const MAX_REMEMBERED = 2000
