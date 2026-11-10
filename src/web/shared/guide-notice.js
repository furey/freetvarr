import { ref } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'

const readPageNotice = () => {
  try {
    const parsed = JSON.parse(document.querySelector('meta[name="freetvarr-guide-notice"]')?.content || 'null')
    return parsed && typeof parsed === 'object' ? { show: Boolean(parsed.show), added: Number(parsed.added) || 0 } : null
  } catch {
    return null
  }
}

export const guideNotice = ref(readPageNotice() ?? { show: false, added: 0 })

export const loadGuideNotice = async ({ fresh = false } = {}) => {
  if (loaded && !fresh) return guideNotice.value
  loaded = true
  const latest = await api('GET', `/api/guide-sources/notice${fresh ? '?fresh=1' : ''}`).catch(() => null)
  if (!latest) return guideNotice.value
  if (fresh || !latest.show) guideNotice.value = latest
  return guideNotice.value
}

export const hideGuideNotice = async () => {
  guideNotice.value = { ...guideNotice.value, show: false }
  await api('POST', '/api/guide-sources/notice/hide').catch(() => {})
}

let loaded = false
