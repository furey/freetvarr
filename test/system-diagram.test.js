import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PIECES,
  EDGES,
  TOUR_STEPS,
  cardShiftOf,
  diagramHrefOf,
  diagramMarkup,
  focusedPieceOf,
  pieceById,
  pieceStatuses,
  selectionFocusOf,
  tourFocusOf,
  tourPanTransform,
  statusPartsOf,
  tourStepView,
} from '../src/web/system-diagram.js'
import { settingsPageOf } from '../src/web/settings-pages.js'
import { resolveRoute } from '../src/web/route-table.js'

test('PIECES and EDGES: every edge joins two known pieces, and ids are unique', () => {
  const ids = PIECES.map((piece) => piece.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const edge of EDGES) {
    assert.ok(pieceById(edge.from), edge.id)
    assert.ok(pieceById(edge.to), edge.id)
  }
})

test('PIECES: every settings link opens a Settings page', () => {
  for (const piece of PIECES) {
    for (const link of piece.links) {
      const { view, params } = resolveRoute(link.href)
      assert.equal(view, 'settings', link.href)
      assert.ok(settingsPageOf({ params, narrow: true }), link.href)
    }
  }
})

test('TOUR_STEPS: ten steps, framed by an overview and a summary that ends setup', () => {
  assert.equal(TOUR_STEPS.length, 10)
  assert.equal(TOUR_STEPS[0].piece, undefined)
  assert.equal(TOUR_STEPS.at(-1).last, true)
  const pieces = TOUR_STEPS.filter((step) => step.piece).map((step) => step.piece)
  assert.deepEqual(pieces, ['aerial', 'tuner', 'tvheadend', 'recordings', 'freetvarr', 'library', 'player', 'screens'])
  for (const step of TOUR_STEPS) {
    for (const edge of [step.from, step.also].filter(Boolean)) assert.ok(EDGES.some((known) => known.id === edge), edge)
  }
})

test('tourStepView: a piece step shows its title, pills, function, and existing setup', () => {
  const view = tourStepView({ index: 3 })
  assert.equal(view.title, 'TVHeadend')
  assert.equal(view.caption, 'System diagram · 4 of 10')
  assert.deepEqual(view.pills, [
    { text: 'Required', quiet: false },
    { text: 'Installed by the install script', quiet: true },
  ])
  assert.match(view.text, /^Controls the tuner/)
  assert.match(view.own, /existing TVHeadend server/)
  assert.equal(view.nextLabel, 'Next')
  assert.equal(view.canGoBack, true)
})

test('tourStepView: the first step cannot go back and the last step starts setup', () => {
  const first = tourStepView({ index: 0 })
  assert.equal(first.title, 'Components')
  assert.equal(first.canGoBack, false)
  assert.deepEqual(first.pills, [])
  const last = tourStepView({ index: 9 })
  assert.equal(last.nextLabel, 'Start setup')
  assert.equal(last.isLast, true)
  assert.match(last.text, /Settings → System diagram/)
})

test('tourStepView: an optional piece gets a quiet need pill', () => {
  assert.deepEqual(tourStepView({ index: 7 }).pills[0], { text: 'Optional', quiet: true })
})

test('tourFocusOf: lights the step, its extras, and the edges it arrives on', () => {
  assert.deepEqual(tourFocusOf(TOUR_STEPS[3]), {
    ids: ['tvheadend', 'guide'],
    current: 'tvheadend',
    edges: ['tuner-tvheadend', 'guide-tvheadend'],
  })
  assert.deepEqual(tourFocusOf(TOUR_STEPS[1]), { ids: ['aerial'], current: 'aerial', edges: [] })
  assert.deepEqual(tourFocusOf(TOUR_STEPS[0]), { ids: [], current: '', edges: [] })
})

test('tourFocusOf and selectionFocusOf: Freetvarr and ad removal always light together', () => {
  assert.ok(tourFocusOf(TOUR_STEPS[5]).ids.includes('ad-removal'))
  const adRemoval = selectionFocusOf('ad-removal')
  assert.equal(adRemoval.current, 'ad-removal')
  assert.ok(adRemoval.ids.includes('freetvarr'))
})

