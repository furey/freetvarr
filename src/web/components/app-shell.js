import { computed, ref } from '/vendor/vue.esm-browser.prod.js'
import { badgedNameOf, healthBadgeOf } from '/health-level.js'
import { NAV_DESTINATIONS, activeDestinationOf } from '/route-table.js'
import { api } from '/shared/api.js'
import { health } from '/shared/health.js'
import { route } from '/shared/router.js'
import { syncStatus } from '/shared/sync-status.js'
import { ForYouNavIcon } from '/components/nav-icons.js'
import { forYouShown } from '/shared/for-you-session.js'

const NAV_ICONS = {
  home: 'home-nav-icon',
  live: 'live-nav-icon',
  guide: 'guide-nav-icon',
  recordings: 'recordings-nav-icon',
  'for-you': 'for-you-nav-icon',
  settings: 'settings-nav-icon',
}

const FOR_YOU_DESTINATION = { key: 'for-you', label: 'For you', href: '#/for-you' }

const railDestinationsOf = () => NAV_DESTINATIONS.flatMap((item) => (
  item.key === 'home' ? [item, FOR_YOU_DESTINATION] : [item]
))

const railActiveOf = (view) => (view === 'for-you' ? 'for-you' : activeDestinationOf(view))

const refreshForYouShown = async () => {
  const settings = await api('GET', '/api/for-you/settings').catch(() => null)
  forYouShown.value = settings ? settings.enabled !== false : true
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
        <div :class="['app-rail-slot', { 'is-collapsed': item.collapsed, 'is-animated': animated }]" :inert="item.collapsed">
          <div class="app-rail-slot-inner">
            <a :href="item.href" class="app-nav-item" :aria-current="item.key === railActive ? 'page' : null" :aria-label="nameOf(item)">
              <span class="app-nav-pill"><span class="app-nav-icon"><component :is="item.icon" /><span v-if="badgeOf(item)" :class="['app-nav-badge', 'is-' + badgeOf(item)]" aria-hidden="true"></span></span></span>{{ item.label }}
            </a>
          </div>
        </div>
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
    const collapsedOf = (item) => item.key === 'for-you' && forYouShown.value !== true
    const railItems = computed(() => railDestinationsOf().map((item) => ({ ...withIcon(item), collapsed: collapsedOf(item) })))
    const animated = ref(false)
    const active = computed(() => activeDestinationOf(route.value))
    const railActive = computed(() => railActiveOf(route.value))
    refreshForYouShown().then(() => setTimeout(() => { animated.value = true }, 100))
    const settingsBadge = computed(() => healthBadgeOf(health.value))
    const badgeOf = (item) => (item.key === 'settings' ? settingsBadge.value : null)
    const nameOf = (item) => (badgeOf(item) ? badgedNameOf({ label: item.label, badge: badgeOf(item) }) : null)
    return { tabItems, railItems, animated, active, railActive, badgeOf, nameOf }
  },
}
