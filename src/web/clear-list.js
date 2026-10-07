export const clearListPrompt = ({ count, plexConfigured }) => {
  const one = count === 1
  const noun = one ? 'recording' : 'recordings'
  const copies = one ? 'its copy' : 'its copies'
  const files = one ? 'The file stays' : 'The files stay'
  const plexClause = plexConfigured ? `, and Plex still shows ${one ? 'it' : 'them'}` : ''
  return `Hide ${count} ${noun} from this list?\n\n`
    + `TVHeadend deleted ${copies}. ${files} in your library${plexClause}.`
}

export const clearedListMessage = (count) =>
  `Cleared ${count} row${count === 1 ? '' : 's'} from the list.`

export const restoredListMessage = (count) =>
  `Put back ${count} row${count === 1 ? '' : 's'}.`
