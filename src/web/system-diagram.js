import { hostOf } from './setup-steps.js'

export const PIECES = [
  {
    id: 'aerial', row: 0, kind: 'main', icon: 'aerial', title: 'Aerial', meta: 'Broadcast receiver',
    need: 'Required', source: 'You supply',
    job: 'Receives the free-to-air broadcast signal from the transmitter.',
    more: 'The aerial and cable that a Fetch box or TV used work with a TV tuner without changes.',
    links: [{ label: 'Setup', href: '#/settings/system/setup' }],
  },
  {
    id: 'tuner', row: 1, kind: 'main', icon: 'tuner', title: 'TV tuner', meta: 'Network, USB, PCIe',
    need: 'Required', source: 'You buy',
    job: 'Converts the aerial signal into digital channels and sends them over the home network.',
    more: 'A Fetch box has a built-in tuner. A network tuner connects to the router, not to the NAS. Each tuner records one channel at a time.',
    own: 'Any TVHeadend-compatible tuner.',
    links: [{ label: 'Health', href: '#/settings/system/health' }],
  },
  {
    id: 'tvheadend', row: 2, kind: 'main', icon: 'recorder', title: 'TVHeadend', meta: 'TV recording server',
    need: 'Required', source: 'Installed by the install script',
    job: 'Controls the tuner, scans for channels, downloads the TV guide, and records each programme to a file at its scheduled time.',
    more: 'TVHeadend runs as a separate server. It records whether Freetvarr is open or not. Its own web interface is for configuration only.',
    own: 'An existing TVHeadend server. Setup connects to it with a login that you create.',
    links: [{ label: 'TVHeadend settings', href: '#/settings/system/tvheadend' }],
  },
  {
    id: 'guide', row: 2, kind: 'side', title: 'XMLTV guide', meta: '7-day listings',
    need: 'Required', source: 'Region set by setup',
    job: 'An XMLTV file of programme listings for the next 7 days. TVHeadend downloads it every day.',
    own: 'Outside Australia and New Zealand, an XMLTV address that you enter.',
    links: [{ label: 'Setup', href: '#/settings/system/setup' }],
  },
  {
    id: 'recordings', row: 3, kind: 'main', icon: 'folder', title: 'Recordings', meta: 'Raw .ts files',
    need: 'Required', source: 'Created by the install script',
    job: 'TVHeadend writes each recording to this folder as a .ts file named by programme title, e.g. The Block.ts.',
    own: 'An existing NAS share that TVHeadend records to.',
    links: [{ label: 'Media library', href: '#/settings/storage' }],
  },
  {
    id: 'freetvarr', row: 4, kind: 'main', icon: 'chips', title: 'Freetvarr', meta: 'Web app, importer',
    need: 'Required', source: 'This app',
    job: 'Web app that shows the TV guide and sends recordings and series rules to TVHeadend.',
    more: 'After each recording, Freetvarr names the file by series, season, and episode and imports it into the TV library. It also plays live TV and recordings in a browser.',
    links: [{ label: 'About Freetvarr', href: '#/settings/about' }],
  },
  {
    id: 'ad-removal', row: 4, kind: 'inner', title: 'Ad removal', tag: 'Optional',
    need: 'Optional', source: 'Off by default',
    job: 'Detects ad breaks with comskip and cuts them from the recording without re-encoding.',
    more: 'You turn it on for each show. Freetvarr keeps the original file for 7 days.',
    links: [{ label: 'Ad removal', href: '#/settings/ad-removal' }],
  },
  {
    id: 'metadata', row: 4, kind: 'side', title: 'Metadata', meta: 'TVmaze, TMDB', tag: 'Optional',
    need: 'Optional', source: 'Online lookups',
    job: 'Online lookups for programme images, ratings, and cast.',
    more: 'Freetvarr sends programme titles only. Each lookup has an off switch in Film and TV info.',
    links: [{ label: 'Film and TV info', href: '#/settings/film-tv-info' }],
  },
  {
    id: 'library', row: 5, kind: 'main', icon: 'library', title: 'TV library', meta: 'Renamed episodes',
    need: 'Required', source: 'Created by the install script',
    job: 'Episode files named Show/Season 01/Show - S01E02.ts, the format that media players match.',
    more: 'One-off programmes go to a separate one-offs folder.',
    own: 'The TV folder that an existing media player reads.',
    links: [{ label: 'Media library', href: '#/settings/storage' }],
  },
  {
    id: 'player', row: 6, kind: 'main', icon: 'player', title: 'Media player', meta: 'e.g. Plex, Jellyfin', tag: 'Optional',
    need: 'Optional', source: 'Needed for TV playback',
    job: 'Media server or app that plays the TV library on a TV, with pause and rewind.',
    more: 'With Plex, Freetvarr starts a library scan after each import. Jellyfin and Kodi can also play live TV from TVHeadend.',
    own: 'An existing Plex, Jellyfin, or Kodi. The install script can also run Plex.',
    links: [{ label: 'Plex', href: '#/settings/plex' }, { label: 'Watch on TV', href: '#/settings/tv-apps' }],
  },
  {
    id: 'screens', row: 7, kind: 'main', icon: 'screens', title: 'Playback devices', meta: 'TV, tablet, phone',
    need: 'Required', source: 'You supply',
    job: 'A TV plays the TV library through the media player app. A phone, tablet, or computer runs Freetvarr in a browser.',
    links: [],
  },
]

