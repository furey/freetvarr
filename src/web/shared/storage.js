import { ref, watch } from '/vendor/vue.esm-browser.prod.js'

export const browserStorage = () => {
  try {
    return localStorage
  } catch {
    return null
  }
}

export const storedFlag = ({ key, fallback }) => {
  const read = () => {
    try {
      const stored = localStorage.getItem(key)
      return stored == null ? fallback : stored === '1'
    } catch {
      return fallback
    }
  }
  const flag = ref(read())
  watch(flag, (on) => {
    try { localStorage.setItem(key, on ? '1' : '0') } catch {}
  })
  return flag
}

export const storedChoice = ({ key, options, fallback }) => {
  const read = () => {
    try {
      const stored = localStorage.getItem(key)
      return options.includes(stored) ? stored : fallback
    } catch {
      return fallback
    }
  }
  const choice = ref(read())
  watch(choice, (value) => {
    try { localStorage.setItem(key, value) } catch {}
  })
  return choice
}
