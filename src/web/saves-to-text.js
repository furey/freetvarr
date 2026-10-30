export const unfiledShowText = (savesTo) => {
  if (savesTo?.kind === 'newFolder') {
    return `This show has no folder in your TV library yet. The next import makes a new folder for it: ${savesTo.path}.`
  }
  if (savesTo?.kind === 'oneOff') return `This show is in One-offs, so its episodes save to ${savesTo.path}.`
  return 'This show has no folder in your TV library, so its episodes wait in the recording log.'
}
