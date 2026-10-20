import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import BrowserFrame from './BrowserFrame.vue'
import FetchBanner from './FetchBanner.vue'
import NavWordmark from './NavWordmark.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp: ({ app }) => {
    app.component('BrowserFrame', BrowserFrame)
  },
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'layout-top': () => h(FetchBanner),
      'nav-bar-title-after': () => h(NavWordmark),
      'home-hero-image': () => h(BrowserFrame)
    })
}
