import { computed, ref, watch } from '/vendor/vue.esm-browser.prod.js'
import { badgedNameOf, healthBadgeOf } from '/health-level.js'
import { NAV_DESTINATIONS, RAIL_DESTINATIONS, activeDestinationOf } from '/route-table.js'
import { api } from '/shared/api.js'
import { health } from '/shared/health.js'
import { route } from '/shared/router.js'
import { syncStatus } from '/shared/sync-status.js'
import { ForYouNavIcon } from '/components/nav-icons.js'
import { forYouReady, forYouShown, keepForYouAnimate, keepForYouRail, twinkleForYouOnce } from '/shared/for-you-session.js'
import { FOR_YOU_URL, forYouReadyOf } from '/for-you.js'
import { hashesMatch } from '/scroll-memory.js'
import { cancelRouteHover, warmRouteOnHover, warmRouteOnPress } from '/shared/route-warmup.js'

const NAV_ICONS = {
  home: 'home-nav-icon',
  live: 'live-nav-icon',
  guide: 'guide-nav-icon',
  recordings: 'recordings-nav-icon',
  'for-you': 'for-you-nav-icon',
  settings: 'settings-nav-icon',
}

const railActiveOf = ({ view, forYouInRail }) => (view === 'for-you' && forYouInRail ? 'for-you' : activeDestinationOf(view))

const refreshForYouShown = async () => {
  const [settings, payload] = await Promise.all([
    api('GET', '/api/for-you/settings').catch(() => null),
    api('GET', `${FOR_YOU_URL}?limit=1`).catch(() => null),
  ])
  if (settings) keepForYouAnimate(settings.animateIcon !== false)
  keepForYouRail({ shown: settings ? settings.enabled !== false : true, ready: forYouReadyOf({ settings, payload }) })
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

const scrollTopOnRepeatTap = (event) => {
  const href = event.currentTarget.getAttribute('href')
  if (!hashesMatch(href, window.location.hash)) return
  event.preventDefault()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

export const AppNav = {
  template: `
    <nav class="app-rail" aria-label="Main">
      <a href="#/home" class="app-brand-link" aria-label="Freetvarr home" @click="scrollTopOnRepeatTap"><brand-mark /></a>
      <template v-for="item in railItems" :key="item.key">
        <span v-if="item.key === 'settings'" class="app-rail-spacer"></span>
        <div :class="['app-rail-slot', { 'is-collapsed': item.collapsed, 'is-animated': animated }]" :inert="item.collapsed">
          <div class="app-rail-slot-inner">
            <a :href="item.href" class="app-nav-item" :aria-current="item.key === railActive ? 'page' : null" :aria-label="nameOf(item)" @click="scrollTopOnRepeatTap"
              @pointerdown.passive="warmRouteOnPress" @pointerenter="warmRouteOnHover" @pointerleave="cancelRouteHover">
              <span class="app-nav-pill"><span class="app-nav-icon"><component :is="item.icon" /><span v-if="badgeOf(item)" :class="['app-nav-badge', 'is-' + badgeOf(item)]" aria-hidden="true"></span></span></span>{{ item.label }}
            </a>
          </div>
        </div>
      </template>
    </nav>
    <nav class="app-tabbar" aria-label="Main">
      <a v-for="item in tabItems" :key="item.key" :href="item.href" class="app-nav-item"
        :aria-current="item.key === active ? 'page' : null" :aria-label="nameOf(item)" @click="scrollTopOnRepeatTap"
        @pointerdown.passive="warmRouteOnPress" @touchstart.passive="warmRouteOnPress">
        <span class="app-nav-pill"><span class="app-nav-icon"><component :is="item.icon" /><span v-if="badgeOf(item)" :class="['app-nav-badge', 'is-' + badgeOf(item)]" aria-hidden="true"></span></span></span>{{ item.label }}
      </a>
    </nav>
  `,
  components: { ForYouNavIcon },
  setup() {
    const withIcon = (item) => ({ ...item, icon: NAV_ICONS[item.key] })
    const tabItems = NAV_DESTINATIONS.map(withIcon)
    const forYouInRail = computed(() => forYouShown.value === true && forYouReady.value)
    watch(forYouInRail, (inRail) => { if (inRail) twinkleForYouOnce() }, { immediate: true })
    const collapsedOf = (item) => item.key === 'for-you' && !forYouInRail.value
    const railItems = computed(() => RAIL_DESTINATIONS.map((item) => ({ ...withIcon(item), collapsed: collapsedOf(item) })))
    const animated = ref(false)
    const active = computed(() => activeDestinationOf(route.value))
    const railActive = computed(() => railActiveOf({ view: route.value, forYouInRail: forYouInRail.value }))
    watch(() => route.value, (view) => { if (view === 'home' || view === 'for-you') refreshForYouShown() })
    refreshForYouShown().then(() => setTimeout(() => { animated.value = true }, 100))
    const settingsBadge = computed(() => healthBadgeOf(health.value))
    const badgeOf = (item) => (item.key === 'settings' ? settingsBadge.value : null)
    const nameOf = (item) => (badgeOf(item) ? badgedNameOf({ label: item.label, badge: badgeOf(item) }) : null)
    return {
      tabItems,
      railItems,
      animated,
      active,
      railActive,
      badgeOf,
      nameOf,
      scrollTopOnRepeatTap,
      warmRouteOnPress,
      warmRouteOnHover,
      cancelRouteHover,
    }
  },
}