export const EDGES = [
  { id: 'aerial-tuner', from: 'aerial', to: 'tuner' },
  { id: 'tuner-tvheadend', from: 'tuner', to: 'tvheadend' },
  { id: 'tvheadend-recordings', from: 'tvheadend', to: 'recordings' },
  { id: 'recordings-freetvarr', from: 'recordings', to: 'freetvarr' },
  { id: 'freetvarr-library', from: 'freetvarr', to: 'library' },
  { id: 'library-player', from: 'library', to: 'player' },
  { id: 'player-screens', from: 'player', to: 'screens' },
  { id: 'guide-tvheadend', from: 'guide', to: 'tvheadend' },
  { id: 'metadata-freetvarr', from: 'metadata', to: 'freetvarr' },
  { id: 'freetvarr-tvheadend', from: 'freetvarr', to: 'tvheadend', route: 'loop' },
  { id: 'tvheadend-player', from: 'tvheadend', to: 'player', route: 'live', dashed: true },
  { id: 'freetvarr-screens', from: 'freetvarr', to: 'screens', route: 'browser', dashed: true },
]

export const TOUR_STEPS = [
  {
    title: 'Components',
    text: 'A Fetch box tunes, records, and plays in one device. In this system, a separate component does each job. You supply the aerial and the tuner. The install script and setup configure the other components.',
  },
  { piece: 'aerial', from: null },
  { piece: 'tuner', from: 'aerial-tuner' },
  { piece: 'tvheadend', extra: ['guide'], from: 'tuner-tvheadend', also: 'guide-tvheadend' },
  { piece: 'recordings', from: 'tvheadend-recordings' },
  { piece: 'freetvarr', extra: ['metadata'], from: 'recordings-freetvarr', also: 'freetvarr-tvheadend' },
  { piece: 'library', from: 'freetvarr-library' },
  { piece: 'player', from: 'library-player' },
  { piece: 'screens', from: 'player-screens' },
  {
    title: 'Required and optional',
    text: 'Required: aerial, tuner, TVHeadend, XMLTV guide, Freetvarr, and the two folders. Optional: media player, metadata, and ad removal. Settings → About → System diagram shows this diagram again.',
    last: true,
  },
]

export const DIAGRAM_HREF = '#/settings/diagram'

export const VIEW_W = 358

export const pieceById = (id) => PIECES.find((piece) => piece.id === id) ?? null

export const diagramHrefOf = (pieceId) => (pieceById(pieceId) ? `${DIAGRAM_HREF}/${pieceId}` : DIAGRAM_HREF)

export const focusedPieceOf = (params = []) => {
  if (params[0] !== 'diagram') return ''
  return pieceById(params[1]) ? params[1] : ''
}

export const neighboursOf = (id) => EDGES.filter((edge) => edge.from === id || edge.to === id)

export const selectionFocusOf = (id) => {
  if (!pieceById(id)) return NO_FOCUS
  const edges = neighboursOf(id)
  const others = edges.map((edge) => (edge.from === id ? edge.to : edge.from))
  return { ids: withHost([id, ...others]), current: id, edges: edges.map((edge) => edge.id) }
}

