import { ref, computed, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { ConfirmDialog, useConfirm } from '/components/dialogs.js'
import {
  OTHER_LANGUAGE_OPTIONS,
  TIER_OVERRIDES,
  hiddenShowsOf,
  hiddenThemeTitleOf,
  historyClearCopyOf,
  themeGroupsOf,
  themesOnCountOf,
  tierReasonOf,
  tierSummaryOf,
} from '/for-you.js'
import { api } from '/shared/api.js'
import { REPO_HREF, privacyLookupTextOf } from '/for-you-privacy.js'
import { forYouHidden, forYouMutedThemes, forYouShown, keepForYouAnimate, unhideShow, unmuteTheme } from '/shared/for-you-session.js'

export const SuggestionsSettingsView = {
  components: { ConfirmDialog },
  template: `
    <div v-page-reveal class="settings-page suggestions-settings">
      <p v-if="error" class="ui-banner is-error" role="alert">{{ error }}</p>

      <div class="settings-group">
        <h3 class="ui-group-label">For you</h3>
        <div class="ui-group">
          <div class="settings-row" data-setting="show-for-you">
            <toggle-switch :model-value="settings.enabled !== false" class="settings-toggle" :pending="!loaded"
              @update:model-value="save({ enabled: $event })">
              <span class="settings-toggle-text">
                <span class="settings-row-title">Show For you</span>
                <span class="settings-row-meta">Adds For you to Home and the highlights</span>
              </span>
            </toggle-switch>
          </div>
          <div class="settings-row" data-setting="other-language-films">
            <span class="settings-toggle-text">
              <span class="settings-row-title" id="suggestions-languages-title">Films in other languages</span>
              <span class="settings-row-meta">Films first made in a language other than English, usually with subtitles.</span>
            </span>
            <ui-segmented fill class="suggestions-languages" aria-labelledby="suggestions-languages-title"
              :model-value="loaded ? otherLanguageFilms : null" :disabled="!loaded" @update:model-value="save({ otherLanguageFilms: $event })"
              :options="languageOptions.map((option) => ({ value: option.key, label: option.label }))" />
          </div>
          <button type="button" class="ui-group-row suggestions-row-button" data-setting="hidden-shows" @click="hiddenOpen = true">
            <span class="settings-toggle-text">
              <span class="settings-row-title">Hidden shows</span>
              <span class="settings-row-meta">Shows and themes you hid from Home and For you</span>
            </span>
            <span class="suggestions-count ui-tabular"><span v-if="!hiddenLoaded" class="ui-skeleton is-text" style="--skeleton-w: 1.2em"></span><template v-else>{{ hidden.length }}</template></span>
            <chevron-glyph class="suggestions-chevron" />
          </button>
          <button type="button" class="ui-group-row suggestions-row-button" data-setting="themes" @click="themesOpen = true">
            <span class="settings-toggle-text">
              <span class="settings-row-title">Themes</span>
              <span class="settings-row-meta">Rows such as Cooking or Cricket. Turn one off to never see it.</span>
            </span>
            <span class="suggestions-count ui-tabular"><span v-if="!themesLoaded" class="ui-skeleton is-text" style="--skeleton-w: 2.4em"></span><template v-else>{{ themesOnCount }}</template></span>
            <chevron-glyph class="suggestions-chevron" />
          </button>
          <div class="settings-row" data-setting="animate-icon">
            <toggle-switch :model-value="settings.animateIcon !== false" class="settings-toggle" :pending="!loaded"
              @update:model-value="save({ animateIcon: $event })">
              <span class="settings-toggle-text">
                <span class="settings-row-title">Animate the For you icon</span>
                <span class="settings-row-meta">Plays a short sparkle animation on the For you icon in the menu once each time Freetvarr opens.</span>
              </span>
            </toggle-switch>
          </div>
        </div>
      </div>

      <div class="settings-group" data-setting="suggestion-level">
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

      <div class="settings-group" data-setting="viewing-history">
        <h3 class="ui-group-label">Viewing history</h3>
        <div class="ui-group">
          <div class="settings-row" data-setting="pause-history">
            <toggle-switch :model-value="settings.historyEnabled === false" class="settings-toggle" :pending="!loaded"
              @update:model-value="save({ historyEnabled: !$event })">
              <span class="settings-toggle-text">
                <span class="settings-row-title">Pause history</span>
                <span class="settings-row-meta">Freetvarr stops noting what you watch until you turn this off. More like this, Fewer like this, and Not interested still count.</span>
              </span>
            </toggle-switch>
          </div>
          <div class="settings-row settings-row-inline" data-setting="clear-history">
            <span class="settings-toggle-text">
              <span class="settings-row-title">Clear viewing history</span>
              <span class="settings-row-meta"><span v-if="!countLoaded" class="ui-skeleton is-text" style="--skeleton-w: 20em"></span><template v-else>{{ clearCopy }}</template></span>
            </span>
            <button type="button" class="ui-button ui-button-destructive suggestions-clear" :disabled="!loaded" @click="askClear">Clear</button>
          </div>
        </div>
        <p class="suggestions-footnote">Your viewing history stays on this box. It is never sent anywhere. {{ lookupText }} The Genres switch is in <a href="#/settings/film-tv-info">Film and TV info</a>. No tracking, no analytics, and Freetvarr is <a :href="repoHref" target="_blank" rel="noopener noreferrer">open source</a>.</p>
      </div>

      <ui-sheet :open="hiddenOpen" title="Hidden shows" subtitle="Home and For you leave these out. Show one again to get suggestions for it." @close="hiddenOpen = false">
        <div v-if="hidden.length" class="ui-group">
          <div v-for="show in hidden" :key="show.seriesKey" class="ui-group-row suggestions-hidden-row">
            <span class="suggestions-hidden-text">
              <span class="suggestions-hidden-title">{{ show.theme ? hiddenThemeTitleOf(show) : show.title || show.seriesKey }}</span>
            </span>
            <button type="button" class="ui-button ui-button-secondary is-small" :disabled="unhiding === show.seriesKey"
              @click="showAgain(show)">Show again</button>
          </div>
        </div>
        <p v-else class="settings-row-meta">No hidden shows. Choose Not interested or Fewer like this on Home or For you to hide a show.</p>
      </ui-sheet>

      <ui-sheet :open="themesOpen" title="Themes" subtitle="For you shows a theme row when you record and watch a lot of that kind of programme, and a seasonal row in the days around an occasion." @close="themesOpen = false">
        <div v-for="group in themeGroups" :key="group.label" class="settings-group suggestions-themes">
          <h3 class="ui-group-label">{{ group.label }}</h3>
          <div class="ui-group">
            <div v-for="theme in group.themes" :key="theme.key" class="settings-row" :data-theme="theme.key">
              <toggle-switch :model-value="theme.on" class="settings-toggle" :pending="savingTheme === theme.key"
                @update:model-value="setTheme(theme, $event)">
                <span class="settings-toggle-text"><span class="settings-row-title">{{ theme.title }}</span></span>
              </toggle-switch>
            </div>
          </div>
        </div>
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
    const themes = ref([])
    const themesLoaded = ref(false)
    const themesOpen = ref(false)
    const savingTheme = ref('')
    const unhiding = ref('')
    const error = ref('')
    const { confirming, confirmBusy, askConfirm, closeConfirm, runConfirmed } = useConfirm()

    const tierSummary = computed(() => tierSummaryOf(settings.value))
    const tierReason = computed(() => tierReasonOf(settings.value))
    const tierOverride = computed(() => settings.value.tierOverride || 'auto')
    const otherLanguageFilms = computed(() => settings.value.otherLanguageFilms || 'few')
    const clearCopy = computed(() => historyClearCopyOf(eventCount.value))
    const themeGroups = computed(() => themeGroupsOf(themes.value))
    const themesOnCount = computed(() => themesOnCountOf(themes.value))
    const lookupText = computed(() => privacyLookupTextOf({ genreLookup: settings.value.genreLookup !== false }))

    const loadHidden = async () => {
      hidden.value = hiddenShowsOf(await api('GET', '/api/for-you/hidden').catch(() => []))
      hiddenLoaded.value = true
    }

    const loadThemes = async () => {
      themes.value = (await api('GET', '/api/for-you/themes').catch(() => ({ themes: [] }))).themes ?? []
      themesLoaded.value = true
    }

    const setTheme = async (theme, on) => {
      const previous = themes.value
      themes.value = themes.value.map((entry) => (entry.key === theme.key ? { ...entry, on } : entry))
      savingTheme.value = theme.key
      error.value = ''
      try {
        themes.value = (await api('PUT', `/api/for-you/themes/${encodeURIComponent(theme.key)}`, { on })).themes
        if (on) forYouMutedThemes.value = new Set([...forYouMutedThemes.value].filter((key) => key !== theme.key))
        await loadHidden()
      } catch (err) {
        themes.value = previous
        error.value = `Could not save ${theme.title}: ${err.message}`
      } finally {
        savingTheme.value = ''
      }
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
        keepForYouAnimate(settings.value.animateIcon !== false)
      } catch (err) {
        error.value = err.status === 404
          ? 'For you is not ready on this box yet.'
          : `Could not load suggestion settings: ${err.message}`
      }
    }

    const load = () => Promise.all([loadSettings(), loadHidden(), loadCount(), loadThemes()])

    const save = async (patch) => {
      const previous = settings.value
      settings.value = { ...previous, ...patch }
      forYouShown.value = settings.value.enabled !== false
      keepForYouAnimate(settings.value.animateIcon !== false)
      error.value = ''
      try {
        settings.value = { ...settings.value, ...(await api('PUT', '/api/for-you/settings', patch)) }
      } catch (err) {
        settings.value = previous
        error.value = `Could not save: ${err.message}`
      }
      forYouShown.value = settings.value.enabled !== false
      keepForYouAnimate(settings.value.animateIcon !== false)
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
        if (show.themeKey) await unmuteTheme(show.themeKey)
        else await unhideShow(show.seriesKey)
        hidden.value = hidden.value.filter((entry) => entry.seriesKey !== show.seriesKey)
        if (show.themeKey) {
          forYouMutedThemes.value = new Set([...forYouMutedThemes.value].filter((key) => key !== show.themeKey))
          await loadThemes()
        } else {
          forYouHidden.value = new Set([...forYouHidden.value].filter((key) => key !== show.seriesKey))
        }
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
      hiddenThemeTitleOf, themes, themesLoaded, themesOpen, themeGroups, themesOnCount, savingTheme, setTheme,
      settings, hidden, loaded, hiddenLoaded, countLoaded, probing, hiddenOpen, unhiding, error, tierSummary, tierReason, tierOverride, clearCopy, lookupText, repoHref: REPO_HREF,
      otherLanguageFilms, languageOptions: OTHER_LANGUAGE_OPTIONS, tierOptions: TIER_OVERRIDES, save, checkAgain, showAgain, askClear, confirming, confirmBusy, closeConfirm, runConfirmed,
    }
  },
}
