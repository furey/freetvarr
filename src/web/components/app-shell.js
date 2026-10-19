import { computed } from '/vendor/vue.esm-browser.prod.js'
import { NAV_DESTINATIONS, activeDestinationOf } from '/route-table.js'
import { route } from '/shared/router.js'
import { syncStatus } from '/shared/sync-status.js'

const NAV_ICONS = {
  home: 'home-nav-icon',
  live: 'live-nav-icon',
  guide: 'guide-nav-icon',
  recordings: 'recordings-nav-icon',
  settings: 'settings-nav-icon',
}

export const BrandMark = {
  props: { small: Boolean },
  template: `
    <span :class="['app-brand-mark', { 'is-small': small, 'is-syncing': syncing }]" role="img" aria-label="Freetvarr">
      <span></span><span></span><span></span>
    </span>
  `,
  setup: () => ({ syncing: computed(() => Boolean(syncStatus.value.activeSyncId)) }),
}

export const AppNav = {
  template: `
    <nav class="app-rail" aria-label="Main">
      <a href="#/home" class="no-hover-underline" aria-label="Freetvarr home"><brand-mark /></a>
      <template v-for="item in items" :key="item.key">
        <span v-if="item.key === 'settings'" class="app-rail-spacer"></span>
        <a :href="item.href" class="app-nav-item" :aria-current="item.key === active ? 'page' : null">
          <span class="app-nav-pill"><component :is="item.icon" /></span>{{ item.label }}
        </a>
      </template>
    </nav>
    <nav class="app-tabbar" aria-label="Main">
      <a v-for="item in items" :key="item.key" :href="item.href" class="app-nav-item"
        :aria-current="item.key === active ? 'page' : null">
        <span class="app-nav-pill"><component :is="item.icon" /></span>{{ item.label }}
      </a>
    </nav>
  `,
  setup() {
    const items = NAV_DESTINATIONS.map((item) => ({ ...item, icon: NAV_ICONS[item.key] }))
    const active = computed(() => activeDestinationOf(route.value))
    return { items, active }
  },
}
