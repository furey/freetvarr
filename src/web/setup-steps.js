export const SETUP_PARTS = ['Connect', 'Tune in', 'Save']

export const SETUP_STEPS = [
  { key: 'tvheadend', title: 'TVHeadend', part: 0 },
  { key: 'channels', title: 'Channels', part: 1 },
  { key: 'guide', title: 'Guide', part: 1 },
  { key: 'folders', title: 'Folders', part: 2 },
  { key: 'plex', title: 'Plex', part: 2 },
]

export const SETUP_DRAWERS = ['tvheadend', 'channels', 'guide', 'folders', 'plex', 'time-zone']

export const partFills = (current) => SETUP_PARTS.map((_, part) => {
  const steps = stepsInPart(part)
  const units = steps.reduce((sum, { index }) => sum + stepUnits({ index, current }), 0)
  return units / steps.length
})

export const stepCaption = (current) => {
  const step = SETUP_STEPS[current]
  if (!step) return 'Setup done'
  return `Step ${current + 1} of ${SETUP_STEPS.length} · ${SETUP_PARTS[step.part]}`
}

export const railGroups = ({ current, doneValues = {} }) => {
  const fills = partFills(current)
  return SETUP_PARTS.map((label, part) => ({
    label,
    fill: fills[part],
    steps: stepsInPart(part).map(({ key, title, index }) => ({
      key,
      title,
      index,
      state: railStateOf({ index, current }),
      value: index < current ? doneValues[key] || '' : '',
    })),
  }))
}

