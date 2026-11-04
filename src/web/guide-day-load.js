export const dayLoadWritesOf = ({ requestedDay, shownDay, outcome }) => {
  if (requestedDay !== shownDay) return {}
  if (outcome.kind === 'no-url') return { errorCode: 'no-url', loading: false }
  if (outcome.kind === 'failed') return { error: `TV guide load failed: ${outcome.message}`, errorCode: outcome.code || '', loading: false }
  return { loading: false }
}
