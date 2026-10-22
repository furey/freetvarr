import { ref, reactive } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { watchLive } from '/shared/live-session.js'
import { useProgrammeSheet } from '/shared/programme-sheet-store.js'
import { now, tz } from '/shared/time.js'
import { toast } from '/shared/toast.js'
import { twinkleGateOf } from '/for-you-twinkle.js'
import { showHrefOf } from '/show-key.js'
import {
  feedbackOf,
  sheetRequestOf,
  hiddenToastOf,
  identityOf,
  liveChannelOfItem,
  shownBatchesOf,
  tapActionOf,
} from '/for-you.js'

export const forYouHidden = ref(new Set())

const READY_KEY = 'freetvarr.forYouRail'

const readCachedReady = () => {
  try {
    return localStorage.getItem(READY_KEY) === '1'
  } catch {
    return false
  }
}

export const forYouReady = ref(readCachedReady())

export const forYouShown = ref(readCachedReady() ? true : null)

const TWINKLE_MS = 3200

const INTRO_ACTIVE_CLASS = 'is-brand-intro-active'

export const forYouTwinkling = ref(false)

let twinkled = false

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

const introActive = () => document.documentElement.classList.contains(INTRO_ACTIVE_CLASS)

const waitForIntroEnd = () => {
  const observer = new MutationObserver(() => {
    if (introActive()) return
    observer.disconnect()
    twinkleForYouOnce()
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}

const GATE_ACTIONS = {
  skip: () => {},
  'wait-visible': () => document.addEventListener('visibilitychange', twinkleForYouOnce, { once: true }),
  'wait-intro': waitForIntroEnd,
  play: () => {
    twinkled = true
    forYouTwinkling.value = true
    setTimeout(() => { forYouTwinkling.value = false }, TWINKLE_MS)
  },
}

const gateNow = () => twinkleGateOf({
  played: twinkled,
  reducedMotion: reducedMotion(),
  visible: document.visibilityState === 'visible',
  introActive: introActive(),
})

export const twinkleForYouOnce = () => setTimeout(() => GATE_ACTIONS[gateNow()](), 0)

export const keepForYouRail = ({ shown, ready }) => {
  forYouShown.value = shown
  forYouReady.value = ready
  try { localStorage.setItem(READY_KEY, shown && ready ? '1' : '0') } catch {}
}

export const sendFeedback = (body) => api('POST', '/api/events/feedback', body).catch(() => {})

export const sendShown = ({ items, source }) => shownBatchesOf({ items, source }).forEach(sendFeedback)

export const unhideShow = (seriesKey) => api('DELETE', `/api/for-you/hidden/${encodeURIComponent(seriesKey)}`)

export const useForYouActions = ({ source, isScheduled = () => false, onChanged = () => {} }) => {
  const menuItem = ref(null)
  const why = reactive({ item: null, data: null, loading: false, failed: false })
  const thumbs = ref({})

  const nowMs = () => now.value.getTime()

  const accept = (item) => sendFeedback(feedbackOf({ kind: 'suggestion_accepted', item, source }))

  const { openProgramme } = useProgrammeSheet()

  const openSheet = (item, action) => openProgramme(sheetRequestOf({ item, action, nowMs: nowMs(), timeZone: tz.value }))

  const ACTIONS = {
    'watch-live': (item) => {
      accept(item)
      watchLive({ channel: liveChannelOfItem(item), nowTitle: item.title })
    },
    'record-episode': (item) => {
      accept(item)
      openSheet(item, 'record-episode')
    },
    'record-series': (item) => {
      accept(item)
      openSheet(item, 'record-series')
    },
    'programme-info': (item) => openSheet(item, 'programme-info'),
    show: (item) => { window.location.hash = showHrefOf(item.title) },
    'thumb-up': (item) => toggleThumb(item, 'up'),
    'thumb-down': (item) => toggleThumb(item, 'down'),
    'not-interested': (item) => hide(item),
    why: (item) => openWhy(item),
  }

  const openItem = (item) => ACTIONS[tapActionOf({ item, scheduled: isScheduled(item) })]?.(item)

  const openMenu = (item) => {
    menuItem.value = item
    whyResultOf(item)
  }

  const closeMenu = () => { menuItem.value = null }

  const choose = (key, item = menuItem.value) => {
    if (!item) return
    if (!KEEPS_MENU_OPEN.has(key)) closeMenu()
    ACTIONS[key]?.(item)
  }

  const thumbOf = (item) => (item ? thumbs.value[identityOf(item)] ?? null : null)

  const toggleThumb = (item, direction) => {
    const key = identityOf(item)
    const turningOn = thumbs.value[key] !== direction
    thumbs.value = { ...thumbs.value, [key]: turningOn ? direction : null }
    if (turningOn) sendFeedback(feedbackOf({ kind: direction === 'up' ? 'thumb_up' : 'thumb_down', item, source }))
  }

  const hide = (item) => {
    const key = identityOf(item)
    closeWhy()
    forYouHidden.value = new Set([...forYouHidden.value, key])
    sendFeedback(feedbackOf({ kind: 'not_interested', item, source }))
    toast({ text: hiddenToastOf(item.title), action: { label: 'Undo', run: () => undoHide(item) } })
  }

  const undoHide = async (item) => {
    const key = identityOf(item)
    forYouHidden.value = new Set([...forYouHidden.value].filter((hidden) => hidden !== key))
    await unhideShow(key).catch(() => {})
    onChanged()
  }

  const whyRequests = new Map()

  const whyResultOf = (item) => {
    if (!whyRequests.has(item.id)) {
      const request = api('GET', `/api/for-you/why/${encodeURIComponent(item.id)}`)
        .then((data) => ({ data, failed: false }))
        .catch(() => {
          whyRequests.delete(item.id)
          return { data: null, failed: true }
        })
      whyRequests.set(item.id, request)
    }
    return whyRequests.get(item.id)
  }

  let whyWanted = null

  const openWhy = async (item) => {
    whyWanted = item
    const result = whyResultOf(item)
    const early = await Promise.race([result, delay(WHY_WAIT_MS)])
    if (whyWanted !== item) return
    Object.assign(why, { item, data: early?.data ?? null, loading: !early, failed: Boolean(early?.failed) })
    if (early) return
    const late = await result
    if (why.item === item) Object.assign(why, { data: late.data, loading: false, failed: late.failed })
  }

  const closeWhy = () => {
    whyWanted = null
    why.item = null
  }

  return { menuItem, why, openItem, openMenu, closeMenu, choose, thumbOf, closeWhy, undoHide, isScheduled }
}

const KEEPS_MENU_OPEN = new Set(['thumb-up', 'thumb-down'])

const WHY_WAIT_MS = 1200

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
