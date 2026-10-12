export const wizardSkipConfirm = ({ tvhConnected }) => ({
  title: 'Finish setup later',
  body: [
    'Setup is not finished. Freetvarr keeps what you saved so far and opens SETTINGS.',
    ...(tvhConnected ? [] : ['Freetvarr cannot record until it connects to TVHeadend.']),
    'To finish later, open SETTINGS → HELP → REOPEN WIZARD.',
  ],
  confirmLabel: 'FINISH LATER',
  busyLabel: 'LEAVING…',
  danger: false,
})
