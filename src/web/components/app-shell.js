import { computed, ref, watch } from '/vendor/vue.esm-browser.prod.js'
import { badgedNameOf, healthBadgeOf } from '/health-level.js'
import { NAV_DESTINATIONS, activeDestinationOf } from '/route-table.js'
import { api } from '/shared/api.js'
import { health } from '/shared/health.js'
import { route } from '/shared/router.js'
import { syncStatus } from '/shared/sync-status.js'
import { ForYouNavIcon } from '/components/nav-icons.js'

const NAV_ICONS = {
  home: 'home-nav-icon',
  live: 'live-nav-icon',
  guide: 'guide-nav-icon',
  recordings: 'recordings-nav-icon',
  'for-you': 'for-you-nav-icon',
  settings: 'settings-nav-icon',
}

const FOR_YOU_DESTINATION = { key: 'for-you', label: 'For you', href: '#/for-you' }

const railDestinationsOf = (forYouShown) => NAV_DESTINATIONS.flatMap((item) => (
  item.key === 'recordings' && forYouShown ? [item, FOR_YOU_DESTINATION] : [item]
))

const railActiveOf = (view) => (view === 'for-you' ? 'for-you' : activeDestinationOf(view))

const forYouShown = ref(true)

const refreshForYouShown = async () => {
  const settings = await api('GET', '/api/for-you/settings').catch(() => null)
  if (settings) forYouShown.value = settings.enabled !== false
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
      <template v-for="item in railItems" :key="item.key">
        <span v-if="item.key === 'settings'" class="app-rail-spacer"></span>
        <a :href="item.href" class="app-nav-item" :aria-current="item.key === railActive ? 'page' : null" :aria-label="nameOf(item)">
          <span class="app-nav-pill"><span class="app-nav-icon"><component :is="item.icon" /><span v-if="badgeOf(item)" :class="['app-nav-badge', 'is-' + badgeOf(item)]" aria-hidden="true"></span></span></span>{{ item.label }}
        </a>
      </template>
    </nav>
    <nav class="app-tabbar" aria-label="Main">
      <a v-for="item in tabItems" :key="item.key" :href="item.href" class="app-nav-item"
        :aria-current="item.key === active ? 'page' : null" :aria-label="nameOf(item)">
        <span class="app-nav-pill"><span class="app-nav-icon"><component :is="item.icon" /><span v-if="badgeOf(item)" :class="['app-nav-badge', 'is-' + badgeOf(item)]" aria-hidden="true"></span></span></span>{{ item.label }}
      </a>
    </nav>
  `,
  components: { ForYouNavIcon },
  setup() {
    const withIcon = (item) => ({ ...item, icon: NAV_ICONS[item.key] })
    const tabItems = NAV_DESTINATIONS.map(withIcon)
    const railItems = computed(() => railDestinationsOf(forYouShown.value).map(withIcon))
    const active = computed(() => activeDestinationOf(route.value))
    const railActive = computed(() => railActiveOf(route.value))
    refreshForYouShown()
    watch(route, (view, previous) => { if (previous === 'settings') refreshForYouShown() })
    const settingsBadge = computed(() => healthBadgeOf(health.value))
    const badgeOf = (item) => (item.key === 'settings' ? settingsBadge.value : null)
    const nameOf = (item) => (badgeOf(item) ? badgedNameOf({ label: item.label, badge: badgeOf(item) }) : null)
    return { tabItems, railItems, active, railActive, badgeOf, nameOf }
  },
}
