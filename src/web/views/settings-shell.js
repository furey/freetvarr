import { computed, watch } from '/vendor/vue.esm-browser.prod.js'
import { settingsPageOf, SETTINGS_GROUPS } from '/settings-pages.js'
import { useMediaQuery } from '/shared/composables.js'
import { EPG_NARROW_QUERY } from '/shared/constants.js'
import { health } from '/shared/health.js'
import { routeParams } from '/shared/router.js'
import { DoctorView } from '/views/doctor-view.js'
import { RecordingsView } from '/views/recordings-view.js'
import { SeriesView } from '/views/series-view.js'
import { SettingsView } from '/views/settings-view.js'
import { SyncsView } from '/views/syncs-view.js'

const SYSTEM_VIEWS = {
  health: DoctorView,
  activity: SyncsView,
  series: SeriesView,
  folders: SeriesView,
  log: RecordingsView,
}

export const SettingsShell = {
  template: `
    <div class="settings-shell">
      <nav v-if="showNav" class="settings-nav" aria-label="Settings sections">
        <h1 class="ui-page-title settings-nav-title">Settings</h1>
        <template v-for="group in groups" :key="group.key">
          <h2 class="settings-nav-group">{{ group.label }}</h2>
          <div class="settings-nav-list">
            <a v-for="item in group.pages" :key="item.id" :href="item.href" class="settings-nav-link"
              :aria-current="page && item.id === page.id ? 'page' : null">
              <span>{{ item.label }}</span>
              <span v-if="item.id === 'health' && health.known" :class="['ui-dot', healthDotClass]"></span>
              <chevron-glyph v-else class="settings-nav-chevron ui-only-phone" />
            </a>
          </div>
        </template>
      </nav>
      <main v-if="page" class="settings-content" :data-settings-section="page.section || null">
        <a href="#/settings" class="settings-back ui-only-phone"><back-glyph /> Settings</a>
        <header class="settings-page-header">
          <h2 class="settings-page-title">{{ page.label }}</h2>
        </header>
        <component :is="pageView" :key="page.view === 'settings' ? 'settings' : page.id" />
      </main>
    </div>
  `,
  setup() {
    const narrow = useMediaQuery(EPG_NARROW_QUERY)
    const page = computed(() => settingsPageOf({ params: routeParams.value, narrow: narrow.value }))
    const showNav = computed(() => !narrow.value || !page.value)
    const pageView = computed(() => (page.value?.view === 'system' ? SYSTEM_VIEWS[page.value.id] : SettingsView))
    const healthDotClass = computed(() => ({ ok: 'is-ok', warn: 'is-warn', fail: 'is-fail' })[health.value.level])
    watch(page, () => window.scrollTo({ top: 0 }))
    return { groups: SETTINGS_GROUPS, page, showNav, pageView, health, healthDotClass }
  },
}
