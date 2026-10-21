import { api } from '/shared/api.js'
import { ATTENTION_MEDIA_EVENTS, ATTENTION_SAMPLE_MS, attentionChangesOf, attentionPathOf, isAttending } from '/attention.js'

const sources = new Set()
let sent = new Map()
let isSharedScreen = () => false

export const addAttentionSource = (source) => {
  sources.add(source)
}

export const setSharedScreen = (check) => {
  isSharedScreen = check
}

export const reportAttention = () => {
  const shared = isSharedScreen()
  const current = [...sources].flatMap((source) => source()).map(({ kind, sessionId, video, captions, picture }) => ({
    kind, sessionId, attending: isAttending({ visible: isVisible(video), video, captions, shared: Boolean(picture) && shared }),
  }))
  const outcome = attentionChangesOf({ sent, current })
  sent = outcome.sent
  for (const change of outcome.changes) {
    api('POST', attentionPathOf(change), { attending: change.attending }).catch(() => {})
  }
}

const isVisible = (video) =>
  document.visibilityState === 'visible' || (Boolean(video) && document.pictureInPictureElement === video)

setInterval(reportAttention, ATTENTION_SAMPLE_MS)
document.addEventListener('visibilitychange', reportAttention)
for (const type of ATTENTION_MEDIA_EVENTS) document.addEventListener(type, reportAttention, true)
