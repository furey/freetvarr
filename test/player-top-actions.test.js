import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  topBarLayoutOf,
  optionalWidthOf,
  menuOrderOf,
  HEADING_MIN_SHARE,
  ICON_PILL_WIDTH,
  ROUND_WIDTH,
  LOGO_WIDTH,
  LABELLED_PILL_WIDTHS,
  EARLY_COMPACT,
  LATE_COMPACT,
} from '../src/web/player-top-actions.js'

const livePinned = [
  { key: 'record', width: LABELLED_PILL_WIDTHS.record, compactWidth: ICON_PILL_WIDTH, compactAt: LATE_COMPACT },
  { key: 'sound', width: ICON_PILL_WIDTH },
  { key: 'more', width: ROUND_WIDTH },
]

const liveOptional = [
  { key: 'info', width: ICON_PILL_WIDTH },
  { key: 'series', width: ICON_PILL_WIDTH },
  { key: 'minimise', width: ROUND_WIDTH },
  { key: 'multiview', width: ICON_PILL_WIDTH },
]

const phoneBar = { gap: 10, actionsGap: 8, logoWidth: LOGO_WIDTH }

test('a 393 px phone keeps only Record, Sound, and More on the live bar', () => {
  const layout = topBarLayoutOf({ ...phoneBar, barWidth: 361, pinned: livePinned, optional: liveOptional })
  assert.deepEqual(layout.inline, [])
  assert.deepEqual(layout.overflow, ['info', 'series', 'minimise', 'multiview'])
  assert.deepEqual(layout.compact, ['record'])
  assert.equal(layout.showLogo, false)
})

test('a landscape phone hides the Sound label before it moves Info and Series off the bar', () => {
  const pinned = [
    livePinned[0],
    { key: 'sound', width: LABELLED_PILL_WIDTHS.sound, compactWidth: ICON_PILL_WIDTH, compactAt: EARLY_COMPACT },
    livePinned[2],
  ]
  const layout = topBarLayoutOf({ gap: 14, actionsGap: 10, logoWidth: LOGO_WIDTH, barWidth: 820, pinned, optional: liveOptional })
  assert.deepEqual(layout.inline, ['info', 'series'])
  assert.deepEqual(layout.compact, ['sound'])
  assert.equal(layout.showLogo, true)
})

test('wider bars keep the most important actions inline and move the rest', () => {
  const tablet = topBarLayoutOf({ ...phoneBar, barWidth: 1000, pinned: livePinned, optional: liveOptional })
  assert.deepEqual(tablet.inline, ['info', 'series', 'minimise', 'multiview'])
  assert.deepEqual(tablet.compact, [])
  assert.equal(tablet.showLogo, true)
  const landscapePhone = topBarLayoutOf({ ...phoneBar, barWidth: 820, pinned: livePinned, optional: liveOptional })
  assert.deepEqual(landscapePhone.inline, ['info', 'series'])
  assert.deepEqual(landscapePhone.overflow, ['minimise', 'multiview'])
  const narrow = topBarLayoutOf({ ...phoneBar, barWidth: 600, pinned: livePinned, optional: liveOptional })
  assert.deepEqual(narrow.inline, [])
  assert.deepEqual(narrow.compact, ['record'])
  assert.equal(narrow.showLogo, true)
})

test('the heading keeps at least the minimum share whenever a layout can give it', () => {
  for (const barWidth of [420, 500, 600, 700, 900, 1200]) {
    const layout = topBarLayoutOf({ ...phoneBar, barWidth, pinned: livePinned, optional: liveOptional })
    const inlineWidth = liveOptional.filter((a) => layout.inline.includes(a.key)).reduce((sum, a) => sum + a.width + 8, 0)
    const pinnedWidth = livePinned.reduce((sum, a) => sum + (layout.compact.includes(a.key) ? a.compactWidth : a.width) + 8, -8)
    const lead = ROUND_WIDTH + 10 + (layout.showLogo ? LOGO_WIDTH + 10 : 0) + 10
    assert.ok(barWidth - lead - inlineWidth - pinnedWidth >= barWidth * HEADING_MIN_SHARE, `at ${barWidth}px`)
  }
})

test('the recording bar on a phone moves every optional action and drops the logo for the title', () => {
  const layout = topBarLayoutOf({
    ...phoneBar,
    barWidth: 361,
    pinned: [{ key: 'sound', width: ICON_PILL_WIDTH }, { key: 'more', width: ROUND_WIDTH }],
    optional: [{ key: 'info', width: ICON_PILL_WIDTH }, { key: 'airplay', width: ICON_PILL_WIDTH }, { key: 'minimise', width: ROUND_WIDTH }],
  })
  assert.deepEqual(layout.inline, [])
  assert.deepEqual(layout.overflow, ['info', 'airplay', 'minimise'])
  assert.deepEqual(layout.compact, [])
  assert.equal(layout.showLogo, false)
})

test('a wide desktop bar keeps every action inline', () => {
  const layout = topBarLayoutOf({ ...phoneBar, barWidth: 1300, pinned: livePinned, optional: liveOptional })
  assert.deepEqual(layout.overflow, [])
  assert.equal(layout.showLogo, true)
})

test('pill widths follow whether labels show', () => {
  assert.equal(optionalWidthOf({ key: 'info' }), ICON_PILL_WIDTH)
  assert.equal(optionalWidthOf({ key: 'info', labelled: true }), LABELLED_PILL_WIDTHS.info)
  assert.equal(optionalWidthOf({ key: 'minimise', round: true, labelled: true }), ROUND_WIDTH)
})

test('moved actions list in menu order whatever order they overflow in', () => {
  assert.deepEqual(menuOrderOf(['multiview', 'minimise', 'info', 'series']), ['info', 'series', 'multiview', 'minimise'])
  assert.deepEqual(menuOrderOf(['minimise', 'airplay', 'info']), ['info', 'minimise', 'airplay'])
})
