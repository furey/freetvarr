import { nextTick, onUnmounted, reactive } from '/vendor/vue.esm-browser.prod.js'
import { changedPins, createFavouriteToggle } from '/favourite-queue.js'
import { saveChannelPrefs } from '/shared/channel-prefs.js'
import { toast } from '/shared/toast.js'

export const useFavouriteToggle = ({ currentPins, applyPins, isBusy, flipRows = null }) => {
  const favourites = createFavouriteToggle({
    save: (pins) => saveChannelPrefs({ pinned_ids: pins }),
    currentPins,
    applyPins: (pins, { animate }) => (animate && flipRows ? flipMove({ pins, rows: flipRows }) : applyPins(pins)),
    isBusy,
    overrides: reactive(new Map()),
    onFailed: (err) => toast({ text: `Favourite failed: ${err.message}`, kind: 'error' }),
  })

  const flipMove = async ({ pins, rows }) => {
    const moved = changedPins({ before: currentPins(), after: pins })
    if (prefersReducedMotion()) return applyPins(pins)
    const before = rectsOf(rows())
    applyPins(pins)
    await nextTick()
    playMoves({ rows: rows(), before, moved })
  }

  const toggle = (channel, event) => {
    const starred = favourites.toggle(channel)
    if (starred) pop(event?.currentTarget?.querySelector('svg'))
  }

  onUnmounted(favourites.cancel)

  return { toggle, isStarred: favourites.isStarred, adopt: favourites.adopt }
}

const pop = (icon) => {
  if (!icon?.animate || prefersReducedMotion()) return
  icon.animate(POP_FRAMES, { duration: POP_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
}

const rectsOf = (rows) => new Map(rows.map((row) => [row.dataset.channelId, row.getBoundingClientRect().top]))

const playMoves = ({ rows, before, moved }) => {
  const viewHeight = window.innerHeight
  const shifts = rows
    .map((row) => ({ row, from: before.get(row.dataset.channelId), to: row.getBoundingClientRect().top }))
    .filter(({ from, to }) => from != null && from !== to && isNearView({ from, to, viewHeight }))
  shifts.forEach(({ row, from, to }) => {
    row.style.transition = 'none'
    row.style.transform = `translateY(${from - to}px)`
    if (moved.has(row.dataset.channelId)) row.classList.add('is-favourite-moving')
  })
  if (!shifts.length) return
  const lists = new Set(shifts.map(({ row }) => row.parentElement))
  lists.forEach((list) => list.classList.add('is-favourite-flip'))
  shifts[0].row.getBoundingClientRect()
  requestAnimationFrame(() => shifts.forEach(({ row }) => {
    row.style.transition = `transform ${MOVE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
    row.style.transform = ''
  }))
  setTimeout(() => {
    shifts.forEach(({ row }) => clearMove(row))
    lists.forEach((list) => list.classList.remove('is-favourite-flip'))
  }, MOVE_MS + 100)
}

const clearMove = (row) => {
  row.style.transition = ''
  row.style.transform = ''
  row.classList.remove('is-favourite-moving')
}

const isNearView = ({ from, to, viewHeight }) =>
  Math.max(from, to) > -viewHeight && Math.min(from, to) < viewHeight * 2

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

const POP_MS = 320
const MOVE_MS = 320
const POP_FRAMES = [
  { transform: 'scale(1)', opacity: 0.6 },
  { transform: 'scale(1.32)', opacity: 1, offset: 0.4 },
  { transform: 'scale(1)', opacity: 1 },
]
