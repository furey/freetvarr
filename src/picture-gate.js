import { PLEX_ORIGIN_PREFIX, RECORDING_ORIGIN_PREFIX, UPLOAD_ORIGIN_PREFIX } from './artwork-choices.js'
import { isFrameOrigin } from './frame-grabs.js'
import { isGuidePictureOrigin } from './guide-pictures.js'
import {
  OK_VERDICT,
  STAND_IN_VERDICT,
  WEAK_VERDICT,
  createPlaceholderPictures,
} from './picture-placeholders.js'

export { OK_VERDICT, STAND_IN_VERDICT, WEAK_VERDICT }

export const GATE_RULE_VERSION = 'gate-1'

export const pictureChecks = createPlaceholderPictures()

export const createPictureGate = ({
  checks = pictureChecks,
  readers = {},
  guideCopySourceOf = async () => null,
  recordingSourceOf = async () => null,
  isUnscreenedSource = () => false,
}) => {
  const screen = async (origin, { bytes = null, title = null } = {}) => {
    const subject = await subjectOf(String(origin ?? ''))
    if (!subject) return OK_JUDGEMENT
    const image = bytes ? { body: bytes } : () => readOf(origin).catch(() => null)
    return checks.judge({ source: subject.key, name: subject.name, title, image })
  }

  const load = async (origin) => {
    const image = await readOf(origin)
    if (!image?.body) return image
    const { verdict } = await screen(origin, { bytes: image.body })
    if (verdict === STAND_IN_VERDICT) return null
    return verdict === WEAK_VERDICT ? { ...image, verdict } : image
  }

  const knownVerdict = async (origin) => {
    const subject = await subjectOf(String(origin ?? '')).catch(() => null)
    if (!subject) return OK_VERDICT
    await checks.load()
    return checks.verdictOf(subject.key, { name: subject.name }).verdict
  }

  const loadOwnerChoice = (origin) => readOf(origin).catch(() => null)

  const servedThumbnail = async ({ origin, thumbnails, key, width, loadOriginal, ownerChoice = false }) => {
    if (!ownerChoice && await knownVerdict(origin).catch(() => OK_VERDICT) === STAND_IN_VERDICT) return null
    return thumbnails.thumbnailFor({ key, width, loadOriginal })
  }

  const subjectOf = async (origin) => {
    if (!origin || isOwnOrigin(origin)) return null
    if (isGuidePictureOrigin(origin)) {
      const source = await guideCopySourceOf(origin)
      return source && !isUnscreenedSource(source) ? { key: source, name: null } : null
    }
    if (origin.startsWith(RECORDING_ORIGIN_PREFIX)) {
      const name = await recordingSourceOf(origin.slice(RECORDING_ORIGIN_PREFIX.length)).catch(() => null)
      return { key: origin, name: name || null }
    }
    return isUnscreenedSource(origin) ? null : { key: origin, name: null }
  }

  const readOf = async (origin) => {
    const text = String(origin ?? '')
    if (text.startsWith(UPLOAD_ORIGIN_PREFIX)) return readers.upload(text)
    if (isFrameOrigin(text)) return readers.frame(text)
    if (isGuidePictureOrigin(text)) return readers.guideCopy(text)
    if (text.startsWith(RECORDING_ORIGIN_PREFIX)) return readers.recording(text.slice(RECORDING_ORIGIN_PREFIX.length))
    if (text.startsWith(PLEX_ORIGIN_PREFIX)) return readers.plex(text)
    return readers.url(text)
  }

  return { screen, load, knownVerdict, loadOwnerChoice, servedThumbnail }
}

const isOwnOrigin = (origin) => origin.startsWith(UPLOAD_ORIGIN_PREFIX) || origin.startsWith(PLEX_ORIGIN_PREFIX) || isFrameOrigin(origin)

const OK_JUDGEMENT = Object.freeze({ verdict: OK_VERDICT, reason: null })