test('selectionFocusOf: lights the piece, its neighbours, and the edges between them', () => {
  const focus = selectionFocusOf('tvheadend')
  assert.equal(focus.current, 'tvheadend')
  assert.deepEqual(focus.ids.slice(0, 1), ['tvheadend'])
  for (const id of ['tuner', 'recordings', 'guide', 'freetvarr', 'player']) assert.ok(focus.ids.includes(id), id)
  assert.deepEqual(focus.edges.sort(), ['freetvarr-tvheadend', 'guide-tvheadend', 'tuner-tvheadend', 'tvheadend-player', 'tvheadend-recordings'])
  assert.deepEqual(selectionFocusOf(''), { ids: [], current: '', edges: [] })
  assert.deepEqual(selectionFocusOf('nope'), { ids: [], current: '', edges: [] })
})

test('focusedPieceOf: reads the piece after the diagram page in the route', () => {
  assert.equal(focusedPieceOf(['diagram', 'tvheadend']), 'tvheadend')
  assert.equal(focusedPieceOf(['diagram', 'ad-removal']), 'ad-removal')
  assert.equal(focusedPieceOf(['diagram']), '')
  assert.equal(focusedPieceOf(['diagram', 'nope']), '')
  assert.equal(focusedPieceOf(['about', 'tvheadend']), '')
  assert.equal(focusedPieceOf(resolveRoute('#/settings/diagram/Player').params), 'player')
})

test('diagramHrefOf: a known piece opens the map focused on it, anything else opens the whole map', () => {
  assert.equal(diagramHrefOf('tuner'), '#/settings/diagram/tuner')
  assert.equal(diagramHrefOf('all'), '#/settings/diagram')
  assert.equal(diagramHrefOf(''), '#/settings/diagram')
  for (const piece of PIECES) {
    const { params } = resolveRoute(diagramHrefOf(piece.id))
    assert.equal(settingsPageOf({ params, narrow: true })?.id, 'diagram', piece.id)
    assert.equal(focusedPieceOf(params), piece.id)
  }
})

test('pieceStatuses: derives the current value of each piece from settings and live data', () => {
  const statuses = pieceStatuses({
    settings: {
      tvh_url: 'http://synnas:9981',
      recordings_root: '/data/recordings',
      media_root: '/data/media/tv',
      ad_removal_enabled: false,
      plex_url: 'http://synnas:32400',
      show_artwork_lookup: true,
      ratings_lookup_enabled: true,
      reviews_lookup_enabled: true,
      credits_lookup_enabled: true,
    },
    tvheadendState: 'ok',
    tuners: { configured: true, total: 4, recording: 1 },
    guide: { available: true, linked: 41, channels: 43, url: 'https://x/syd.xml', feeds: [{ region: 'Sydney', url: 'https://x/syd.xml' }] },
    version: '2.0.0',
  })
  assert.deepEqual(statuses, {
    tvheadend: { text: 'Connected · synnas:9981' },
    recordings: { text: '/data/recordings', mono: true },
    library: { text: '/data/media/tv', mono: true },
    'ad-removal': { text: 'Off' },
    metadata: { text: 'On' },
    player: { text: 'Plex · synnas:32400' },
    tuner: { text: '4 tuners · 1 recording' },
    guide: { text: 'Sydney · 41 of 43 channels' },
    freetvarr: { text: 'Version 2.0.0' },
  })
})

test('pieceStatuses: names missing and partial setups plainly', () => {
  const statuses = pieceStatuses({
    settings: { tvh_url: '', ad_removal_enabled: true, show_artwork_lookup: true, ratings_lookup_enabled: false },
    tuners: { configured: true, total: 1, recording: 0 },
    guide: { available: true, linked: 0, channels: 20 },
  })
  assert.equal(statuses.tvheadend.text, 'Not set up')
  assert.equal(statuses.recordings.text, 'Not set')
  assert.equal(statuses['ad-removal'].text, 'On')
  assert.equal(statuses.metadata.text, '1 of 4 lookups on')
  assert.equal(statuses.player.text, 'Plex not connected')
  assert.equal(statuses.tuner.text, '1 tuner')
  assert.equal(statuses.guide.text, 'No guide linked')
  assert.equal(statuses.freetvarr, undefined)
})

