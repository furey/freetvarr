export const deleteSyncConfirm = ({ syncId }) => ({
  title: `Delete sync #${syncId}`,
  body: [
    'The row for this sync leaves the history.',
    'The recordings it imported stay in your library and on the RECORDINGS tab. You cannot undo this.',
  ],
  confirmLabel: 'DELETE SYNC',
  busyLabel: 'DELETING…',
  danger: true,
})

export const clearSyncHistoryConfirm = ({ syncRunning }) => ({
  title: 'Clear the sync history',
  body: [
    syncRunning
      ? 'Every sync row leaves the history, except the sync running now.'
      : 'Every sync row leaves the history.',
    'The recordings those syncs imported stay in your library and on the RECORDINGS tab. You cannot undo this.',
  ],
  confirmLabel: 'CLEAR HISTORY',
  busyLabel: 'CLEARING…',
  danger: true,
})

export const restoreOpenAccessConfirm = () => ({
  title: 'Restore open access to TVHeadend',
  body: [
    'Freetvarr puts back the open access entry that SECURE TVHEADEND removed.',
    'Anyone on your network can then change TVHeadend without a login. The logins you made stay.',
  ],
  confirmLabel: 'RESTORE OPEN ACCESS',
  busyLabel: 'RESTORING…',
  danger: true,
})

export const resetConfirm = ({ mediaRoot }) => ({
  title: 'Reset Freetvarr',
  body: [
    "Freetvarr deletes its settings, series, list of recordings, and sync history."
      + ' The next time you open Freetvarr, the setup wizard starts from the beginning.',
    `Your video files in ${mediaRoot || '/media/tv'} and the other library folders stay where they are,`
      + ' and so do the recordings and settings in TVHeadend.',
    'You cannot undo this.',
  ],
  confirmLabel: 'RESET FREETVARR',
  busyLabel: 'RESETTING…',
  danger: true,
})
