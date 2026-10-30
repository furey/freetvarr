import { nextTick, onUnmounted, reactive } from '/vendor/vue.esm-browser.prod.js'
import { changedPins, createFavouriteToggle } from '/favourite-queue.js'
import { channelPrefsSaveCount, saveChannelPrefs } from '/shared/channel-prefs.js'
import { toast } from '/shared/toast.js'

export const useFavouriteToggle = ({ currentPins, applyPins, isBusy, rows, groups = null, moveMs = MOVE_MS }) => {
  const moveRows = async (pins) => {
    if (prefersReducedMotion()) return applyPins(pins)
    const moved = changedPins({ before: currentPins(), after: pins })
    const rowsOf = () => rows().filter((row) => moved.has(row.dataset.channelId))
    await fade({ els: rowsOf(), from: 1, to: 0 })
    const holder = groups?.()
    const before = holder ? groupLayoutOf({ holder, moved }) : null
    applyPins(pins)
    await nextTick()
    const arriving = rowsOf()
    arriving.forEach(hide)
    if (before) animateGroups({ holder: groups(), before, moved })
    await wait(moveMs)
    await fade({ els: arriving, from: 0, to: 1 })
    arriving.forEach((row) => { row.style.opacity = '' })
  }

  const favourites = createFavouriteToggle({
    save: (pins) => saveChannelPrefs({ pinned_ids: pins }),
    currentPins,
    applyPins: (pins, { animate }) => (animate ? moveRows(pins) : applyPins(pins)),
    isBusy,
    overrides: reactive(new Map()),
    onFailed: (err) => toast({ text: `Favourite failed: ${err.message}`, kind: 'error' }),
  })

  const toggle = (channel, event) => {
    const starred = favourites.toggle(channel)
    if (starred) pop(event?.currentTarget?.querySelector('svg'))
  }

  onUnmounted(favourites.cancel)

  const adopt = (replace, ticket = null) => favourites.adopt(replace, {
    stale: ticket !== null && ticket !== channelPrefsSaveCount(),
  })

  return { toggle, isStarred: favourites.isStarred, adopt, ticket: channelPrefsSaveCount }
}

const pop = (icon) => {
  if (!icon?.animate || prefersReducedMotion()) return
  icon.animate(POP_FRAMES, { duration: POP_MS, easing: EASE })
}

const fade = async ({ els, from, to }) => {
  const runs = els.filter((el) => el.animate).map((el) => el.animate(
    [{ opacity: from }, { opacity: to }],
    { duration: FADE_MS, easing: FADE_EASE, fill: 'forwards' },
  ))
  await Promise.all(runs.map((run) => run.finished.catch(() => {})))
}

const hide = (row) => {
  row.style.opacity = '0'
  row.getAnimations?.().forEach((run) => run.cancel())
}

const sectionsOf = (holder) => [...holder.querySelectorAll(':scope > [data-group-key]')]

const listOf = (section) => section.querySelector('[data-channel-id]')?.parentElement || null

const groupLayoutOf = ({ holder, moved }) => {
  const sections = sectionsOf(holder).map((section, index) => {
    const list = listOf(section)
    const listTop = list?.getBoundingClientRect().top ?? 0
    const offsets = new Map([...(list?.children || [])]
      .filter((row) => row.dataset.channelId && !moved.has(row.dataset.channelId))
      .map((row) => [row.dataset.channelId, row.getBoundingClientRect().top - listTop]))
    return { key: section.dataset.groupKey, index, height: section.offsetHeight, listHeight: list?.offsetHeight ?? 0, offsets }
  })
  return { sections, gap: parseFloat(getComputedStyle(holder).rowGap) || 0 }
}

const animateGroups = ({ holder, before, moved }) => {
  const now = sectionsOf(holder)
  const oldByKey = new Map(before.sections.map((s) => [s.key, s]))
  const nowKeys = new Set(now.map((section) => section.dataset.groupKey))
  now.forEach((section) => {
    const old = oldByKey.get(section.dataset.groupKey)
    if (!old) return growSection({ section, gap: before.gap })
    return reshapeList({ list: listOf(section), old, moved })
  })
  before.sections
    .filter((old) => !nowKeys.has(old.key))
    .forEach((old) => collapseGap({ holder, old, gap: before.gap }))
}

const growSection = ({ section, gap }) => {
  section.animate([
    { height: '0px', marginBottom: `${-gap}px`, overflow: 'hidden', opacity: 0 },
    { height: `${section.offsetHeight}px`, marginBottom: '0px', overflow: 'hidden', opacity: 1 },
  ], { duration: MOVE_MS, easing: EASE })
}

const reshapeList = ({ list, old, moved }) => {
  if (!list) return
  const height = list.offsetHeight
  if (height !== old.listHeight) {
    list.animate([{ height: `${old.listHeight}px` }, { height: `${height}px` }], { duration: MOVE_MS, easing: EASE })
  }
  const listTop = list.getBoundingClientRect().top
  ;[...list.children].forEach((row) => {
    const id = row.dataset.channelId
    if (!id || moved.has(id) || !old.offsets.has(id)) return
    const shift = old.offsets.get(id) - (row.getBoundingClientRect().top - listTop)
    if (Math.abs(shift) < 0.5) return
    row.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], { duration: MOVE_MS, easing: EASE })
  })
}

const collapseGap = ({ holder, old, gap }) => {
  const spacer = document.createElement('div')
  spacer.setAttribute('aria-hidden', 'true')
  holder.insertBefore(spacer, sectionsOf(holder)[old.index] || null)
  const run = spacer.animate([
    { height: `${old.height}px`, marginBottom: '0px' },
    { height: '0px', marginBottom: `${-gap}px` },
  ], { duration: MOVE_MS, easing: EASE, fill: 'forwards' })
  run.finished.catch(() => {}).then(() => spacer.remove())
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const FADE_EASE = 'cubic-bezier(0.42, 0, 0.58, 1)'
const POP_MS = 320
const FADE_MS = 220
const MOVE_MS = 300
const POP_FRAMES = [
  { transform: 'scale(1)', opacity: 0.6 },
  { transform: 'scale(1.32)', opacity: 1, offset: 0.4 },
  { transform: 'scale(1)', opacity: 1 },
]
