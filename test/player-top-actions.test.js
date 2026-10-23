import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  topBarActionsOf,
  topBarLayoutOf,
  optionalWidthOf,
  menuOrderOf,
  moreMenuKeysOf,
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

test('the More menu holds only the actions that do not fit the bar, in menu order', () => {
  assert.deepEqual(moreMenuKeysOf({ overflow: [] }), [])
  assert.deepEqual(moreMenuKeysOf({ overflow: ['multiview', 'minimise', 'info'] }), ['info', 'multiview', 'minimise'])
  assert.deepEqual(moreMenuKeysOf({ overflow: ['multiview'] }), ['multiview'])
})

test('a labelled Miniplayer drops to the menu after Multiview and before Series', () => {
  const optional = [
    { key: 'info', width: LABELLED_PILL_WIDTHS.info },
    { key: 'series', width: LABELLED_PILL_WIDTHS.series },
    { key: 'minimise', width: LABELLED_PILL_WIDTHS.minimise },
    { key: 'multiview', width: LABELLED_PILL_WIDTHS.multiview },
  ]
  const pinned = [
    { key: 'record', width: LABELLED_PILL_WIDTHS.record, compactWidth: ICON_PILL_WIDTH, compactAt: LATE_COMPACT },
    { key: 'sound', width: ROUND_WIDTH },
    { key: 'more', width: ROUND_WIDTH },
  ]
  const overflowAt = (barWidth) => topBarLayoutOf({ gap: 14, actionsGap: 10, logoWidth: LOGO_WIDTH, barWidth, pinned, optional }).overflow
  assert.deepEqual(overflowAt(1600), [])
  const shrinking = [1400, 1300, 1200, 1100, 1000, 900, 800].map(overflowAt)
  assert.ok(shrinking.some((overflow) => overflow.length === 2))
  for (const overflow of shrinking) {
    const order = ['multiview', 'minimise', 'series', 'info'].slice(0, overflow.length)
    assert.deepEqual([...overflow].sort(), [...order].sort())
  }
})

test('topBarActionsOf adds Miniplayer and Info after the player actions', () => {
  const actions = topBarActionsOf({
    actions: [{ key: 'series' }, { key: 'multiview', hidden: true }], canMinimise: true, infoOpen: true, infoId: 'live-info',
  })
  assert.deepEqual(actions.map((action) => action.key), ['series', 'minimise', 'info'])
  assert.equal(actions.at(-1).pressed, true)
  assert.equal(actions.at(-1).controls, 'live-info')
})

test('topBarActionsOf drops every optional action before playback starts', () => {
  assert.deepEqual(topBarActionsOf({ actions: [{ key: 'series' }], canMinimise: true, infoOpen: false, infoId: 'live-info', prePlay: true }), [])
})
