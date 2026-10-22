import crypto from 'crypto'
import sharp from 'sharp'

import { withHeroWidth } from './web/home-hero.js'
import { focusKeyOf } from './web/image-focus.js'

export const HERO_PROOF_WIDTH = 1920
export const HERO_WARM_WIDTHS = [768, 1280]
export const MIN_HERO_PICTURE_WIDTH = 640
export const PROOF_PASS_TTL_MS = 6 * 60 * 60 * 1000
export const PROOF_FAIL_TTL_MS = 30 * 60 * 1000

export const createHeroPictureProof = ({
  resolve,
  measure = pictureWidthOf,
  noteServed = () => {},
  focusStatusOf = async () => SETTLED_WITHOUT_FOCUS,
  onFocusWaitOver = () => {},
  now = Date.now,
  yieldTurn = nextTurn,
  passTtlMs = PROOF_PASS_TTL_MS,
  failTtlMs = PROOF_FAIL_TTL_MS,
  minWidth = MIN_HERO_PICTURE_WIDTH,
  maxRemembered = MAX_REMEMBERED,
}) => {
  const verdicts = new Map()
  const waitingFocus = new Set()

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
    const proofUrl = withHeroWidth(url, HERO_PROOF_WIDTH)
    noteServed({ url: proofUrl, body: image.body })
    await warm(url)
    const focus = await Promise.resolve().then(() => focusStatusOf(proofUrl)).catch(() => SETTLED_WITHOUT_FOCUS)
    if (!focus?.settled) {
      waitingFocus.add(focusKeyOf(proofUrl))
      return { status: 'pending', reason: 'focus', width }
    }
    return { status: 'pass', width, contentKey: contentKeyOf(image.body), focus: focus.focus ?? null }
  }

  const focusSettled = (key) => {
    if (waitingFocus.delete(key)) onFocusWaitOver(key)
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

  return { proofHeroPicture, focusSettled, forget }
}

export const isProven = (verdict) => verdict?.status === 'pass'

export const proofKeyOf = (url) => withHeroWidth(url, HERO_PROOF_WIDTH)

export const pictureWidthOf = async (image) => (await sharp(image.body).metadata()).width ?? 0

const contentKeyOf = (body) => crypto.createHash('sha1').update(body).digest('hex').slice(0, 16)

const isPicture = (image) => /^image\//.test(String(image.contentType || '')) && image.body?.length > 0

const nextTurn = () => new Promise((resolve) => setImmediate(resolve))

const PENDING = { status: 'pending', width: 0 }
const SETTLED_WITHOUT_FOCUS = { settled: true, focus: null }
const MAX_REMEMBERED = 2000
