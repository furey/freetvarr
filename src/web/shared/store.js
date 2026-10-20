import { ref } from '/vendor/vue.esm-browser.prod.js'

export const guideJump = ref(null)
export const refreshTick = ref(0)

export const showInGuide = (jump) => {
  guideJump.value = jump
  window.location.hash = '#/guide'
}
