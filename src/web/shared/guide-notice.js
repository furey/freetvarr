import { ref } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'

export const guideNotice = ref({ show: false, added: 0 })

export const loadGuideNotice = async ({ fresh = false } = {}) => {
  if (loaded && !fresh) return guideNotice.value
  loaded = true
  guideNotice.value = await api('GET', '/api/guide-sources/notice').catch(() => ({ show: false, added: 0 }))
  return guideNotice.value
}

export const hideGuideNotice = async () => {
  guideNotice.value = { ...guideNotice.value, show: false }
  await api('POST', '/api/guide-sources/notice/hide').catch(() => {})
}

let loaded = false
