export const SCAN_REALTIME_FACTOR = 0.5
export const TOMBSTONE_DAYS = 30

export const removeFromTvhConfirm = ({ recording }) => ({
  title: 'Remove from TVHeadend',
  body: [
    'TVHeadend deletes its copy of the recording.',
    libraryCopyText(recording),
    'TVHeadend keeps a note that it recorded this episode, so a series recording does not record it again.'
      + ' TVHeadend also deletes any re-record it has scheduled for this episode.',
    'This takes a few seconds. You cannot undo it.',
  ],
  confirmLabel: 'Remove from TVHeadend',
  busyLabel: 'Removing…',
  danger: true,
})

export const clearRowConfirm = ({ recording, undoSeconds }) => (recording.deleted_from_tvh_at
  ? clearRemovedRowConfirm({ recording, undoSeconds })
  : clearHeldRowConfirm({ recording }))

export const clearListConfirm = ({ count, undoSeconds }) => {
  const one = count === 1
  return {
    title: `Clear ${count} ${one ? 'row' : 'rows'} from the log`,
    body: [
      `TVHeadend no longer has ${one ? 'this recording' : 'these recordings'}.`
        + ` ${one ? 'Its row leaves' : 'Their rows leave'} this list, on every page and filter.`,
      `${one ? 'The file stays' : 'The files stay'} in your library, and your media player still shows`
        + ` ${one ? 'it' : 'them'}. To delete ${one ? 'it' : 'them'} for good, delete ${one ? 'it' : 'them'}`
        + ' in your media player or from your library folder.',
      `For ${undoSeconds} seconds, Undo puts the ${one ? 'row' : 'rows'} back.`
        + ` Without a clear, rows like these leave the list ${TOMBSTONE_DAYS} days after TVHeadend removed them.`,
    ],
    confirmLabel: 'Clear',
    busyLabel: 'Clearing…',
  }
}

export const scanMinutesOf = (durationSeconds) => {
  const seconds = Number(durationSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.max(1, Math.round((seconds * SCAN_REALTIME_FACTOR) / 60))
}

export const fileNameOf = (filePath) => String(filePath || '').split('/').pop()

const clearRemovedRowConfirm = ({ recording, undoSeconds }) => ({
  title: 'Clear from the list',
  body: [
    `The row leaves this list. ${libraryCopyText(recording)}`,
    'To delete the episode for good, delete it in your media player or from your library folder.',
    `For ${undoSeconds} seconds, Undo puts the row back.`,
  ],
  confirmLabel: 'Clear from list',
  busyLabel: 'Clearing…',
  danger: true,
})

const clearHeldRowConfirm = ({ recording }) => ({
  title: 'Clear from the list',
  body: [
    'The row leaves this list. TVHeadend keeps the recording.',
    'While TVHeadend has the recording, the next sync adds the row back and decides again whether to import it.',
  ],
  confirmLabel: 'Clear from list',
  busyLabel: 'Clearing…',
  danger: true,
})

const libraryCopyText = (recording) => {
  if (!recording.file_path) return ''
  if (recording.library_file_present === false) {
    return `Freetvarr cannot find your library copy at ${recording.file_path}.`
  }
  return `Your library copy stays at ${recording.file_path}, and your media player still plays it.`
}