export const tourFocusOf = (step) => {
  if (!step?.piece) return NO_FOCUS
  return {
    ids: withHost([step.piece, ...(step.extra ?? [])]),
    current: step.piece,
    edges: [step.from, step.also].filter(Boolean),
  }
}

export const tourStepView = ({ index, steps = TOUR_STEPS }) => {
  const step = steps[index]
  const piece = step?.piece ? pieceById(step.piece) : null
  return {
    title: piece ? piece.title : step.title,
    text: piece ? piece.job : step.text,
    pills: piece ? pillsOf(piece) : [],
    own: piece?.own ?? '',
    caption: `System diagram · ${index + 1} of ${steps.length}`,
    nextLabel: step.last ? 'Start setup' : 'Next',
    canGoBack: index > 0,
    isLast: Boolean(step.last),
  }
}

export const pillsOf = (piece) => [
  { text: piece.need, quiet: piece.need === 'Optional' },
  { text: piece.source, quiet: true },
]

export const pieceStatuses = ({ settings = null, tvheadendState = '', tuners = null, guide = null, version = '' } = {}) => {
  const values = settings ? settingsStatuses({ settings, tvheadendState }) : {}
  return {
    ...values,
    ...(tuners ? { tuner: tunerStatusOf(tuners) } : {}),
    ...(guide ? { guide: guideStatusOf(guide) } : {}),
    ...(version ? { freetvarr: { text: `Version ${version}` } } : {}),
  }
}

export const statusPartsOf = (status) => {
  if (!status?.text) return []
  return status.mono ? [status.text] : status.text.split(STATUS_SEPARATOR)
}

export const rowCentreOf = (id) => {
  const box = boxOf(pieceById(id))
  return (box.y + box.h / 2 + VIEW_PAD_TOP) / (VIEW_H + VIEW_PAD_TOP)
}

export const tourPanTransform = ({ piece, stageHeight, panHeight }) => {
  if (!pieceById(piece)) {
    const scale = Math.min(1, (stageHeight - PAN_ROOM) / panHeight)
    return `translateY(${PAN_ROOM / 2}px) scale(${round(scale)})`
  }
  const centre = rowCentreOf(piece) * panHeight
  const furthest = Math.max(0, panHeight - stageHeight + PAN_ROOM)
  const offset = Math.min(furthest, Math.max(0, centre - stageHeight / 2))
  return `translateY(${round(PAN_TOP - offset)}px) scale(1)`
}

export const diagramMarkup = ({ annotate = null, dot = true, interactive = false } = {}) => {
  const width = annotate ? VIEW_W + annotate.gap + annotate.width : VIEW_W
  const role = interactive ? 'role="group"' : 'role="img"'
  return `<svg class="sd" viewBox="-4 -${VIEW_PAD_TOP} ${width + 8} ${VIEW_H + VIEW_PAD_TOP}" ${role} aria-label="System diagram">
    ${groupMarkup()}
    <g class="sd-edges">${EDGES.map(edgeMarkup).join('')}</g>
    <g class="sd-nodes">${PIECES.map((piece) => nodeMarkup({ piece, interactive })).join('')}</g>
    ${annotate ? annotationMarkup({ x: VIEW_W + annotate.gap, width: annotate.width }) : ''}
    ${dot ? '<circle class="sd-dot" r="5"/>' : ''}
  </svg>`
}

const STATUS_SEPARATOR = ' · '

const NO_FOCUS = { ids: [], current: '', edges: [] }

const NODE_H = 50
const MAIN = { x: 46, w: 178 }
const SIDE = { x: 248, w: 108 }
const LANES = { live: 14, loop: 30, browser: 302 }
const GROUP = { left: 2, right: 236 }
const ROW_Y = [20, 110, 214, 304, 394, 518, 628, 718]
const HEIGHTS = { freetvarr: 84 }
const CX = MAIN.x + MAIN.w / 2
const VIEW_H = ROW_Y[7] + NODE_H + 14
const VIEW_PAD_TOP = 12
const CORNER = 4
const ARROW = 4.5
const LINE_H = 18
const PAN_ROOM = 16
const PAN_TOP = 12

const round = (value) => Math.round(value * 100) / 100

