export const createRequestGate = ({ limit }) => {
  let active = 0
  const waiting = []
  const grantWaiting = () => {
    while (active < limit && waiting.length) {
      active += 1
      waiting.shift().grant()
    }
  }
  const enter = (onGranted) => {
    let state = 'waiting'
    const ticket = { grant: () => { state = 'granted'; onGranted() } }
    waiting.push(ticket)
    grantWaiting()
    return () => {
      if (state === 'waiting') waiting.splice(waiting.indexOf(ticket), 1)
      if (state === 'granted') {
        active -= 1
        grantWaiting()
      }
      state = 'left'
    }
  }
  return { enter, activeCount: () => active, waitingCount: () => waiting.length }
}
