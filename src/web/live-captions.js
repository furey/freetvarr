export const CAPTION_LINE_PERCENT = 85

export const captionsShowing = (tracks) => tracks.some((track) => track.mode === 'showing')

export const captionPreferenceAfterChange = ({ observedShowing, expectedShowing, preference }) =>
  observedShowing === expectedShowing ? preference : observedShowing
