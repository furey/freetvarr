import { computed } from '/vendor/vue.esm-browser.prod.js'
import { attentionPhraseOf, healthBadgeOf, healthReasonOf, healthRowNameOf } from '/health-level.js'
import { settingsPageOf, SETTINGS_GROUPS } from '/settings-pages.js'
import { useMediaQuery } from '/shared/composables.js'
import { PHONE_LAYOUT_QUERY } from '/shared/constants.js'
import { playBrandIntro } from '/components/brand-intro-overlay.js'
import { health } from '/shared/health.js'
import { cameFromHash, routeParams } from '/shared/router.js'
import { hashesMatch } from '/scroll-memory.js'
import { prefersReducedMotion } from '/shared/utils.js'
import { DoctorView } from '/views/doctor-view.js'
import { PlayerSettingsView } from '/views/player-settings-view.js'
import { RecordingsView } from '/views/recordings-view.js'
import { SeriesView } from '/views/series-view.js'
import { SettingsView } from '/views/settings-view.js'
import { SetupSettingsView } from '/views/setup-settings-view.js'
import { SuggestionsSettingsView } from '/views/suggestions-settings-view.js'
import { SyncsView } from '/views/syncs-view.js'

const SYSTEM_VIEWS = {
  setup: { view: SetupSettingsView, props: {} },
  health: { view: DoctorView, props: {} },
  activity: { view: SyncsView, props: {} },
  series: { view: SeriesView, props: { part: 'series' } },
  folders: { view: SeriesView, props: { part: 'folders' } },
  log: { view: RecordingsView, props: {} },
}

const SETTINGS_INDEX_HASH = '#/settings'

const PAGES_WITH_OWN_HEADER = ['health']

const PAGE_INTROS = {
  setup: 'What Freetvarr uses now. Press a part to check or change it.',
  activity: 'Every sync Freetvarr has run, newest first.',
  series: 'Series recordings in TVHeadend, and the folder each one saves to.',
  log: 'Every recording TVHeadend has finished, and what Freetvarr did with it.',
  player: 'How the player starts and behaves on this device.',
  'for-you': 'For you picks shows from the guide based on what this household watches and records.',
  about: 'Records free-to-air TV from your TVHeadend-compatible tuner and saves it where your media player finds it.',
}

export const SettingsShell = {
  template: `
    <div class="settings-shell">
      <nav v-if="showNav" class="settings-nav" aria-label="Settings sections">
        <h1 class="ui-page-title settings-nav-title">Settings</h1>
        <template v-for="group in groups" :key="group.key">
          <h2 class="settings-nav-group">{{ group.label }}<template v-if="group.key === 'system' && healthBadge">
            <span :class="['ui-dot', 'settings-nav-group-dot', 'is-' + healthBadge]" aria-hidden="true"></span><span class="ui-visually-hidden">, {{ attentionPhrase }}</span></template></h2>
          <div class="settings-nav-list">
            <a v-for="item in group.pages" :key="item.id" :href="item.href" class="settings-nav-link"
              :aria-current="page && item.id === page.id ? 'page' : null" :aria-label="item.id === 'health' && healthBadge ? healthRowName : null">
              <span class="settings-nav-label">{{ item.label }}<span v-if="item.id === 'health' && healthBadge"
                :class="['settings-nav-reason', 'is-' + healthBadge]">{{ healthReason }}</span></span>
              <span v-if="item.id === 'health' && healthBadge" :class="['ui-dot', 'is-' + healthBadge]" aria-hidden="true"></span>
              <chevron-glyph class="settings-nav-chevron ui-only-phone" />
            </a>
          </div>
        </template>
      </nav>
      <main v-if="page" class="settings-content" :data-settings-page="page.id" :data-settings-section="page.section || null">
        <a href="#/settings" class="settings-back ui-only-phone" @click="backToSettings"><back-glyph /> Settings</a>
        <header v-if="!ownHeader" class="settings-page-header">
          <h2 v-if="page.id === 'about'" class="settings-page-title settings-about-title">
            <span class="ui-visually-hidden">About </span>
            <button v-if="canReplayIntro" type="button" class="brand-wordmark-button" aria-label="Freetvarr, play the intro" @click="replayIntro">
              <brand-wordmark class="settings-about-wordmark" data-intro-target />
            </button>
            <brand-wordmark v-else class="settings-about-wordmark" />
          </h2>
          <h2 v-else class="settings-page-title">{{ page.label }}</h2>
          <p v-if="intro" class="settings-page-intro">{{ intro }}</p>
        </header>
        <component :is="pageView.view" v-bind="pageView.props" :key="page.view === 'settings' ? 'settings' : page.id" />
      </main>
    </div>
  `,
  setup() {
    const narrow = useMediaQuery(PHONE_LAYOUT_QUERY)
    const page = computed(() => settingsPageOf({ params: routeParams.value, narrow: narrow.value }))
    const showNav = computed(() => !narrow.value || !page.value)
    const pageView = computed(() => {
      if (page.value?.view === 'system') return SYSTEM_VIEWS[page.value.id]
      if (page.value?.view === 'for-you') return { view: SuggestionsSettingsView, props: {} }
      if (page.value?.view === 'player') return { view: PlayerSettingsView, props: {} }
      return { view: SettingsView, props: {} }
    })
    const ownHeader = computed(() => PAGES_WITH_OWN_HEADER.includes(page.value?.id))
    const intro = computed(() => PAGE_INTROS[page.value?.id] || '')
    const healthBadge = computed(() => healthBadgeOf(health.value))
    const attentionPhrase = computed(() => attentionPhraseOf(healthBadge.value))
    const healthReason = computed(() => healthReasonOf(health.value.sentence))
    const healthRowName = computed(() => healthRowNameOf({ label: 'Health', badge: healthBadge.value, sentence: health.value.sentence }))
    const canReplayIntro = !prefersReducedMotion()
    const replayIntro = () => playBrandIntro()
    const backToSettings = (event) => {
      if (!hashesMatch(cameFromHash.value, SETTINGS_INDEX_HASH)) return
      event.preventDefault()
      history.back()
    }
    return {
      groups: SETTINGS_GROUPS,
      page,
      showNav,
      pageView,
      ownHeader,
      intro,
      healthBadge,
      attentionPhrase,
      healthReason,
      healthRowName,
      canReplayIntro,
      replayIntro,
      backToSettings,
    }
  },
}
