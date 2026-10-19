import { ref, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import {
  LIBRARY_SORTS,
  failedRecordingsOf,
  failureBannerOf,
  movieMetaOf,
  oneOffMetaOf,
  posterMetaOf,
  shelvesOf,
  showsCountText,
} from '/library-shelves.js'
import { diagnoseRecordingError } from '/recording-error.js'
import { showHrefOf } from '/show-key.js'
import { api } from '/shared/api.js'
import { recordingNow, recordingChangeTick } from '/shared/recording-now.js'
import { storedChoice, storedFlag } from '/shared/storage.js'
import { syncStatus } from '/shared/sync-status.js'
import { tz } from '/shared/time.js'

const LIBRARY_SORT_KEY = 'freetvarr.librarySort'
const LIBRARY_UNWATCHED_KEY = 'freetvarr.libraryUnwatched'
const FAILED_LOG_HREF = '#/settings/system/log?status=failed'
const LIBRARY_POLL_MS = 60_000
const SKELETON_POSTERS = 6

export const RecordingsLibraryView = {
  template: `
    <div class="ui-page recordings-page">
      <page-header title="Recordings" subtitle="Everything you have, and everything on its way." />
      <div class="library-toolbar">
        <recordings-tabs current="library" :scheduled-count="scheduledCount" />
        <div class="library-filters">
          <button type="button" class="ui-chip" :aria-pressed="String(unwatchedOnly)" @click="unwatchedOnly = !unwatchedOnly">Unwatched</button>
          <span class="ui-chip library-sort">
            <select v-model="sortKey" class="library-sort-select" aria-label="Sort shows">
              <option v-for="o in LIBRARY_SORTS" :key="o.key" :value="o.key">{{ o.label }}</option>
            </select>
            <chevron-glyph class="library-sort-chevron" aria-hidden="true" />
          </span>
        </div>
      </div>

      <a v-if="failureBanner" :href="FAILED_LOG_HREF" class="ui-banner is-error library-failures">
        <span class="ui-dot is-fail"></span>
        <span class="ui-banner-text"><strong>{{ failureBanner.headline }}</strong><span v-if="failureBanner.detail" class="ui-meta"> · {{ failureBanner.detail }}</span></span>
        <span class="ui-banner-action">Review</span>
      </a>
      <p v-if="stale" class="ui-banner is-warning" role="status">TVHeadend is not answering, so shows waiting for a first episode may be missing.</p>

      <section v-if="!loaded" class="ui-section" aria-label="Loading shows" aria-busy="true">
        <div class="ui-row-header"><span class="ui-skeleton is-line library-skeleton-title"></span></div>
        <div class="ui-poster-grid">
          <span v-for="n in SKELETON_POSTERS" :key="n" class="ui-skeleton is-poster library-skeleton-poster"></span>
        </div>
      </section>

      <p v-else-if="error && !shows.length" class="ui-banner is-error" role="alert">Cannot load your recordings: {{ error }}</p>

      <section v-else-if="!shows.length" class="ui-empty" aria-label="Library">
        <h2 class="ui-empty-title">Nothing recorded yet</h2>
        <p class="ui-empty-text">Shows, movies, and one-offs you record appear here.</p>
        <a href="#/guide" class="ui-button ui-button-primary">Find a show in the Guide</a>
      </section>

      <section v-else-if="nothingShown" class="ui-empty" aria-label="Library">
        <h2 class="ui-empty-title">You are all caught up</h2>
        <p class="ui-empty-text">You have watched every recording.</p>
        <button type="button" class="ui-button" @click="unwatchedOnly = false">Show everything</button>
      </section>

      <template v-else>
        <section v-if="shelves.shows.length" class="ui-section" aria-labelledby="library-shows-title">
          <div class="ui-row-header">
            <h2 id="library-shows-title" class="ui-section-title">Shows</h2>
            <span class="ui-row-meta">{{ showsCountText(shelves.shows) }}</span>
          </div>
          <div class="ui-poster-grid">
            <a v-for="show in shelves.shows" :key="show.key" :href="showHrefOf(show.title)" class="ui-poster"
              :aria-label="posterLabel(show)">
              <title-art shape="poster" :title="show.title" :src="posterSrc(show)">
                <span v-if="show.recordingNow" class="ui-art-badge"><span class="ui-live-badge"><span class="ui-live-dot"></span>Rec</span></span>
                <span v-if="show.counts.new" class="ui-art-badge is-end"><span class="ui-count-badge">{{ show.counts.new }}</span></span>
              </title-art>
              <div class="ui-card-title">{{ show.title }}</div>
              <div class="ui-card-meta">{{ posterMeta(show) }}</div>
            </a>
          </div>
        </section>

        <section v-if="shelves.movies.length" class="ui-section" aria-labelledby="library-movies-title">
          <div class="ui-row-header">
            <h2 id="library-movies-title" class="ui-section-title">Movies</h2>
            <span class="ui-row-meta">{{ shelves.movies.length }}</span>
          </div>
          <div class="ui-scroller">
            <a v-for="show in shelves.movies" :key="show.key" :href="showHrefOf(show.title)" class="ui-poster">
              <title-art shape="poster" :title="show.title" :src="posterSrc(show)">
                <span v-if="show.recordingNow" class="ui-art-badge"><span class="ui-live-badge"><span class="ui-live-dot"></span>Rec</span></span>
              </title-art>
              <div class="ui-card-title">{{ show.title }}</div>
              <div class="ui-card-meta">{{ movieMetaOf({ show }) }}</div>
            </a>
          </div>
        </section>

        <section v-if="shelves.oneoffs.length" class="ui-section" aria-labelledby="library-oneoffs-title">
          <div class="ui-row-header">
            <h2 id="library-oneoffs-title" class="ui-section-title">Specials and one-offs</h2>
            <span class="ui-row-meta">{{ shelves.oneoffs.length }}</span>
          </div>
          <div class="ui-scroller">
            <a v-for="show in shelves.oneoffs" :key="show.key" :href="showHrefOf(show.title)" class="ui-card">
              <title-art :title="show.title" :src="cardSrc(show)">
                <span v-if="show.recordingNow" class="ui-art-badge"><span class="ui-live-badge"><span class="ui-live-dot"></span>Rec</span></span>
              </title-art>
              <div class="ui-card-title">{{ show.title }}</div>
              <div class="ui-card-meta">{{ oneOffMetaOf({ show, timeZone: tz }) }}</div>
            </a>
          </div>
        </section>
      </template>
    </div>
  `,
  setup() {
    const shows = ref([])
    const stale = ref(false)
    const loaded = ref(false)
    const error = ref('')
    const failedRows = ref([])
    const scheduledCount = ref(null)
    const sortKey = storedChoice({ key: LIBRARY_SORT_KEY, options: LIBRARY_SORTS.map((o) => o.key), fallback: 'recent' })
    const unwatchedOnly = storedFlag({ key: LIBRARY_UNWATCHED_KEY, fallback: false })

    const shelves = computed(() => shelvesOf({ shows: shows.value, sort: sortKey.value, unwatchedOnly: unwatchedOnly.value }))
    const nothingShown = computed(() => !shelves.value.shows.length && !shelves.value.movies.length && !shelves.value.oneoffs.length)

    const failureBanner = computed(() => failureBannerOf({
      failed: failedRecordingsOf({ rows: failedRows.value, journeys: recordingNow.value.journeys || [], nowMs: Date.now() }),
      timeZone: tz.value,
      reasonOf: failureReasonOf,
    }))

    const loadShows = async () => {
      try {
        const result = await api('GET', '/api/library/shows')
        shows.value = result.shows || []
        stale.value = Boolean(result.stale)
        error.value = ''
      } catch (err) {
        error.value = err.message
      } finally {
        loaded.value = true
      }
    }

    const loadFailures = async () => {
      const result = await api('GET', '/api/recordings?status=failed&sort=aired_at&dir=desc&pageSize=10').catch(() => null)
      failedRows.value = result?.recordings || []
    }

    const loadScheduledCount = async () => {
      const state = await api('GET', '/api/epg/state').catch(() => null)
      scheduledCount.value = state ? (state.futureRecordings || []).filter((r) => !r.pendingDelete).length : null
    }

    const refresh = () => Promise.all([loadShows(), loadFailures()])

    let pollTimer = null
    onMounted(() => {
      refresh()
      loadScheduledCount()
      pollTimer = setInterval(refresh, LIBRARY_POLL_MS)
    })
    onUnmounted(() => clearInterval(pollTimer))
    watch(recordingChangeTick, loadShows)
    watch(() => syncStatus.value.activeSyncId, (current, previous) => {
      if (previous && !current) refresh()
    })

    const posterMeta = (show) => posterMetaOf({ show, timeZone: tz.value })
    const posterLabel = (show) => [show.title, show.recordingNow ? 'recording now' : '', posterMeta(show)].filter(Boolean).join(', ')
    const posterSrc = (show) => `${show.poster}&w=384`
    const cardSrc = (show) => show.image || `/api/epg/show-image?title=${encodeURIComponent(show.title)}&w=384`

    return {
      shows, stale, loaded, error, shelves, nothingShown, failureBanner, scheduledCount, sortKey, unwatchedOnly,
      LIBRARY_SORTS, FAILED_LOG_HREF, SKELETON_POSTERS, tz,
      posterMeta, posterLabel, posterSrc, cardSrc, movieMetaOf, oneOffMetaOf, showsCountText, showHrefOf,
    }
  },
}

const failureReasonOf = (error) => (error ? diagnoseRecordingError(error).title : '')
