import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  topBarActionsOf,
  topBarLayoutOf,
  optionalWidthOf,
  menuOrderOf,
  moreMenuKeysOf,
  HEADING_MIN_SHARE,
  BASE_ROW_MIN_SUMMARY_WIDTH,
  miniplayerFitsBaseRowOf,
  ICON_PILL_WIDTH,
  ROUND_WIDTH,
  LOGO_WIDTH,
  LABELLED_PILL_WIDTHS,
  LATE_COMPACT,
} from '../src/web/player-top-actions.js'

const livePinned = [
  { key: 'record', width: LABELLED_PILL_WIDTHS.record, compactWidth: ICON_PILL_WIDTH, compactAt: LATE_COMPACT },
  { key: 'sound', width: ROUND_WIDTH },
  { key: 'more', width: ROUND_WIDTH },
]

const liveOptional = [
  { key: 'series', width: ROUND_WIDTH },
  { key: 'multiview', width: ROUND_WIDTH },
]

const phoneBar = { gap: 10, actionsGap: 8, logoWidth: LOGO_WIDTH }

test('a 393 px phone keeps only Record, Sound, and More on the live bar', () => {
  const layout = topBarLayoutOf({ ...phoneBar, barWidth: 361, pinned: livePinned, optional: liveOptional })
  assert.deepEqual(layout.inline, [])
  assert.deepEqual(layout.overflow, ['series', 'multiview'])
  assert.deepEqual(layout.compact, ['record'])
  assert.equal(layout.showLogo, false)
})

test('a landscape phone keeps Series and Multiview on the bar', () => {
  const layout = topBarLayoutOf({ ...phoneBar, barWidth: 812, pinned: livePinned, optional: liveOptional })
  assert.deepEqual(layout.inline, ['series', 'multiview'])
  assert.deepEqual(layout.overflow, [])
  assert.equal(layout.showLogo, true)
})

test('narrower bars keep the most important actions inline and move the rest', () => {
  const medium = topBarLayoutOf({ ...phoneBar, barWidth: 736, pinned: livePinned, optional: liveOptional })
  assert.deepEqual(medium.inline, ['series'])
  assert.deepEqual(medium.overflow, ['multiview'])
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

test('the recording bar on a phone moves AirPlay and drops the logo for the title', () => {
  const layout = topBarLayoutOf({
    ...phoneBar,
    barWidth: 361,
    pinned: [{ key: 'sound', width: ROUND_WIDTH }, { key: 'more', width: ROUND_WIDTH }],
    optional: [{ key: 'airplay', width: ROUND_WIDTH }],
  })
  assert.deepEqual(layout.overflow, ['airplay'])
  assert.equal(layout.showLogo, false)
})

test('a wide desktop bar keeps every action inline', () => {
  const layout = topBarLayoutOf({ ...phoneBar, barWidth: 1300, pinned: livePinned, optional: liveOptional })
  assert.deepEqual(layout.overflow, [])
  assert.equal(layout.showLogo, true)
})

test('pill widths follow whether labels show, and an unlabelled pill is a round button', () => {
  assert.equal(optionalWidthOf({ key: 'series' }), ROUND_WIDTH)
  assert.equal(optionalWidthOf({ key: 'series', labelled: true }), LABELLED_PILL_WIDTHS.series)
  assert.equal(optionalWidthOf({ key: 'airplay', round: true, labelled: true }), ROUND_WIDTH)
})

test('moved actions list in menu order whatever order they overflow in', () => {
  assert.deepEqual(menuOrderOf(['multiview', 'airplay', 'series']), ['series', 'multiview', 'airplay'])
})

test('the More menu holds only the actions that do not fit the bar, in menu order', () => {
  assert.deepEqual(moreMenuKeysOf({ overflow: [] }), [])
  assert.deepEqual(moreMenuKeysOf({ overflow: ['multiview', 'series'] }), ['series', 'multiview'])
})

test('labelled pills keep Multiview on a desktop bar from 1150 px wide', () => {
  const optional = [
    { key: 'series', width: LABELLED_PILL_WIDTHS.series },
    { key: 'multiview', width: LABELLED_PILL_WIDTHS.multiview },
  ]
  const overflowAt = (frameWidth) => topBarLayoutOf({
    gap: 14, actionsGap: 10, logoWidth: LOGO_WIDTH, barWidth: frameWidth - 56, pinned: livePinned, optional,
  }).overflow
  assert.deepEqual(overflowAt(1151), [])
  assert.deepEqual(overflowAt(1280), [])
  assert.deepEqual(overflowAt(1440), [])
  assert.deepEqual(overflowAt(1140), ['multiview'])
})

test('topBarActionsOf keeps the player actions and never adds Miniplayer', () => {
  const actions = topBarActionsOf({ actions: [{ key: 'series' }, { key: 'multiview', hidden: true }] })
  assert.deepEqual(actions.map((action) => action.key), ['series'])
})

test('topBarActionsOf drops every optional action before playback starts', () => {
  assert.deepEqual(topBarActionsOf({ actions: [{ key: 'series' }], prePlay: true }), [])
})

test('Miniplayer joins the base row while the summary keeps at least 140 px', () => {
  assert.equal(BASE_ROW_MIN_SUMMARY_WIDTH, 140)
  assert.equal(miniplayerFitsBaseRowOf({ rowWidth: 358 }), true)
  assert.equal(miniplayerFitsBaseRowOf({ rowWidth: 352 }), true)
  assert.equal(miniplayerFitsBaseRowOf({ rowWidth: 351 }), false)
  assert.equal(miniplayerFitsBaseRowOf({ rowWidth: 288 }), false)
  assert.equal(miniplayerFitsBaseRowOf({ rowWidth: 0 }), false)
})
