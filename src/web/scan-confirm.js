export const needsScanConfirm = ({ channels }) => Number(channels) > 0

export const scanConfirmOf = ({ networkName = '', existingNetwork = true, channels = 0, recordingWarning = '' }) => ({
  title: 'Scan for channels again?',
  changes: [existingNetwork
    ? {
      icon: 'refresh',
      title: networkName ? `Every frequency of ${networkName}` : 'Every frequency of your TV network',
      detail: 'TVHeadend scans each one again, and Freetvarr adds any new channels it finds',
    }
    : {
      icon: 'refresh',
      title: networkName ? `${networkName}, as a new TV network` : 'A new TV network',
      detail: 'TVHeadend scans it, and Freetvarr adds the channels it finds',
    }],
  stays: [
    {
      icon: 'check',
      title: channels === 1 ? 'The channel you have now' : `The ${channels} channels you have now`,
      detail: 'The scan only adds channels. Your favourites stay as they are',
    },
    {
      icon: 'check',
      title: 'Live TV and recordings',
      detail: 'They keep their tuners. The scan uses a free tuner, and waits when none is free',
    },
  ],
  note: [SCAN_TIME_TEXT, recordingWarning].filter(Boolean).join(' '),
  noteIcon: recordingWarning ? 'warning' : 'clock',
  undo: '',
  goLabel: 'Scan again',
  busyLabel: 'Starting…',
  danger: false,
})

const SCAN_TIME_TEXT = 'A scan takes a few minutes.'
