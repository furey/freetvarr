import { ref, computed, watch, nextTick, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { buildShowSearch, guideRowsOf, searchShowsOf } from '/search-results.js'
import { showHrefOf, showKeyOf } from '/show-key.js'
import { watchForOfferOf } from '/watch-for.js'
import { api } from '/shared/api.js'
import { useProgrammeSheet } from '/shared/programme-sheet-store.js'
import { openWatchFor } from '/components/watch-for-sheet.js'
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
                <input ref="input" v-model="query" class="ui-search-input" type="search" enterkeyhint="search"
                  placeholder="Search shows and the guide" autocomplete="off" spellcheck="false" />
              </label>
              <button type="button" class="ui-button ui-button-sm" @click="close">Cancel</button>
            </div>
            <div class="ui-search-results" aria-live="polite">
              <p v-if="!hasQuery" class="ui-search-hint">Type at least two letters to search recordings, series rules, and the next week of the guide.</p>
              <template v-else>
                <section v-if="shows.length">
                  <h2 class="ui-group-label">In Recordings</h2>
                  <div class="ui-group">
                    <a v-for="show in shows" :key="show.key" class="ui-group-row" :href="show.href" @click="close">
                      <span class="ui-group-row-main">
                        <span class="ui-group-row-title">{{ show.title }}</span>
                        <span class="ui-group-row-meta">{{ show.meta }}</span>
                      </span>
                      <chevron-glyph class="ui-group-row-chevron" />
                    </a>
                  </div>
                </section>
                <section v-if="programmes.length">
                  <h2 class="ui-group-label">In the TV guide</h2>
                  <div class="ui-group">
                    <button v-for="programme in programmes" :key="programme.key" type="button" class="ui-group-row"
                      @click="openResult(programme)">
                      <span class="ui-group-row-main">
                        <span class="ui-group-row-title search-row-line">{{ programme.title }}</span>
                        <span v-if="programme.episode" class="search-row-episode search-row-line">{{ programme.episode }}</span>
                        <span class="ui-group-row-meta">{{ programme.meta }}</span>
                      </span>
                      <chevron-glyph class="ui-group-row-chevron" />
                    </button>
                  </div>
                </section>
                <p v-if="searching && !shows.length && !programmes.length" class="ui-search-hint">Searching…</p>
                <p v-else-if="!searching && !shows.length && !programmes.length" class="ui-search-hint">Nothing matches “{{ query.trim() }}”.</p>
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
    const hasQuery = computed(() => query.value.trim().length >= MIN_QUERY_LENGTH)
    const showIndex = computed(() => buildShowSearch({ keyOf: showKeyOf, ...library.value }))
    const shows = computed(() => (hasQuery.value
      ? searchShowsOf({ index: showIndex.value, query: query.value }).map((show) => ({ ...show, href: showHrefOf(show.title) }))
      : []))
    const programmes = computed(() => guideRowsOf({
      results: guideResults.value,
      query: query.value,
      whenOf: (start) => `${fmtRelativeDay(start)} ${fmtClockTz(start)}`,
    }))
    const watchForOffer = computed(() => watchForOfferOf({
      query: query.value,
      searching: searching.value,
      guideCount: programmes.value.length,
      minLength: MIN_QUERY_LENGTH,
    }))
    let debounceTimer = null
    let requestId = 0
    const searchGuide = async (text) => {
      const thisRequest = ++requestId
      searching.value = true
      const { results = [] } = await api('GET', `/api/epg/search?q=${encodeURIComponent(text)}`).catch(() => ({}))
      if (thisRequest !== requestId) return
      guideResults.value = results.slice(0, MAX_GUIDE_RESULTS)
      searching.value = false
    }
    watch(query, (text) => {
      clearTimeout(debounceTimer)
      guideResults.value = []
      if (text.trim().length < MIN_QUERY_LENGTH) return
      searching.value = true
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
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      close()
    }
    const setBodyLock = (isOpen) => {
      try { document.body.classList.toggle('sheet-open', isOpen) } catch {}
    }
    let returnFocus = null
    watch(searchOpen, async (isOpen) => {
      setBodyLock(isOpen)
      window.removeEventListener('keydown', onKeydown, true)
      if (!isOpen) {
        returnFocus?.focus?.()
        return
      }
      returnFocus = document.activeElement
      window.addEventListener('keydown', onKeydown, true)
      loadLibrary()
      await nextTick()
      input.value?.focus()
    })
    const close = () => {
      searchOpen.value = false
      query.value = ''
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
      window.removeEventListener('keydown', onKeydown, true)
    })
    return { open: searchOpen, panel, input, query, hasQuery, shows, programmes, searching, close, openResult, watchForOffer, watchFor }
  },
}

const MIN_QUERY_LENGTH = 2
const SEARCH_DEBOUNCE_MS = 200
const MAX_GUIDE_RESULTS = 30
