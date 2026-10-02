import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import BrowserFrame from './BrowserFrame.vue'
import FetchBanner from './FetchBanner.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-info-before': () => h(FetchBanner),
      'home-hero-image': () => h(BrowserFrame)
    })
}
