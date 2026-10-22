export const wizardSkipConfirm = ({ tvhConnected }) => ({
  title: 'Finish setup later',
  body: [
    'Setup is not finished. Freetvarr keeps what you saved so far and opens Settings.',
    ...(tvhConnected ? [] : ['Freetvarr cannot record until it connects to TVHeadend.']),
    'To finish later, open Settings → System → Setup.',
  ],
  confirmLabel: 'Finish later',
  busyLabel: 'Leaving…',
  danger: false,
})
