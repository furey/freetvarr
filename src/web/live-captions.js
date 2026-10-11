export const captionsShowing = (tracks) => tracks.some((track) => track.mode === 'showing')

export const captionPreferenceAfterChange = ({ observedShowing, expectedShowing, preference }) =>
  observedShowing === expectedShowing ? preference : observedShowing
