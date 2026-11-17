export const labellerStatusLineOf = (state) => {
  if (!state?.key_set) return { text: '', kind: 'info' }
  if (state.key_rejected) return { text: 'TypeSafe did not accept the saved key, so Freetvarr stopped asking Jev. Paste a new key or remove it.', kind: 'err' }
  if (state.key_no_credit) {
    return {
      text: 'Your TypeSafe account is out of credit, so Freetvarr stopped asking Jev. Add credit under Billing in the TypeSafe console at',
      address: 'console.typesafe.ai',
      after: '; Freetvarr tries again once a day.',
      kind: 'err',
    }
  }
  const count = Number(state.labelled) || 0
  const labelled = count
    ? `Jev has labelled ${count} guide ${count === 1 ? 'title' : 'titles'}.`
    : 'Jev labels the guide titles after the next guide load.'
  if (state.last_error) return { text: `${labelled} Last run: ${state.last_error}`, kind: 'info' }
  return { text: labelled, kind: 'info' }
}
