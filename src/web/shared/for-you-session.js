import { ref, reactive } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { watchLive } from '/shared/live-session.js'
import { useProgrammeSheet } from '/shared/programme-sheet-store.js'
import { now, tz } from '/shared/time.js'
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

const TOAST_MS = 6000

export const forYouHidden = ref(new Set())

export const sendFeedback = (body) => api('POST', '/api/events/feedback', body).catch(() => {})

export const sendShown = ({ items, source }) => shownBatchesOf({ items, source }).forEach(sendFeedback)

export const unhideShow = (seriesKey) => api('DELETE', `/api/for-you/hidden/${encodeURIComponent(seriesKey)}`)

export const useForYouActions = ({ source, isScheduled = () => false, onChanged = () => {} }) => {
  const menuItem = ref(null)
  const why = reactive({ item: null, data: null, loading: false, failed: false })
  const toast = ref(null)
  const thumbs = ref({})
  let toastTimer = null

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
    notify: (item) => {
      accept(item)
      openSheet(item, 'notify')
    },
    show: (item) => { window.location.hash = showHrefOf(item.title) },
    'thumb-up': (item) => toggleThumb(item, 'up'),
    'thumb-down': (item) => toggleThumb(item, 'down'),
    'not-interested': (item) => hide(item),
    why: (item) => openWhy(item),
  }

  const openItem = (item) => ACTIONS[tapActionOf({ item, scheduled: isScheduled(item) })]?.(item)

  const openMenu = (item) => { menuItem.value = item }

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

  const showToast = (value) => {
    clearTimeout(toastTimer)
    toast.value = value
    toastTimer = setTimeout(() => { toast.value = null }, TOAST_MS)
  }

  const hide = (item) => {
    const key = identityOf(item)
    closeWhy()
    forYouHidden.value = new Set([...forYouHidden.value, key])
    sendFeedback(feedbackOf({ kind: 'not_interested', item, source }))
    showToast({ text: hiddenToastOf(item.title), item })
  }

  const undoHide = async () => {
    const item = toast.value?.item
    clearTimeout(toastTimer)
    toast.value = null
    if (!item) return
    const key = identityOf(item)
    forYouHidden.value = new Set([...forYouHidden.value].filter((hidden) => hidden !== key))
    await unhideShow(key).catch(() => {})
    onChanged()
  }

  const openWhy = async (item) => {
    Object.assign(why, { item, data: null, loading: true, failed: false })
    try {
      const data = await api('GET', `/api/for-you/why/${encodeURIComponent(item.id)}`)
      if (why.item === item) why.data = data
    } catch {
      if (why.item === item) why.failed = true
    } finally {
      if (why.item === item) why.loading = false
    }
  }

  const closeWhy = () => { why.item = null }

  return { menuItem, why, toast, openItem, openMenu, closeMenu, choose, thumbOf, closeWhy, undoHide, isScheduled }
}

const KEEPS_MENU_OPEN = new Set(['thumb-up', 'thumb-down'])
