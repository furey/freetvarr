import { ref, computed, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { ConfirmDialog, useConfirm } from '/components/dialogs.js'
import {
  OTHER_LANGUAGE_OPTIONS,
  TIER_OVERRIDES,
  hiddenShowsOf,
  historyClearCopyOf,
  tierReasonOf,
  tierSummaryOf,
} from '/for-you.js'
import { api } from '/shared/api.js'
import { REPO_HREF, privacyLookupTextOf } from '/for-you-privacy.js'
import { dataCreditsOf } from '/data-credits.js'
import { forYouHidden, forYouShown, unhideShow } from '/shared/for-you-session.js'

export const SuggestionsSettingsView = {
  components: { ConfirmDialog },
  template: `
    <div v-page-reveal class="settings-page suggestions-settings">
      <p v-if="error" class="ui-banner is-error" role="alert">{{ error }}</p>

      <div class="settings-group">
        <h3 class="ui-group-label">For you</h3>
        <div class="ui-group">
          <div class="settings-row">
            <toggle-switch :model-value="settings.enabled !== false" class="settings-toggle" :pending="!loaded"
              @update:model-value="save({ enabled: $event })">
              <span class="settings-toggle-text">
                <span class="settings-row-title">Show For you</span>
                <span class="settings-row-meta">Adds For you to Home and the highlights</span>
              </span>
            </toggle-switch>
          </div>
          <div class="settings-row">
            <toggle-switch :model-value="Boolean(settings.genreLookup)" class="settings-toggle" :pending="!loaded"
              @update:model-value="save({ genreLookup: $event })">
              <span class="settings-toggle-text">
                <span class="settings-row-title">Use TVmaze and Wikidata to find genres</span>
                <span class="settings-row-meta">Show titles are sent to TVmaze and Wikidata to look up genres. Nothing else is sent.</span>
              </span>
            </toggle-switch>
            <p class="settings-row-meta suggestions-credit">
              <template v-for="(credit, i) in dataCredits" :key="credit.name">{{ i ? ' ' : '' }}{{ credit.lead }} from
                <a :href="credit.siteHref" target="_blank" rel="noopener noreferrer">{{ credit.name }}</a>, licensed
                <a :href="credit.licenceHref" target="_blank" rel="noopener noreferrer">{{ credit.licence }}</a>.</template>
            </p>
          </div>
          <div class="settings-row">
            <span class="settings-toggle-text">
              <span class="settings-row-title" id="suggestions-languages-title">Films in other languages</span>
              <span class="settings-row-meta">Films first made in a language other than English, usually with subtitles.</span>
            </span>
            <ui-segmented fill class="suggestions-languages" aria-labelledby="suggestions-languages-title"
              :model-value="loaded ? otherLanguageFilms : null" :disabled="!loaded" @update:model-value="save({ otherLanguageFilms: $event })"
              :options="languageOptions.map((option) => ({ value: option.key, label: option.label }))" />
          </div>
          <button type="button" class="ui-group-row suggestions-row-button" @click="hiddenOpen = true">
            <span class="settings-toggle-text">
              <span class="settings-row-title">Hidden shows</span>
              <span class="settings-row-meta">Shows you marked Not interested</span>
            </span>
            <span class="suggestions-count ui-tabular"><span v-if="!hiddenLoaded" class="ui-skeleton is-text" style="--skeleton-w: 1.2em"></span><template v-else>{{ hidden.length }}</template></span>
            <chevron-glyph class="suggestions-chevron" />
          </button>
        </div>
      </div>

      <div class="settings-group">
        <h3 class="ui-group-label">Suggestion level</h3>
        <div class="ui-group">
          <div class="settings-row suggestions-level">
            <span class="settings-toggle-text">
              <span class="settings-row-title"><span v-if="!loaded" class="ui-skeleton is-text" style="--skeleton-w: 13em"></span><template v-else>{{ tierSummary }}</template></span>
              <span class="settings-row-meta"><span v-if="!loaded" class="ui-skeleton is-text" style="--skeleton-w: 16em"></span><template v-else>{{ tierReason }}</template></span>
            </span>
            <button type="button" class="ui-button ui-button-secondary suggestions-probe" :disabled="probing || !loaded" @click="checkAgain">
              {{ probing ? 'Checking…' : 'Check again' }}
            </button>
          </div>
          <div class="settings-row">
            <ui-segmented fill class="suggestions-tiers" aria-label="Suggestion level"
              :model-value="loaded ? tierOverride : null" :disabled="!loaded" @update:model-value="save({ tierOverride: $event })"
              :options="tierOptions.map((option) => ({ value: option.key, label: option.label }))" />
            <p class="settings-row-meta suggestions-tier-note">Auto uses the level this box can run. Higher levels compare more about each show and use more of the processor.</p>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <h3 class="ui-group-label">Viewing history</h3>
        <div class="ui-group">
          <div class="settings-row">
            <toggle-switch :model-value="settings.historyEnabled === false" class="settings-toggle" :pending="!loaded"
              @update:model-value="save({ historyEnabled: !$event })">
              <span class="settings-toggle-text">
                <span class="settings-row-title">Pause history</span>
                <span class="settings-row-meta">Freetvarr stops noting what you watch until you turn this off</span>
              </span>
            </toggle-switch>
          </div>
          <div class="settings-row settings-row-inline">
            <span class="settings-toggle-text">
              <span class="settings-row-title">Clear viewing history</span>
              <span class="settings-row-meta"><span v-if="!countLoaded" class="ui-skeleton is-text" style="--skeleton-w: 20em"></span><template v-else>{{ clearCopy }}</template></span>
            </span>
            <button type="button" class="ui-button ui-button-destructive suggestions-clear" :disabled="!loaded" @click="askClear">Clear</button>
          </div>
        </div>
        <p class="suggestions-footnote">Your viewing history stays on this box. It is never sent anywhere. {{ lookupText }} No tracking, no analytics, and Freetvarr is <a :href="repoHref" target="_blank" rel="noopener noreferrer">open source</a>.</p>
      </div>

      <ui-sheet :open="hiddenOpen" title="Hidden shows" subtitle="For you leaves these out. Show one again to get suggestions for it." @close="hiddenOpen = false">
        <div v-if="hidden.length" class="ui-group">
          <div v-for="show in hidden" :key="show.seriesKey" class="ui-group-row suggestions-hidden-row">
            <span class="suggestions-hidden-title">{{ show.title || show.seriesKey }}</span>
            <button type="button" class="ui-button ui-button-secondary is-small" :disabled="unhiding === show.seriesKey"
              @click="showAgain(show)">Show again</button>
          </div>
        </div>
        <p v-else class="settings-row-meta">No hidden shows. Choose Not interested on a For you card to hide a show.</p>
      </ui-sheet>

      <confirm-dialog :open="Boolean(confirming)" :dialog="confirming?.dialog" :busy="confirmBusy"
        @confirm="runConfirmed" @cancel="closeConfirm" />
    </div>
  `,
  setup() {
    const settings = ref({})
    const hidden = ref([])
    const eventCount = ref(0)
    const loaded = ref(false)
    const hiddenLoaded = ref(false)
    const countLoaded = ref(false)
    const probing = ref(false)
    const hiddenOpen = ref(false)
    const unhiding = ref('')
    const error = ref('')
    const { confirming, confirmBusy, askConfirm, closeConfirm, runConfirmed } = useConfirm()

    const tierSummary = computed(() => tierSummaryOf(settings.value))
    const tierReason = computed(() => tierReasonOf(settings.value))
    const tierOverride = computed(() => settings.value.tierOverride || 'auto')
    const otherLanguageFilms = computed(() => settings.value.otherLanguageFilms || 'few')
    const clearCopy = computed(() => historyClearCopyOf(eventCount.value))
    const dataCredits = computed(() => dataCreditsOf(settings.value.attribution))
    const lookupText = computed(() => privacyLookupTextOf({ genreLookup: settings.value.genreLookup !== false }))

    const loadHidden = async () => {
      hidden.value = hiddenShowsOf(await api('GET', '/api/for-you/hidden').catch(() => []))
      hiddenLoaded.value = true
    }

    const loadCount = async () => {
      eventCount.value = (await api('GET', '/api/events/settings').catch(() => ({}))).event_count ?? 0
      countLoaded.value = true
    }

    const loadSettings = async () => {
      try {
        settings.value = await api('GET', '/api/for-you/settings')
        loaded.value = true
        forYouShown.value = settings.value.enabled !== false
      } catch (err) {
        error.value = err.status === 404
          ? 'For you is not ready on this box yet.'
          : `Could not load suggestion settings: ${err.message}`
      }
    }

    const load = () => Promise.all([loadSettings(), loadHidden(), loadCount()])

    const save = async (patch) => {
      const previous = settings.value
      settings.value = { ...previous, ...patch }
      forYouShown.value = settings.value.enabled !== false
      error.value = ''
      try {
        settings.value = { ...settings.value, ...(await api('PUT', '/api/for-you/settings', patch)) }
      } catch (err) {
        settings.value = previous
        error.value = `Could not save: ${err.message}`
      }
      forYouShown.value = settings.value.enabled !== false
    }

    const checkAgain = async () => {
      probing.value = true
      error.value = ''
      try {
        await api('POST', '/api/for-you/probe')
        settings.value = await api('GET', '/api/for-you/settings')
      } catch (err) {
        error.value = `Hardware check failed: ${err.message}`
      } finally {
        probing.value = false
      }
    }

    const showAgain = async (show) => {
      unhiding.value = show.seriesKey
      try {
        await unhideShow(show.seriesKey)
        hidden.value = hidden.value.filter((entry) => entry.seriesKey !== show.seriesKey)
        forYouHidden.value = new Set([...forYouHidden.value].filter((key) => key !== show.seriesKey))
      } catch (err) {
        error.value = `Could not show ${show.title} again: ${err.message}`
      } finally {
        unhiding.value = ''
      }
    }

    const askClear = () => askConfirm({
      dialog: {
        title: 'Clear viewing history?',
        body: [historyClearCopyOf(eventCount.value), 'You can\'t undo this.'],
        confirmLabel: 'Clear history',
        busyLabel: 'Clearing…',
        danger: true,
      },
      run: async () => {
        try {
          await api('DELETE', '/api/events')
          eventCount.value = 0
        } catch (err) {
          error.value = `Could not clear history: ${err.message}`
        }
      },
    })

    onMounted(load)

    return {
      settings, hidden, loaded, hiddenLoaded, countLoaded, probing, hiddenOpen, unhiding, error, tierSummary, tierReason, tierOverride, clearCopy, dataCredits, lookupText, repoHref: REPO_HREF,
      otherLanguageFilms, languageOptions: OTHER_LANGUAGE_OPTIONS, tierOptions: TIER_OVERRIDES, save, checkAgain, showAgain, askClear, confirming, confirmBusy, closeConfirm, runConfirmed,
    }
  },
}
