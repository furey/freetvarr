export const clearListPrompt = (count) => {
  const one = count === 1
  return `Hide ${count} ${one ? 'recording' : 'recordings'} that TVHeadend no longer has from this list?\n\n`
    + `${one ? 'The recording file stays' : 'The recording files stay'} in your media library. `
    + `Your media player (e.g. Plex or Kodi) still shows ${one ? 'it' : 'them'}.\n\n`
    + `To delete ${one ? 'it' : 'them'} for good, delete ${one ? 'it' : 'them'} in your media player `
    + 'or from your library folder.'
}

export const clearedListMessage = (count) =>
  `Cleared ${count} row${count === 1 ? '' : 's'} from the list.`

export const restoredListMessage = (count) =>
  `Put back ${count} row${count === 1 ? '' : 's'}.`
