import DefaultTheme from 'vitepress/theme'
import { useData, useRoute } from 'vitepress'
import { h, onMounted, watch } from 'vue'
import BrowserFrame from './BrowserFrame.vue'
import DevicesHero from './DevicesHero.vue'
import DownloadApp from './DownloadApp.vue'
import FetchBanner from './FetchBanner.vue'
import Illustration from './Illustration.vue'
import NavWordmark from './NavWordmark.vue'
import YouTubeVideo from './YouTubeVideo.vue'
import { realignHashAfterReflow } from './hashRealign.js'
import './custom.css'
import './illustrations.css'

const themeColours = { dark: '#0b1117', light: '#ffffff' }

const syncThemeColour = (isDark) => {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', isDark ? themeColours.dark : themeColours.light)
}

export default {
  extends: DefaultTheme,
  enhanceApp: ({ app }) => {
    app.component('BrowserFrame', BrowserFrame)
    app.component('DownloadApp', DownloadApp)
    app.component('Illustration', Illustration)
    app.component('YouTubeVideo', YouTubeVideo)
  },
  setup: () => {
    const { isDark } = useData()
    const route = useRoute()
    onMounted(() => {
      watch(isDark, syncThemeColour, { immediate: true })
      watch(() => route.path, () => realignHashAfterReflow(location.hash))
      realignHashAfterReflow(location.hash)
    })
  },
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'layout-top': () => [h(FetchBanner), h('div', { class: 'ftv-bar-ruler', 'aria-hidden': 'true' })],
      'nav-bar-title-after': () => h(NavWordmark),
      'home-hero-image': () => h(DevicesHero)
    })
}