const ICONS = {
  aerial: '<path d="M8 6.5V14.5M3 3.5h10M4.5 6h7M6 8.5h4M8 6.5 4 14.5M8 6.5l4 8"/>',
  tuner: '<rect x="2" y="5" width="12" height="7" rx="1.5"/><path d="M5 8.5h.01M7.5 8.5h.01"/><path d="M11 3v2M12.5 12v1.5M3.5 12v1.5"/>',
  recorder: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="8" r="1.75" fill="currentColor" stroke="none"/><path d="M10 6.5h2M10 9.5h2"/>',
  folder: '<path d="M2 4.5c0-.8.7-1.5 1.5-1.5h2.7l1.5 1.7h4.8c.8 0 1.5.7 1.5 1.5v5.8c0 .8-.7 1.5-1.5 1.5h-9c-.8 0-1.5-.7-1.5-1.5z"/>',
  library: '<path d="M2 4.5c0-.8.7-1.5 1.5-1.5h2.7l1.5 1.7h4.8c.8 0 1.5.7 1.5 1.5v5.8c0 .8-.7 1.5-1.5 1.5h-9c-.8 0-1.5-.7-1.5-1.5z"/><path d="M5 9h6M5 11h4"/>',
  player: '<rect x="1.5" y="3" width="13" height="9" rx="1.5"/><path d="M6.75 5.75v3.5l2.9-1.75z" fill="currentColor"/><path d="M5 14.5h6"/>',
  screens: '<rect x="1.5" y="2.5" width="10" height="7" rx="1"/><path d="M4.5 12h4"/><rect x="11" y="6.5" width="3.5" height="7" rx="0.8"/>',
}

const HOSTED = { 'ad-removal': 'freetvarr' }

const withHost = (ids) => {
  const list = [...new Set(ids)]
  if (list.includes('freetvarr') && !list.includes('ad-removal')) return [...list, 'ad-removal']
  if (list.includes('ad-removal') && !list.includes('freetvarr')) return [...list, 'freetvarr']
  return list
}

const boxOf = (piece) => {
  if (piece.kind === 'inner') {
    const host = boxOf(pieceById(HOSTED[piece.id]))
    return { x: host.x + 10, y: host.y + 50, w: host.w - 20, h: 24 }
  }
  const column = piece.kind === 'side' ? SIDE : MAIN
  return { x: column.x, y: ROW_Y[piece.row], w: column.w, h: HEIGHTS[piece.id] || NODE_H }
}

const edgePathOf = (edge) => {
  const a = boxOf(pieceById(edge.from))
  const b = boxOf(pieceById(edge.to))
  if (edge.route === 'loop') return loopPath({ a, b })
  if (edge.route === 'live') return livePath({ a, b })
  if (edge.route === 'browser') return browserPath({ a, b })
  if (a.x !== b.x) {
    const y = a.y + 25
    return { d: `M${a.x},${y} H${b.x + b.w}`, end: [b.x + b.w, y], dir: 'left' }
  }
  return { d: `M${CX},${a.y + a.h} V${b.y}`, end: [CX, b.y], dir: 'down' }
}

const loopPath = ({ a, b }) => {
  const x = LANES.loop
  const y1 = a.y + 25
  const y2 = b.y + 36
  return {
    d: `M${a.x},${y1} H${x + CORNER} Q${x},${y1} ${x},${y1 - CORNER} V${y2 + CORNER} Q${x},${y2} ${x + CORNER},${y2} H${b.x}`,
    end: [b.x, y2],
    dir: 'right',
  }
}

const livePath = ({ a, b }) => {
  const x = LANES.live
  const y1 = a.y + 14
  const y2 = b.y + 25
  return {
    d: `M${a.x},${y1} H${x + CORNER} Q${x},${y1} ${x},${y1 + CORNER} V${y2 - CORNER} Q${x},${y2} ${x + CORNER},${y2} H${b.x}`,
    end: [b.x, y2],
    dir: 'right',
  }
}

const browserPath = ({ a, b }) => {
  const x = LANES.browser
  const y1 = a.y + a.h - 14
  const y2 = b.y + 25
  return {
    d: `M${a.x + a.w},${y1} H${x - CORNER} Q${x},${y1} ${x},${y1 + CORNER} V${y2 - CORNER} Q${x},${y2} ${x - CORNER},${y2} H${b.x + b.w}`,
    end: [b.x + b.w, y2],
    dir: 'left',
  }
}

