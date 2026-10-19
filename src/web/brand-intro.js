export const INTRO_DAY_KEY = 'freetvarr.introPlayedOn'
export const INTRO_SESSION_KEY = 'freetvarr.introPlayed'
export const INTRO_DESIGN_FONT_PX = 84
export const INTRO_STAGGER_MS = 40

export const localDay = (date) => [
  date.getFullYear(),
  pad(date.getMonth() + 1),
  pad(date.getDate()),
].join('-')

export const shouldPlayIntro = ({ reducedMotion, hidden, playedThisSession, lastPlayedOn, today }) => {
  if (reducedMotion || hidden) return false
  return !playedThisSession || lastPlayedOn !== today
}

export const readIntroMemory = ({ local, session }) => ({
  playedThisSession: readKey({ storageOf: session, key: INTRO_SESSION_KEY }) === '1',
  lastPlayedOn: readKey({ storageOf: local, key: INTRO_DAY_KEY }),
})

export const rememberIntroPlayed = ({ local, session, today }) => {
  writeKey({ storageOf: session, key: INTRO_SESSION_KEY, value: '1' })
  writeKey({ storageOf: local, key: INTRO_DAY_KEY, value: today })
}

export const introGeometry = ({ fontSize, ink, wordWidth, segments }) => {
  const unit = fontSize / INTRO_DESIGN_FONT_PX
  const chip = { width: 48 * unit, height: 36 * unit, gap: 16 * unit }
  const baseline = (fontSize - ink.fontHeight) / 2 + ink.fontAscent
  const clipHeight = baseline + 3 * unit
  const barHeight = 6 * unit
  const barCenterY = clipHeight + 2 * unit + barHeight / 2
  const markCenterY = baseline - ink.cap / 2
  const markLeft = wordWidth / 2 - (chip.width * 1.5 + chip.gap)
  return {
    clipHeight,
    chips: segments.map(({ left, width }, index) => {
      const markCenterX = markLeft + index * (chip.width + chip.gap) + chip.width / 2
      return {
        left: (width - chip.width) / 2,
        top: barCenterY - chip.height / 2,
        width: chip.width,
        height: chip.height,
        radius: 4 * unit,
        dx: markCenterX - (left + width / 2),
        dy: markCenterY - barCenterY,
        bob: 14 * unit,
        sx: (width - 4 * unit) / chip.width,
        sy: barHeight / chip.height,
        delayMs: index * INTRO_STAGGER_MS,
      }
    }),
  }
}

export const flightTransform = ({ from, to }) => {
  const scale = to.width / from.width
  return { x: to.left - from.left, y: to.top - from.top, scale }
}

const pad = (value) => String(value).padStart(2, '0')

const readKey = ({ storageOf, key }) => {
  try {
    return storageOf()?.getItem(key) ?? null
  } catch {
    return null
  }
}

const writeKey = ({ storageOf, key, value }) => {
  try {
    storageOf()?.setItem(key, value)
  } catch {}
}
