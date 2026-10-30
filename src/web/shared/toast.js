import { shallowRef } from '/vendor/vue.esm-browser.prod.js'
import { createToastQueue } from '/toast-queue.js'

export const currentToast = shallowRef(null)

const queue = createToastQueue({ onChange: (next) => { currentToast.value = next } })

export const toast = ({ text, detail = '', kind = 'ok', action = null, persist = false }) =>
  queue.show({ text, detail, kind, action, persist })

export const dismissToast = (id) => queue.dismiss(id)

export const pauseToast = (reason) => queue.pause(reason)

export const resumeToast = (reason) => queue.resume(reason)

export const runToastAction = () => {
  const shown = currentToast.value
  if (!shown?.action) return
  queue.dismiss(shown.id)
  shown.action.run()
}
