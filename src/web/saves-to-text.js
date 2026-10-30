export const unfiledShowText = (savesTo) => {
  if (savesTo?.kind === 'newFolder') {
    return `This show has no folder in your TV library yet. The next import makes a new folder for it: ${savesTo.path}.`
  }
  if (savesTo?.kind === 'oneOff') return `This show is in One-offs, so its episodes save to ${savesTo.path}.`
  return 'This show has no folder in your TV library, so its episodes wait in the recording log.'
}

export const libraryNoteOf = ({ program, addToLibrary, folder, moviesFolderSet }) => {
  if (!program) return { text: '' }
  if (!addToLibrary) return { text: 'Stays in TVHeadend. Freetvarr does not import it.' }
  if (folder) return { text: `Episodes go into ${folder.dest_folder} in your TV library.`, changeable: true }
  if (moviesFolderSet && program.kind === 'movie') return { text: 'The guide lists this as a film, so it goes to the movies folder.' }
  if (!program.series_link) return { text: IMPORT_DECIDES }
  return { text: `${IMPORT_DECIDES} Record series gives the series its own folder in your TV library.`, changeable: true }
}

const IMPORT_DECIDES = 'A season number in the TV guide, or recordings on two or more days, put it in a show folder in your TV library. Otherwise it goes to the one-off folder.'