const arrowPointsOf = ([x, y], dir) => {
  if (dir === 'down') return `${x - ARROW},${y - ARROW - 1} ${x + ARROW},${y - ARROW - 1} ${x},${y}`
  if (dir === 'left') return `${x + ARROW + 1},${y - ARROW} ${x + ARROW + 1},${y + ARROW} ${x},${y}`
  return `${x - ARROW - 1},${y - ARROW} ${x - ARROW - 1},${y + ARROW} ${x},${y}`
}

const escapeText = (text) => String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const iconMarkup = (piece, box) => {
  const backing = `<rect class="sd-icon-bg" x="${box.x + 10}" y="${box.y + 10}" width="28" height="30" rx="8"/>`
  if (piece.icon === 'chips') return `${backing}${chipsMarkup({ x: box.x + 12.5, y: box.y + 22.5 })}`
  return `${backing}<svg class="sd-icon" x="${box.x + 15}" y="${box.y + 16}" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${ICONS[piece.icon]}</svg>`
}

const chipsMarkup = ({ x, y }) => ['blue', 'orange', 'yellow']
  .map((colour, index) => `<rect x="${x + index * 8.25}" y="${y}" width="6.5" height="5" rx="1" fill="var(--color-brand-${colour})"/>`)
  .join('')

const tagWidthOf = (text) => text.length * 6.4 + 12

const tagMarkup = (piece, box) => {
  if (!piece.tag) return ''
  const text = piece.tag.toUpperCase()
  const width = tagWidthOf(text)
  const x = box.x + box.w - width - 8
  return `<rect class="sd-tag-bg" x="${x}" y="${box.y - 8}" width="${width}" height="16" rx="8"/>
    <text class="sd-tag" x="${x + width / 2}" y="${box.y + 3.4}" text-anchor="middle">${text}</text>`
}

const nodeOpening = ({ piece, kindClass, interactive }) => {
  const control = interactive ? ` role="button" tabindex="0" aria-label="${escapeText(piece.title)}: ${escapeText(piece.need)}"` : ''
  return `<g class="sd-node ${kindClass}" data-piece="${piece.id}"${control}>`
}

const innerMarkup = ({ piece, interactive }) => {
  const box = boxOf(piece)
  const text = piece.tag.toUpperCase()
  const width = tagWidthOf(text) - 4
  return `${nodeOpening({ piece, kindClass: 'is-inner', interactive })}
    <rect class="sd-box" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="7"/>
    <text class="sd-inner-title" x="${box.x + 10}" y="${box.y + 16}">${escapeText(piece.title)}</text>
    <text class="sd-tag" x="${box.x + box.w - 8 - width / 2}" y="${box.y + 15.4}" text-anchor="middle">${text}</text>
  </g>`
}

const nodeMarkup = ({ piece, interactive }) => {
  if (piece.kind === 'inner') return innerMarkup({ piece, interactive })
  const box = boxOf(piece)
  const isSide = piece.kind === 'side'
  const textX = isSide ? box.x + 10 : box.x + 46
  return `${nodeOpening({ piece, kindClass: isSide ? 'is-side' : 'is-main', interactive })}
    <rect class="sd-box" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="12"/>
    ${isSide ? '' : iconMarkup(piece, box)}
    <text class="sd-title" x="${textX}" y="${box.y + 22}">${escapeText(piece.title)}</text>
    <text class="sd-meta" x="${textX}" y="${box.y + 39}">${escapeText(piece.meta)}</text>
    ${tagMarkup(piece, box)}
  </g>`
}

const edgeMarkup = (edge) => {
  const { d, end, dir } = edgePathOf(edge)
  const dashed = edge.dashed ? ' is-dashed' : ''
  return `<path class="sd-edge${dashed}" data-edge="${edge.id}" d="${d}"/>
    <polygon class="sd-arrow${dashed}" data-edge-arrow="${edge.id}" points="${arrowPointsOf(end, dir)}"/>`
}

const groupMarkup = () => {
  const top = ROW_Y[2] - 16
  const bottom = ROW_Y[5] + NODE_H + 18
  return `<rect class="sd-group" x="${GROUP.left}" y="${top}" width="${GROUP.right - GROUP.left}" height="${bottom - top}" rx="14"/>
    <rect class="sd-group-pill" x="${GROUP.left + 12}" y="${top - 8}" width="98" height="16" rx="8"/>
    <text class="sd-group-label" x="${GROUP.left + 61}" y="${top + 3.4}" text-anchor="middle">NAS OR SERVER</text>`
}