export const hostOf = (url) => {
  const text = String(url || '').trim()
  if (!text) return ''
  try {
    return new URL(/^[a-z]+:\/\//i.test(text) ? text : `http://${text}`).host
  } catch {
    return text
  }
}

export const stepDoneValues = ({ tvhUrl, channels, guideLinked, guideTotal, folderProblems, plexLibrary, plexConnected }) => ({
  tvheadend: hostOf(tvhUrl),
  channels: channels ? countOf({ count: channels, one: 'channel', many: 'channels' }) : 'No channels yet',
  guide: guideLinked ? `${guideLinked} of ${guideTotal || guideLinked} channels` : 'No guide yet',
  folders: folderProblems ? 'Needs a fix' : 'Checks passed',
  plex: plexConnected ? plexLibrary || 'Connected' : 'Skipped',
})

export const readySummaryRows = ({
  tvhUrl,
  tvhUsername,
  channels,
  favourites = [],
  guideLinked,
  guideTotal,
  guideRegion,
  syncText,
  plexLibrary,
  mediaRoot,
}) => [
  {
    key: 'tvheadend',
    title: 'TVHeadend',
    meta: tvhUsername ? `Signs in as ${tvhUsername}` : 'Signs in without a login',
    value: hostOf(tvhUrl),
    ok: Boolean(tvhUrl),
  },
  {
    key: 'channels',
    title: 'Channels',
    meta: channels ? favouritesLine(favourites) : 'The TV guide stays empty until you scan for channels.',
    value: channels ? String(channels) : '',
    ok: Boolean(channels),
    fix: channels ? null : { step: 'channels', label: 'Go to Channels' },
  },
  {
    key: 'guide',
    title: 'Guide',
    meta: guideLinked ? guideRegion || 'Guide feed' : 'Freetvarr cannot record a show by name without a guide.',
    value: guideLinked ? `${guideLinked} of ${guideTotal || guideLinked}` : '',
    ok: Boolean(guideLinked),
    fix: guideLinked ? null : { step: 'guide', label: 'Go to Guide' },
  },
  {
    key: 'recordings',
    title: 'Recordings',
    meta: `Added to your library ${syncText}`,
    value: plexLibrary || mediaRoot || '',
    mono: !plexLibrary,
    ok: true,
  },
]

export const setupSettingsRows = ({ settings = {}, channelStatus = null, guideStatus = null, folders = null }) => {
  const channels = channelStatus?.channels || 0
  const guide = guideStatus?.suggestion || null
  const network = channelStatus?.networks?.[0]?.name || ''
  const region = (guide?.feeds || []).find((feed) => feed.url === guide?.url)?.region || ''
  return [
    {
      key: 'tvheadend',
      title: 'TVHeadend',
      meta: settings.tvh_url ? signInLine(settings.tvh_username) : 'Not connected yet',
      value: hostOf(settings.tvh_url),
      mono: true,
      tone: settings.tvh_url ? 'ok' : 'warn',
    },
    {
      key: 'channels',
      title: 'Channels',
      meta: channelStatus ? channelsLine({ channels, network }) : 'Checking…',
      value: channels ? String(channels) : '',
      tone: toneOf({ known: Boolean(channelStatus), ok: channels > 0 }),
    },
    {
      key: 'guide',
      title: 'Guide',
      meta: guide ? guideLine({ guide, region }) : 'Checking…',
      value: guide?.linked ? `${guide.linked} of ${guide.channels}` : '',
      tone: toneOf({ known: Boolean(guide), ok: Boolean(guide?.linked) }),
    },
    {
      key: 'folders',
      title: 'Folders',
      meta: folders ? folders.problems[0]?.text || folders.notes[0] || 'The folder checks passed.' : 'Checking…',
      value: folders ? (folders.problems.length ? 'Check' : '') : '',
      tone: toneOf({ known: Boolean(folders), ok: !folders?.problems.length }),
    },
    {
      key: 'plex',
      title: 'Plex',
      meta: settings.plex_url ? 'Refreshes your library after each sync' : 'Not set up. Plex is optional.',
      value: hostOf(settings.plex_url),
      mono: true,
      tone: settings.plex_url ? 'ok' : '',
    },
    {
      key: 'time-zone',
      title: 'Time zone',
      meta: settings.tz_source === 'env' ? 'From TZ in your .env file' : 'Used for the guide, recordings, and the sync schedule',
      value: settings.time_zone || settings.tz || '',
      tone: '',
    },
  ]
}

export const isSetupComplete = (rows) => rows.every((row) => row.ok)

export const runStepValue = (step) => {
  const detail = step?.detail
  if (!detail) return ''
  if (step.id === 'scan') return detail.frequencies && detail.scanned ? `${detail.scanned} of ${detail.frequencies}` : ''
  if (step.id === 'map') {
    if (!detail.total) return 'Nothing new'
    const done = (detail.ok || 0) + (detail.fail || 0)
    return done ? `${done} of ${detail.total}` : ''
  }
  if (step.id === 'download') return detail.expected && detail.found ? `${detail.found} of ${detail.expected}` : ''
  return ''
}

export const runStepProgress = (step) => {
  const detail = step?.detail
  if (step?.status !== 'running' || !detail) return null
  if (step.id === 'scan' && detail.frequencies) return fraction(detail.scanned, detail.frequencies)
  if (step.id === 'map' && detail.total) return fraction((detail.ok || 0) + (detail.fail || 0), detail.total)
  if (step.id === 'download' && detail.expected) return fraction(detail.found, detail.expected)
  return null
}

export const setupDrawerOf = (params = []) => {
  if (params[0] !== 'system' || params[1] !== 'setup') return ''
  return SETUP_DRAWERS.includes(params[2]) ? params[2] : ''
}

export const morphFrames = ({ from, to, fromRadius, toRadius }) => {
  const sx = from.width / to.width
  const sy = from.height / to.height
  return {
    x: round(centreOf(from).x - centreOf(to).x),
    y: round(centreOf(from).y - centreOf(to).y),
    sx,
    sy,
    startRadius: `${round(fromRadius / sx)}px / ${round(fromRadius / sy)}px`,
    endRadius: `${round(toRadius)}px`,
  }
}

const stepsInPart = (part) => SETUP_STEPS
  .map((step, index) => ({ ...step, index }))
  .filter((step) => step.part === part)

const stepUnits = ({ index, current }) => {
  if (index < current) return 1
  return index === current ? 0.5 : 0
}

const railStateOf = ({ index, current }) => {
  if (index < current) return 'done'
  return index === current ? 'current' : 'next'
}

const signInLine = (username) => (username ? `Signs in as ${username}` : 'Signs in without a login')

const channelsLine = ({ channels, network }) => {
  if (!channels) return 'No channels yet'
  return network ? transmitterName(network) : 'Saved in TVHeadend'
}

const guideLine = ({ guide, region }) => {
  if (!guide.available) return 'The guide that comes with the broadcast'
  if (!guide.linked) return 'No guide linked yet'
  return region || 'Guide feed'
}

const toneOf = ({ known, ok }) => {
  if (!known) return ''
  return ok ? 'ok' : 'warn'
}

const transmitterName = (name) => String(name).replace(/^[a-z]{2}-/i, '').replace(/_+/g, ' ').trim()

const countOf = ({ count, one, many }) => `${count} ${count === 1 ? one : many}`

const favouritesLine = (favourites) => (favourites.length ? `Favourites: ${favourites.join(', ')}` : 'Saved in TVHeadend')

const fraction = (part, whole) => Math.min(1, Math.max(0, (part || 0) / whole))

const centreOf = (box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 })

const round = (value) => Math.round(value * 100) / 100
