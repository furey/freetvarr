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

export const latestOnly = (order = createResponseOrder()) => async (request) => {
  const ticket = order.issue()
  const result = await request()
  return order.isLatest(ticket) ? { latest: true, result } : { latest: false, result: null }
}