const wrapWords = (text, max) => text.split(' ').reduce((lines, word) => {
  const last = lines.at(-1)
  if (last && `${last} ${word}`.length <= max) lines[lines.length - 1] = `${last} ${word}`
  else lines.push(word)
  return lines
}, [])

const annotationMarkup = ({ x, width }) => PIECES.filter((piece) => piece.kind === 'main').map((piece) => {
  const box = boxOf(piece)
  const lines = wrapWords(piece.job, Math.floor(width / 7.1))
  const spans = lines.map((line, index) => `<tspan x="${x}" dy="${index ? LINE_H : 0}">${escapeText(line)}</tspan>`).join('')
  const top = box.y + box.h / 2 - ((lines.length - 1) * LINE_H) / 2 + 4.5
  return `<text class="sd-annot" x="${x}" y="${top}">${spans}</text>`
}).join('')

const settingsStatuses = ({ settings, tvheadendState }) => ({
  tvheadend: { text: tvheadendStatusText({ url: settings.tvh_url, state: tvheadendState }) },
  recordings: pathStatusOf(settings.recordings_root),
  library: pathStatusOf(settings.media_root),
  'ad-removal': { text: settings.ad_removal_enabled ? 'On' : 'Off' },
  metadata: { text: lookupStatusText(settings) },
  player: { text: settings.plex_url ? `Plex · ${hostOf(settings.plex_url)}` : 'Plex not connected' },
})

const tvheadendStatusText = ({ url, state }) => {
  if (!url || state === 'unconfigured') return 'Not set up'
  const host = hostOf(url)
  if (state === 'fail') return `Not answering · ${host}`
  if (state === 'ok' || state === 'stale') return `Connected · ${host}`
  return host
}

const pathStatusOf = (path) => (path ? { text: path, mono: true } : { text: 'Not set' })

const LOOKUP_KEYS = ['show_artwork_lookup', 'ratings_lookup_enabled', 'reviews_lookup_enabled', 'credits_lookup_enabled']

const lookupStatusText = (settings) => {
  const on = LOOKUP_KEYS.filter((key) => settings[key]).length
  if (on === LOOKUP_KEYS.length) return 'On'
  if (!on) return 'Off'
  return `${on} of ${LOOKUP_KEYS.length} lookups on`
}

const tunerStatusOf = ({ configured = true, total = 0, recording = 0 }) => {
  if (configured === false) return { text: 'TVHeadend not set up' }
  if (!total) return { text: 'No tuner found' }
  const count = `${total} ${total === 1 ? 'tuner' : 'tuners'}`
  return { text: recording ? `${count} · ${recording} recording` : count }
}

const guideStatusOf = (suggestion) => {
  if (!suggestion.available) return { text: 'Broadcast guide only' }
  if (!suggestion.linked) return { text: 'No guide linked' }
  const region = (suggestion.feeds ?? []).find((feed) => feed.url === suggestion.url)?.region
  const count = `${suggestion.linked} of ${suggestion.channels || suggestion.linked} channels`
  return { text: region ? `${region} · ${count}` : count }
}

export const cardShiftOf = ({ nodeCentre, cardHeight, naturalTop, visibleTop, visibleBottom }) => {
  const visibleHeight = visibleBottom - visibleTop
  if (cardHeight >= visibleHeight) return visibleTop - naturalTop
  const centred = nodeCentre - cardHeight / 2
  const top = Math.min(Math.max(centred, visibleTop), visibleBottom - cardHeight)
  return top - naturalTop
}

export const sheetRevealOf = ({ nodeTop, nodeBottom, scrollY, maxScroll, visibleTop, sheetTop, margin }) => {
  const areaTop = visibleTop + margin
  const areaBottom = sheetTop - margin
  if (nodeTop >= areaTop && nodeBottom <= areaBottom) return { top: scrollY, padding: 0 }
  const nodeHeight = nodeBottom - nodeTop
  const areaHeight = Math.max(0, areaBottom - areaTop)
  const wantedTop = nodeHeight >= areaHeight
    ? nodeTop - areaTop
    : nodeTop + nodeHeight / 2 - (areaTop + areaHeight / 2)
  const top = Math.max(0, Math.round(scrollY + wantedTop))
  return { top, padding: Math.max(0, top - maxScroll) }
}