test('pieceStatuses: TVHeadend states and tuner-less setups', () => {
  const url = 'http://synnas:9981'
  assert.equal(pieceStatuses({ settings: { tvh_url: url }, tvheadendState: 'fail' }).tvheadend.text, 'Not answering · synnas:9981')
  assert.equal(pieceStatuses({ settings: { tvh_url: url } }).tvheadend.text, 'synnas:9981')
  assert.equal(pieceStatuses({ tuners: { configured: false } }).tuner.text, 'TVHeadend not set up')
  assert.equal(pieceStatuses({ tuners: { configured: true, total: 0 } }).tuner.text, 'No tuner found')
  assert.equal(pieceStatuses({ guide: { available: false } }).guide.text, 'Broadcast guide only')
  assert.deepEqual(pieceStatuses(), {})
})

test('tourPanTransform: centres a piece in the stage and fits the whole diagram for overview steps', () => {
  assert.equal(tourPanTransform({ piece: '', stageHeight: 416, panHeight: 816 }), 'translateY(8px) scale(0.49)')
  assert.equal(tourPanTransform({ piece: 'aerial', stageHeight: 400, panHeight: 800 }), 'translateY(12px) scale(1)')
  const bottom = tourPanTransform({ piece: 'screens', stageHeight: 400, panHeight: 800 })
  assert.equal(bottom, 'translateY(-404px) scale(1)')
  assert.equal(tourPanTransform({ piece: '', stageHeight: 900, panHeight: 800 }), 'translateY(8px) scale(1)')
})

test('diagramMarkup: one node per piece, focusable only on the interactive map', () => {
  const map = diagramMarkup({ interactive: true })
  const tour = diagramMarkup()
  assert.equal((map.match(/data-piece="/g) ?? []).length, PIECES.length)
  assert.equal((map.match(/role="button" tabindex="0"/g) ?? []).length, PIECES.length)
  assert.doesNotMatch(tour, /tabindex/)
  assert.match(tour, /role="img" aria-label="System diagram"/)
  assert.equal((map.match(/data-edge="/g) ?? []).length, EDGES.length)
  assert.match(map, /class="sd-dot"/)
  assert.doesNotMatch(diagramMarkup({ dot: false }), /sd-dot/)
})

test('diagramMarkup: docs annotation adds the function of every main piece', () => {
  const markup = diagramMarkup({ annotate: { gap: 36, width: 440 }, dot: false })
  const mains = PIECES.filter((piece) => piece.kind === 'main')
  assert.equal((markup.match(/class="sd-annot"/g) ?? []).length, mains.length)
  assert.match(markup, /e\.g\. The Block\.ts\./)
})

test('statusPartsOf: splits a status at its separators so each value stays whole, and keeps a path in one part', () => {
  assert.deepEqual(statusPartsOf({ text: 'Connected · 192.168.86.254:9981' }), ['Connected', '192.168.86.254:9981'])
  assert.deepEqual(statusPartsOf({ text: 'Sydney · 33 of 35 channels' }), ['Sydney', '33 of 35 channels'])
  assert.deepEqual(statusPartsOf({ text: '/data/recordings · old', mono: true }), ['/data/recordings · old'])
  assert.deepEqual(statusPartsOf(null), [])
})

test('cardShiftOf: centres the card on the node when there is room', () => {
  const view = { naturalTop: 100, visibleTop: 16, visibleBottom: 884, cardHeight: 300 }
  assert.equal(cardShiftOf({ ...view, nodeCentre: 450 }), 200)
})

test('cardShiftOf: keeps the card inside the visible area', () => {
  const view = { naturalTop: 100, visibleTop: 16, visibleBottom: 884, cardHeight: 300 }
  assert.equal(cardShiftOf({ ...view, nodeCentre: 20 }), -84)
  assert.equal(cardShiftOf({ ...view, nodeCentre: 880 }), 484)
})

test('cardShiftOf: top-aligns a card taller than the visible area', () => {
  const view = { naturalTop: 100, visibleTop: 16, visibleBottom: 400, cardHeight: 500 }
  assert.equal(cardShiftOf({ ...view, nodeCentre: 300 }), -84)
})
