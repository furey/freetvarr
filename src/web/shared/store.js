import { ref } from '/vendor/vue.esm-browser.prod.js'

export const guideHandoff = ref(null)
export const refreshTick = ref(0)

export const recordDialogOverPlayer = ref(false)

export const openInGuide = (handoff) => {
  guideHandoff.value = handoff
  window.location.hash = '#/guide'
}
