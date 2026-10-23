export const createResponseOrder = () => {
  let issued = 0
  let applied = 0
  const issue = () => {
    issued += 1
    return issued
  }
  const accept = (ticket) => {
    if (ticket < applied) return false
    applied = ticket
    return true
  }
  const isLatest = (ticket) => ticket === issued
  return { issue, accept, isLatest }
}
