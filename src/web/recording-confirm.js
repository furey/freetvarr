export const SCAN_REALTIME_FACTOR = 0.5
export const TOMBSTONE_DAYS = 30

export const adScanModeOf = (recording) => (recording.show_ad_removal === 'cut' ? 'cut' : 'detect')

export const adScanConfirm = ({ recording, retentionDays }) => (adScanModeOf(recording) === 'cut'
  ? cutAdsConfirm({ recording, retentionDays })
  : findAdsConfirm({ recording }))

export const removeFromTvhConfirm = ({ recording }) => ({
  title: 'Remove from TVHeadend',
  body: [
    'TVHeadend deletes its copy of the recording.',
    libraryCopyText(recording),
    'TVHeadend keeps a note that it recorded this episode, so a series recording does not record it again.'
      + ' TVHeadend also deletes any re-record it has scheduled for this episode.',
    'This takes a few seconds. You cannot undo it.',
  ],
  confirmLabel: 'REMOVE FROM TVHEADEND',
  busyLabel: 'REMOVING…',
  danger: true,
})

export const clearRowConfirm = ({ recording, undoSeconds }) => (recording.deleted_from_tvh_at
  ? clearRemovedRowConfirm({ recording, undoSeconds })
  : clearHeldRowConfirm({ recording }))

export const clearListConfirm = ({ count, undoSeconds }) => {
  const one = count === 1
  return {
    title: `Clear ${count} ${one ? 'recording' : 'recordings'} from the list`,
    body: [
      `TVHeadend no longer has ${one ? 'this recording' : 'these recordings'}.`
        + ` ${one ? 'Its row leaves' : 'Their rows leave'} this list, on every page and filter.`,
      `${one ? 'The file stays' : 'The files stay'} in your library, and your media player still shows`
        + ` ${one ? 'it' : 'them'}. To delete ${one ? 'it' : 'them'} for good, delete ${one ? 'it' : 'them'}`
        + ' in your media player or from your library folder.',
      `For ${undoSeconds} seconds, UNDO puts the ${one ? 'row' : 'rows'} back.`
        + ` Without a clear, rows like these leave the list ${TOMBSTONE_DAYS} days after TVHeadend removed them.`,
    ],
    confirmLabel: 'CLEAR FROM LIST',
    busyLabel: 'CLEARING…',
    danger: true,
  }
}

export const scanMinutesOf = (durationSeconds) => {
  const seconds = Number(durationSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.max(1, Math.round((seconds * SCAN_REALTIME_FACTOR) / 60))
}

export const fileNameOf = (filePath) => String(filePath || '').split('/').pop()

const findAdsConfirm = ({ recording }) => ({
  title: 'Find ads',
  body: [
    'Freetvarr scans the recording for ad breaks.'
      + ` If it finds any, it saves their times in ${edlNameOf(recording.file_path)} beside the recording.`
      + ' Kodi reads that file and skips the ads. The recording file stays as it is.',
    `${scanTimeText(recording)} and uses a lot of processor time.`,
    lastResultText(recording),
  ].filter(Boolean),
  confirmLabel: 'FIND ADS',
  busyLabel: 'STARTING…',
  danger: false,
})

const cutAdsConfirm = ({ recording, retentionDays }) => ({
  title: 'Cut ads',
  body: [
    'Freetvarr scans the recording for ad breaks.'
      + ' If it finds any, it saves the recording again without them, at the same picture quality.',
    `It keeps the original as ${fileNameOf(recording.file_path)}.orig for ${daysText(retentionDays)},`
      + ' then deletes it. To get the original back before then, rename that file over the cut one.',
    `${scanTimeText(recording)}, and saving the cut takes a few minutes more. Both use a lot of processor time.`,
    recording.ad_status === 'cut'
      ? 'This recording is already cut. If the scan finds more ads, the new cut replaces the backup'
        + ' with the current cut file, and the full original is lost.'
      : lastResultText(recording),
  ].filter(Boolean),
  confirmLabel: 'CUT ADS',
  busyLabel: 'STARTING…',
  danger: true,
})

const clearRemovedRowConfirm = ({ recording, undoSeconds }) => ({
  title: 'Clear from the list',
  body: [
    `The row leaves this list. ${libraryCopyText(recording)}`,
    'To delete the episode for good, delete it in your media player or from your library folder.',
    `For ${undoSeconds} seconds, UNDO puts the row back.`,
  ],
  confirmLabel: 'CLEAR FROM LIST',
  busyLabel: 'CLEARING…',
  danger: true,
})

const clearHeldRowConfirm = ({ recording }) => ({
  title: 'Clear from the list',
  body: [
    'The row leaves this list. TVHeadend keeps the recording.',
    'While TVHeadend has the recording, the next sync adds the row back and decides again whether to import it.',
  ],
  confirmLabel: 'CLEAR FROM LIST',
  busyLabel: 'CLEARING…',
  danger: true,
})

const libraryCopyText = (recording) => {
  if (!recording.file_path) return ''
  if (recording.library_file_present === false) {
    return `Freetvarr cannot find your library copy at ${recording.file_path}.`
  }
  return `Your library copy stays at ${recording.file_path}, and your media player still plays it.`
}

const scanTimeText = (recording) => {
  const minutes = scanMinutesOf(recording.duration_s)
  if (minutes == null) return 'Finding the ads takes several minutes'
  return `Finding the ads takes about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

const lastResultText = (recording) => {
  if (recording.ad_status === 'no_breaks') return 'This replaces the last result: no ad breaks found.'
  const count = breakCountOf(recording.ad_breaks_json)
  if (!count) return ''
  return `This replaces the last result: ${count} ${count === 1 ? 'break' : 'breaks'} found.`
}

const breakCountOf = (json) => {
  try {
    const breaks = JSON.parse(json || '[]')
    return Array.isArray(breaks) ? breaks.length : 0
  } catch {
    return 0
  }
}

const edlNameOf = (filePath) => {
  const name = fileNameOf(filePath)
  const dot = name.lastIndexOf('.')
  return `${dot > 0 ? name.slice(0, dot) : name}.edl`
}

const daysText = (days) => {
  const count = Number.parseInt(days, 10) > 0 ? Number.parseInt(days, 10) : 7
  return `${count} ${count === 1 ? 'day' : 'days'}`
}
