export const wizardSkipPrompt = ({ tvhConnected }) => {
  const cannotRecord = tvhConnected ? '' : 'Freetvarr cannot record until it connects to TVHeadend.\n\n'
  return 'Leave setup now?\n\n'
    + 'Setup is not finished. Freetvarr keeps what you saved so far.\n\n'
    + cannotRecord
    + 'To finish later, open Settings → Setup wizard → REOPEN WIZARD.'
}
