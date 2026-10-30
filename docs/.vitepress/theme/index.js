import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import { h, onMounted, watch } from 'vue'
import BrowserFrame from './BrowserFrame.vue'
import FetchBanner from './FetchBanner.vue'
import NavWordmark from './NavWordmark.vue'
import './custom.css'

const themeColours = { dark: '#0b1117', light: '#ffffff' }

const syncThemeColour = (isDark) => {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', isDark ? themeColours.dark : themeColours.light)
}

export default {
  extends: DefaultTheme,
  enhanceApp: ({ app }) => {
    app.component('BrowserFrame', BrowserFrame)
  },
  setup: () => {
    const { isDark } = useData()
    onMounted(() => {
      watch(isDark, syncThemeColour, { immediate: true })
    })
  },
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'layout-top': () => h(FetchBanner),
      'nav-bar-title-after': () => h(NavWordmark),
      'home-hero-image': () => h(BrowserFrame)
    })
}
