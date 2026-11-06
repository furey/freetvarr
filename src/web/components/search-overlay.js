import { ref, computed, watch, nextTick, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { GROUP_ROW_LIMIT, MAX_GUIDE_RESULTS, buildShowSearch, guideRowsOf, guideSearchOutcomeOf, remainingBusyMs, searchGroupsOf, searchShowsOf } from '/search-results.js'
import { showHrefOf, showKeyOf } from '/show-key.js'
import { watchForOfferOf } from '/watch-for.js'
import { api } from '/shared/api.js'
import { loadEpgState, recordingStateText, useProgrammeSheet } from '/shared/programme-sheet-store.js'
import { openWatchFor } from '/components/watch-for-sheet.js'
import { keepFocusInside } from '/components/ui-sheet.js'
import { createOverlayLayer, overlayStack } from '/overlay-stack.js'
import { fmtClockTz, fmtRelativeDay } from '/shared/time.js'

export const searchOpen = ref(false)

export const openSearch = () => { searchOpen.value = true }

export const SearchOverlay = {
  template: `
    <teleport to="body">
      <transition name="ui-sheet">
        <div v-if="open" class="ui-search-backdrop" @click.self="close">
          <section ref="panel" class="ui-search" role="dialog" aria-modal="true" aria-label="Search" tabindex="-1">
            <div class="ui-search-bar">
              <label class="ui-search-field">
                <search-glyph />
                <span class="ui-visually-hidden">Search shows and the guide</span>
                <input ref="input" v-model="query" class="ui-search-input" type="search" enterkeyhint="search" @keydown.enter.prevent="openFirstResult"
                  placeholder="Search shows and the guide" autocomplete="off" spellcheck="false" />
              </label>
              <button type="button" class="ui-button ui-button-sm" @click="close">Cancel</button>
            </div>
            <div class="ui-search-results" aria-live="polite">
              <p v-if="!hasQuery" class="ui-search-hint">Type at least two letters to search recordings, series rules, and the next week of the guide.</p>
              <template v-else>
                <section v-for="group in groups" :key="group.key" :data-group="group.key">
                  <h2 class="ui-group-label">{{ group.label }}</h2>
                  <div class="ui-group">
                    <template v-for="row in group.rows" :key="row.key">
                      <a v-if="row.kind === 'show'" class="ui-group-row" data-search-row data-search-result :href="row.href" @click="close">
                        <span class="ui-group-row-main">
                          <span class="ui-group-row-title">{{ row.title }}</span>
                          <span class="ui-group-row-meta">{{ row.meta }}</span>
                        </span>
                        <chevron-glyph class="ui-group-row-chevron" />
                      </a>
                      <button v-else type="button" class="ui-group-row" data-search-row data-search-result @click="openResult(row)">
                        <span class="ui-group-row-main">
                          <span class="ui-group-row-title search-row-line">{{ row.title }}</span>
                          <span v-if="row.episode" class="search-row-episode search-row-line">{{ row.episode }}</span>
                          <span class="ui-group-row-meta">{{ row.meta }}</span>
                        </span>
                        <chevron-glyph class="ui-group-row-chevron" />
                      </button>
                    </template>
                    <button v-if="group.isCapped" type="button" class="ui-group-row" data-search-row :aria-label="group.showAllLabel" @click="expand(group.key)">
                      <span class="ui-group-row-main">
                        <span class="ui-group-row-title">{{ group.showAllText }}</span>
                      </span>
                    </button>
                  </div>
                </section>
                <p v-if="guideFailure" class="ui-search-hint">{{ guideFailure }}</p>
                <p v-else-if="searching" class="ui-search-hint">Searching…</p>
                <p v-else-if="!groups.length" class="ui-search-hint">Nothing matches “{{ query.trim() }}”.</p>
                <section v-if="watchForOffer">
                  <h2 class="ui-group-label">Not in the next 7 days</h2>
                  <div class="ui-group">
                    <button type="button" class="ui-group-row" @click="watchFor">
                      <span class="ui-group-row-main">
                        <span class="ui-group-row-title search-row-line">Add “{{ watchForOffer }}” to watchlist</span>
                        <span class="ui-group-row-meta">List it in Scheduled, or record it, when it is in the TV guide</span>
                      </span>
                      <chevron-glyph class="ui-group-row-chevron" />
                    </button>
                  </div>
                </section>
              </template>
            </div>
          </section>
        </div>
      </transition>
    </teleport>
  `,
  setup() {
    const panel = ref(null)
    const input = ref(null)
    const query = ref('')
    const guideResults = ref([])
    const library = ref({ shows: [], series: [], curated: [], aliases: [] })
    const searching = ref(false)
    const guideFailure = ref('')
    const hasQuery = computed(() => query.value.trim().length >= MIN_QUERY_LENGTH)
    const showIndex = computed(() => buildShowSearch({ keyOf: showKeyOf, ...library.value }))
    const shows = computed(() => (hasQuery.value
      ? searchShowsOf({ index: showIndex.value, query: query.value }).map((show) => ({ ...show, href: showHrefOf(show.title) }))
      : []))
    const programmes = computed(() => guideRowsOf({
      results: guideResults.value,
      query: query.value,
      whenOf: (start) => `${fmtRelativeDay(start)} ${fmtClockTz(start)}`,
      stateTextOf: recordingStateText,
    }))
    const expandedGroups = ref(new Set())
    const groups = computed(() => searchGroupsOf({
      shows: shows.value,
      programmes: programmes.value,
      expanded: expandedGroups.value,
    }))
    const expand = async (key) => {
      expandedGroups.value = new Set([...expandedGroups.value, key])
      await nextTick()
      panel.value?.querySelectorAll(`[data-group="${key}"] [data-search-result]`)[GROUP_ROW_LIMIT]?.focus()
    }
    const watchForOffer = computed(() => watchForOfferOf({
      query: query.value,
      searching: searching.value,
      failed: Boolean(guideFailure.value),
      guideCount: programmes.value.length,
      minLength: MIN_QUERY_LENGTH,
    }))
    let debounceTimer = null
    let requestId = 0
    let busySince = 0
    const startBusy = () => {
      if (!searching.value) busySince = Date.now()
      searching.value = true
    }
    const searchGuide = async (text) => {
      const thisRequest = ++requestId
      startBusy()
      const outcome = await guideSearchOutcomeOf(() => api('GET', `/api/epg/search?q=${encodeURIComponent(text)}`))
      if (thisRequest !== requestId) return
      guideResults.value = outcome.results.slice(0, MAX_GUIDE_RESULTS)
      guideFailure.value = outcome.failure
      await new Promise((resolve) => setTimeout(resolve, remainingBusyMs({ startedAt: busySince, nowMs: Date.now() })))
      if (thisRequest === requestId) searching.value = false
    }
    watch(query, (text) => {
      clearTimeout(debounceTimer)
      guideFailure.value = ''
      expandedGroups.value = new Set()
      requestId += 1
      if (text.trim().length < MIN_QUERY_LENGTH) {
        guideResults.value = []
        searching.value = false
        return
      }
      startBusy()
      debounceTimer = setTimeout(() => searchGuide(text.trim()), SEARCH_DEBOUNCE_MS)
    })
    const loadLibrary = async () => {
      const [catalogue, series] = await Promise.all([
        api('GET', '/api/search/catalogue').catch(() => ({})),
        api('GET', '/api/series').catch(() => ({})),
      ])
      library.value = {
        shows: catalogue.shows ?? [],
        series: series.series ?? [],
        curated: catalogue.curated ?? [],
        aliases: catalogue.aliases ?? [],
      }
    }
    const onKeydown = (event) => {
      if (event.key === 'Tab' && panel.value) return keepFocusInside({ event, root: panel.value })
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') return moveFocus({ event, step: event.key === 'ArrowDown' ? 1 : -1 })
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      close()
    }
    const moveFocus = ({ event, step }) => {
      const rows = [...(panel.value?.querySelectorAll('[data-search-row]') || [])]
      if (!rows.length || !panel.value.contains(document.activeElement)) return
      event.preventDefault()
      const next = rows.indexOf(document.activeElement) + step
      if (next < 0) return input.value?.focus()
      rows[Math.min(next, rows.length - 1)].focus()
    }
    const openFirstResult = () => {
      if (searching.value) return
      panel.value?.querySelector('[data-search-result]')?.click()
    }
    const setBodyLock = (isOpen) => {
      try { document.body.classList.toggle('sheet-open', isOpen) } catch {}
    }
    const layer = createOverlayLayer({ stack: overlayStack, onClose: () => close() })
    const stopListening = () => {
      window.removeEventListener('keydown', onKeydown, true)
    }
    let returnFocus = null
    watch(searchOpen, async (isOpen) => {
      setBodyLock(isOpen)
      stopListening()
      if (!isOpen) {
        layer.release()
        returnFocus?.focus?.()
        return
      }
      returnFocus = document.activeElement
      layer.open()
      window.addEventListener('keydown', onKeydown, true)
      loadLibrary()
      loadEpgState()
      await nextTick()
      input.value?.focus()
    })
    const close = () => {
      searchOpen.value = false
      query.value = ''
      expandedGroups.value = new Set()
    }
    const { openProgramme } = useProgrammeSheet()
    const openResult = ({ programme }) => {
      close()
      openProgramme({ channelId: programme.channelId, programme })
    }
    const watchFor = () => {
      const title = watchForOffer.value
      close()
      openWatchFor(title)
    }
    onUnmounted(() => {
      setBodyLock(false)
      stopListening()
      layer.release()
    })
    return { open: searchOpen, panel, input, query, hasQuery, groups, searching, guideFailure, close, openResult, expand, openFirstResult, watchForOffer, watchFor }
  },
}

const MIN_QUERY_LENGTH = 2
const SEARCH_DEBOUNCE_MS = 200
