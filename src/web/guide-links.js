import { failureText } from './shared/request-errors.js'

export const guideLinksSaver = ({ send, onBusy, onError }) => {
  let busy = false
  return async (links) => {
    if (busy) return
    busy = true
    onBusy(true)
    onError('')
    try {
      await send(links)
    } catch (err) {
      onError(failureText({ action: 'Could not save the guide choices', err }))
      throw err
    } finally {
      busy = false
      onBusy(false)
    }
  }
}
