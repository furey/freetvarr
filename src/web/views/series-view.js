import { ref, computed, onMounted, onUnmounted, watch } from '/vendor/vue.esm-browser.prod.js'
import {
  SERIES_SORTS,
  SERIES_STATUSES,
  sortSeries,
  filterSeries,
  filterTitleMatches,
} from '/series-order.js'
import { api, fetchSettings } from '/shared/api.js'
import { useMediaQuery, useFlash } from '/shared/composables.js'
import { EPG_NARROW_QUERY } from '/shared/constants.js'
import { makeStatus } from '/shared/path-check.js'
import { episodeRecordingFor, stopOutcomeFor } from '/shared/recording-helpers.js'
import { refreshAfterRecordingChange } from '/shared/recording-now.js'
import { storedChoice } from '/shared/storage.js'
import { loadSyncStatus, ensureSyncPolling } from '/shared/sync-status.js'
import { fmtClockTz, fmtRelativeDay, tsOfMs } from '/shared/time.js'
import { mediaRootPrefix, FOLDER_HINT } from '/views/folder-editor.js'

const SERIES_SORT_KEY = 'freetvarr.seriesSort'

const seasonFolderFor = (season) => `Season ${season == null ? '…' : String(season).padStart(2, '0')}`

const folderNameFor = (title) => String(title || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()

export const SeriesView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title" aria-live="polite">SERIES · {{ seriesCountLabel }}</span>
            <info-button title="SERIES" doc="guide/series">
              <p>Each row is a series recording in TVHeadend. <strong>SAVES TO</strong> shows the folder where each sync saves its finished episodes.</p>
              <p>To record a new series, open the <strong>TV GUIDE</strong>, pick a programme, and press <strong>SERIES</strong>. An SD and an HD recording of the same title show as one series.</p>
              <p>Press a row to open the series under it. There you change where episodes save, the season folders, ad removal, and whether Freetvarr removes the TVHeadend copy after import.</p>
              <p>A series with no folder in your TV library saves to the one-off folder. Open it and press <strong>ASSIGN FOLDER</strong> to give it one. <strong>UNASSIGN FOLDER</strong> in the same place takes it away again. Episodes already imported stay where they are.</p>
              <p><strong>PAUSE</strong>, in the open series, stops TVHeadend recording new episodes of this series, and the row shows <strong>PAUSED</strong>. Episodes already recorded still import. <strong>RESUME</strong> starts it again.</p>
              <p><strong>CANCEL SERIES</strong>, in the open series, cancels the series recording in TVHeadend. It asks whether to stop an episode recording now and whether to keep the title match. Episodes already recorded stay, and so do their files.</p>
              <p>Type in the filter box to find a series by title, channel, or folder. <strong>SORT</strong> orders the rows, and <strong>STATUS</strong> shows only paused series, series not in the TV guide, or series recording now.</p>
            </info-button>
          </span>
          <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
        </header>
        <div class="panel-body space-y-4">
          <p class="text-sm text-ink-dim leading-relaxed">
            Series episodes go into their own folder in the TV library. Single recordings and films go to the one-off and movies folders; see <a href="#/recordings">RECORDINGS</a>.
          </p>
          <list-skeleton v-if="!loaded" :rows="6" />
          <template v-else>
            <p v-if="error" class="text-sm font-mono text-signal-orange-hi">Cannot read the series recordings from TVHeadend: {{ error }}</p>
            <p v-else-if="stale" class="text-xs font-mono text-plex-yellow">TVHeadend is not answering. This is its last known state.</p>
            <p v-if="!error && series.length === 0" class="text-ink-dim text-sm">
              No series recordings yet. Open the <a href="#/guide">TV Guide</a>, pick a programme, and press <strong>SERIES</strong>.
            </p>
            <template v-else>
            <template v-if="narrow">
              <div class="view-controls view-controls-sticky" style="flex-wrap: wrap;">
                <input v-no-autofill v-model="filterQ" type="search" class="field-input" style="flex-basis: 100%;"
                  placeholder="Filter series or channels" aria-label="Filter series or channels" />
                <select v-model="sortKey" class="field-input" aria-label="Sort series">
                  <option v-for="o in SERIES_SORTS" :key="o.key" :value="o.key">{{ o.label }}</option>
                </select>
                <filter-sheet title="FILTER SERIES" :count="statusFilter === 'all' ? 0 : 1" @clear="statusFilter = 'all'">
                  <div class="filter-group" role="group" aria-label="STATUS">
                    <span class="field-label">STATUS</span>
                    <div class="filter-chips">
                      <button v-for="o in SERIES_STATUSES" :key="o.key" type="button"
                        :class="['btn', 'btn-sm', statusFilter === o.key ? 'btn-on' : '']" :aria-pressed="String(statusFilter === o.key)"
                        @click="statusFilter = o.key">{{ o.label }}</button>
                    </div>
                  </div>
                </filter-sheet>
              </div>
              <div v-if="statusFilter !== 'all'" class="active-filters">
                <button type="button" class="btn btn-sm btn-on" :aria-label="'Remove filter: ' + statusLabel"
                  @click="statusFilter = 'all'">{{ statusLabel }} <cross-icon /></button>
              </div>
            </template>
            <div v-else class="space-y-3">
              <div class="view-controls">
                <input v-no-autofill v-model="filterQ" type="search" class="field-input"
                  placeholder="Filter series or channels" aria-label="Filter series or channels"
                  style="padding-top: 0.35rem; padding-bottom: 0.35rem;" />
                <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">SORT</span>
                <select v-model="sortKey" class="field-input day-select" aria-label="Sort series"
                  style="padding-top: 0.3rem; padding-bottom: 0.3rem;">
                  <option v-for="o in SERIES_SORTS" :key="o.key" :value="o.key">{{ o.label }}</option>
                </select>
              </div>
              <div class="flex items-center gap-2 min-w-0" role="group" aria-label="STATUS">
                <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">STATUS</span>
                <div class="chip-row md:flex-wrap">
                  <button v-for="o in SERIES_STATUSES" :key="o.key" type="button"
                    :class="['btn', 'btn-sm', statusFilter === o.key ? 'btn-on' : '']" :aria-pressed="String(statusFilter === o.key)"
                    @click="statusFilter = o.key">{{ o.label }}</button>
                </div>
              </div>
            </div>
            <div v-if="!visibleSeries.length" class="flex flex-wrap items-center gap-3">
              <p class="text-ink-dim text-sm">{{ noMatchText }}</p>
              <button type="button" class="btn btn-sm" @click="clearFilters"><cross-icon /> CLEAR FILTERS</button>
            </div>
            <table v-else-if="!narrow" class="deck-table series-table">
              <thead><tr>
                <th>Series</th><th>Next</th><th>Saves to</th><th></th>
              </tr></thead>
              <tbody>
                <template v-for="s in visibleSeries" :key="s.key">
                  <tr :class="['series-row', 'toggle-row', { open: isEditing(s) }]" tabindex="0"
                    :aria-expanded="String(isEditing(s))" :aria-label="s.title + ': show settings'"
                    @click="toggleEdit(s.key)" @keydown.enter.self.prevent="toggleEdit(s.key)" @keydown.space.self.prevent="toggleEdit(s.key)">
                    <td>
                      <div class="recording-cell">
                        <programme-image :event-id="s.imageProgramId" :channel-id="s.autorecs[0]?.channelId" :title="s.title" />
                        <div class="recording-cell-text">
                          <span class="font-mono">{{ s.title }}<span v-if="!s.recording" class="pill skipped series-paused">PAUSED</span></span>
                          <span class="recording-cell-channel">{{ channelsOf(s) }}<template v-if="s.episodesToKeep"> · keeps the latest {{ s.episodesToKeep }}</template></span>
                        </div>
                      </div>
                    </td>
                    <td class="series-next">{{ nextAiringLabel(s) }}</td>
                    <td class="series-saves-to"><code v-if="s.savesTo?.path">{{ s.savesTo.path }}</code><template v-else>nowhere yet: episodes wait in <a href="#/recordings">RECORDINGS</a></template></td>
                    <td>
                      <div class="rec-actions flex items-center justify-end gap-2">
                        <folder-sync-button v-if="s.folder" :folder="s.folder" is-series :syncing="syncingId === s.folder.id" @sync="syncOne(s.folder)" />
                      </div>
                    </td>
                  </tr>
                  <tr v-if="isEditing(s)" class="drawer-row">
                    <td colspan="4">
                      <series-drawer class="drawer-card" :series="s" :folders="folders" :media-root="mediaRoot" :ad-removal-enabled="adRemovalEnabled"
                        :import-unmatched="importUnmatched" :busy="busyKey === s.key"
                        @saved="onSaved" @deleted="onDeleted" @close="editingKey = ''" @assign="openAssign(s)"
                        @pause="pauseSeries(s, s.recording)" @cancel-series="openCancelSeries(s)" />
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
            <div v-else class="list-rows">
              <article v-for="s in visibleSeries" :key="s.key" :class="['list-row', 'series-card', 'toggle-card', 'space-y-3', { open: isEditing(s) }]"
                tabindex="0" :aria-expanded="String(isEditing(s))" :aria-label="s.title + ': show settings'"
                @click="toggleEdit(s.key)" @keydown.enter.self.prevent="toggleEdit(s.key)" @keydown.space.self.prevent="toggleEdit(s.key)">
                <div class="list-row-main">
                  <div class="deck-card-with-image">
                    <programme-image :event-id="s.imageProgramId" :channel-id="s.autorecs[0]?.channelId" :title="s.title" />
                    <div class="deck-card-text">
                      <span class="deck-card-title">{{ s.title }}<span v-if="!s.recording" class="pill skipped series-paused">PAUSED</span></span>
                      <p class="deck-card-meta">{{ channelsOf(s) }}<template v-if="s.episodesToKeep"> · keeps the latest {{ s.episodesToKeep }}</template></p>
                      <p class="deck-card-meta"><span class="deck-card-label">Next</span> {{ nextAiringLabel(s) }}</p>
                      <p class="deck-card-meta"><span class="deck-card-label">Saves to</span> <code v-if="s.savesTo?.path">{{ s.savesTo.path }}</code><template v-else>nowhere yet: episodes wait in <a href="#/recordings">RECORDINGS</a></template></p>
                    </div>
                  </div>
                  <folder-sync-button v-if="s.folder" :folder="s.folder" is-series :syncing="syncingId === s.folder.id" @sync="syncOne(s.folder)" />
                </div>
                <series-drawer v-if="isEditing(s)" class="drawer-card" @click.stop @keydown.stop :series="s" :folders="folders" :media-root="mediaRoot" :ad-removal-enabled="adRemovalEnabled"
                  :import-unmatched="importUnmatched" :busy="busyKey === s.key"
                  @saved="onSaved" @deleted="onDeleted" @close="editingKey = ''" @assign="openAssign(s)"
                  @pause="pauseSeries(s, s.recording)" @cancel-series="openCancelSeries(s)" />
              </article>
            </div>
            </template>
          </template>
        </div>
      </section>

      <teleport to="body">
      <transition name="epg-sheet">
      <div v-if="cancelling" class="epg-modal-backdrop" @click.self="closeCancelSeries">
        <section class="panel epg-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-series-title">
          <header class="panel-header">
            <span id="cancel-series-title" class="panel-title">Cancel series</span>
            <button type="button" class="btn btn-icon epg-modal-x" @click="closeCancelSeries" aria-label="Close"><cross-icon /></button>
          </header>
          <div class="panel-body">
            <cancel-series-step :title="cancelling.series.title" :episode-outcome="cancelling.episodeOutcome"
              :title-match="cancelling.series.folder" :busy="busyKey === cancelling.series.key" :show-back="false"
              @confirm="cancelSeries" />
          </div>
        </section>
      </div>
      </transition>
      </teleport>

      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">TITLE MATCHES · {{ titleMatchCountLabel }}</span>
            <info-button title="TITLE MATCHES" doc="guide/series#title-matches">
              <p>A recording whose title contains this text saves to its folder, even without a series recording. This covers a title you typed by hand, such as <code>NRL</code>, or a series you cancelled and kept the title match for.</p>
              <p><strong>ADD TITLE</strong> adds one. Freetvarr suggests a folder under your media root, and matches folders that are already there.</p>
            </info-button>
          </span>
        </header>
        <div class="panel-body space-y-4">
          <p class="text-sm text-ink-dim">A recording whose title contains this text saves to its folder, even without a series recording.</p>
          <p v-if="titleMatches.length && !visibleTitleMatches.length" class="text-ink-dim text-sm">No title matches for "{{ filterQ.trim() }}".</p>
          <table v-if="visibleTitleMatches.length && !narrow" class="deck-table title-match-table">
            <thead><tr>
              <th>Title</th><th>Saves to</th><th></th>
            </tr></thead>
            <tbody>
              <template v-for="f in visibleTitleMatches" :key="f.id">
                <tr :class="['toggle-row', { open: isEditingTitleMatch(f) }]" tabindex="0"
                  :aria-expanded="String(isEditingTitleMatch(f))" :aria-label="f.show_pattern + ': show settings'"
                  @click="toggleEdit('folder-' + f.id)" @keydown.enter.self.prevent="toggleEdit('folder-' + f.id)" @keydown.space.self.prevent="toggleEdit('folder-' + f.id)">
                  <td class="font-mono">{{ f.show_pattern }}</td>
                  <td class="series-saves-to"><code v-if="f.savesTo?.path">{{ f.savesTo.path }}</code><template v-else>nowhere yet: recordings wait in <a href="#/recordings">RECORDINGS</a></template></td>
                  <td>
                    <div class="rec-actions flex items-center justify-end gap-2">
                      <folder-sync-button :folder="f" :syncing="syncingId === f.id" @sync="syncOne(f)" />
                    </div>
                  </td>
                </tr>
                <tr v-if="isEditingTitleMatch(f)" class="drawer-row">
                  <td colspan="3">
                    <series-folder-editor class="drawer-card" :folder="f" :folders="folders"
                      :media-root="mediaRoot" :ad-removal-enabled="adRemovalEnabled" :import-unmatched="importUnmatched"
                      @saved="onSaved" @deleted="onDeleted" @cancel="editingKey = ''" />
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
          <div v-else-if="visibleTitleMatches.length" class="list-rows">
            <article v-for="f in visibleTitleMatches" :key="f.id" :class="['list-row', 'toggle-card', 'space-y-3', { open: isEditingTitleMatch(f) }]"
              tabindex="0" :aria-expanded="String(isEditingTitleMatch(f))" :aria-label="f.show_pattern + ': show settings'"
              @click="toggleEdit('folder-' + f.id)" @keydown.enter.self.prevent="toggleEdit('folder-' + f.id)" @keydown.space.self.prevent="toggleEdit('folder-' + f.id)">
              <div class="list-row-main">
                <div class="list-row-stack">
                  <span class="deck-card-title block">{{ f.show_pattern }}</span>
                  <p class="deck-card-meta"><span class="deck-card-label">Saves to</span> <code v-if="f.savesTo?.path">{{ f.savesTo.path }}</code><template v-else>nowhere yet: recordings wait in <a href="#/recordings">RECORDINGS</a></template></p>
                </div>
                <folder-sync-button :folder="f" :syncing="syncingId === f.id" @sync="syncOne(f)" />
              </div>
              <series-folder-editor v-if="isEditingTitleMatch(f)" class="drawer-card" @click.stop @keydown.stop :folder="f" :folders="folders"
                :media-root="mediaRoot" :ad-removal-enabled="adRemovalEnabled" :import-unmatched="importUnmatched"
                @saved="onSaved" @deleted="onDeleted" @cancel="editingKey = ''" />
            </article>
          </div>

          <form class="space-y-4 pt-4 pb-3 md:pb-0 border-t border-hairline" @submit.prevent="add">
            <span class="field-label block">ADD TITLE</span>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="field-row">
                <label class="field-label">Recording titles that contain</label>
                <div class="flex flex-wrap items-center gap-2">
                  <input v-no-autofill type="text" v-model="newPattern" list="tvh-shows" placeholder="e.g. NRL" class="field-input flex-1 min-w-[12rem]" />
                  <button type="button" class="btn btn-sm" @click="loadTvhShows" :disabled="loadingShows"
                    title="List the titles TVHeadend has finished recordings for.">
                    <template v-if="loadingShows">LISTING…</template><template v-else><refresh-icon /> REFRESH TITLES</template>
                  </button>
                </div>
                <datalist id="tvh-shows">
                  <option v-for="fs in tvhShows" :key="fs.id" :value="fs.title" />
                </datalist>
                <p class="text-xs text-ink-mute mt-2">Case-insensitive part of the TVHeadend recording title.</p>
              </div>
              <div class="field-row">
                <label class="field-label" for="new-saves-to">Saves to</label>
                <div class="field-prefixed">
                  <span class="field-prefix">{{ mediaRootPrefix(mediaRoot) }}</span>
                  <input v-no-autofill id="new-saves-to" type="text" v-model="newFolder" list="media-folders" placeholder="e.g. NRL" class="field-input" />
                </div>
                <datalist id="media-folders">
                  <option v-for="d in folders" :key="d" :value="d" />
                </datalist>
                <p class="text-xs text-ink-mute mt-2">{{ FOLDER_HINT }}</p>
                <p v-if="suggestion" class="text-xs text-ink-dim mt-2">
                  Suggested ({{ suggestionIsNew ? 'new folder' : 'existing' }}):
                  <code>{{ suggestion }}</code>
                  <button type="button" class="btn-link" @click="newFolder = suggestion">use</button>
                </p>
              </div>
              <div class="field-row">
                <label class="field-label">Season folders</label>
                <input v-no-autofill type="text" v-model="newTemplate" placeholder="Season {season}" class="field-input" />
              </div>
              <div class="field-row">
                <label class="field-label">Ad removal</label>
                <select class="field-input" v-model="newAdRemoval" :disabled="!adRemovalEnabled">
                  <option value="off">OFF</option>
                  <option value="detect">DETECT: mark ad breaks so apps can skip them</option>
                  <option value="cut">CUT: remove ad breaks (keeps .orig backup)</option>
                </select>
                <p v-if="!adRemovalEnabled" class="text-xs text-ink-mute mt-2">Enable ad removal in Settings to use this.</p>
              </div>
            </div>
            <toggle-switch v-model="newDeleteAfter">REMOVE FROM TVHEADEND AFTER IMPORT</toggle-switch>
            <div class="action-row flex flex-wrap items-center gap-3">
              <button type="submit" class="btn btn-primary" :disabled="adding">
                <template v-if="adding">ADDING…</template><template v-else><plus-icon /> ADD TITLE</template>
              </button>
              <span v-if="formStatusText" :class="['status-readout', formStatusKind]">{{ formStatusText }}</span>
            </div>
          </form>
        </div>
      </section>

      <teleport to="body">
      <transition name="epg-sheet">
      <div v-if="assigning" class="epg-modal-backdrop" @click.self="closeAssign">
        <form class="panel epg-modal info-modal" role="dialog" aria-modal="true" aria-labelledby="assign-folder-title" @submit.prevent="assignFolder">
          <header class="panel-header">
            <span id="assign-folder-title" class="panel-title">Assign a folder</span>
            <button type="button" class="btn btn-icon epg-modal-x" @click="closeAssign" aria-label="Close"><cross-icon /></button>
          </header>
          <div class="panel-body space-y-4">
            <p class="text-sm text-ink">Future episodes save to <code>{{ assignPath }}</code>.</p>
            <div class="field-row">
              <label class="field-label" for="assign-folder">Folder</label>
              <div class="field-prefixed">
                <span class="field-prefix">{{ mediaRootPrefix(mediaRoot) }}</span>
                <input v-no-autofill id="assign-folder" v-autofocus type="text" v-model="assignDest" list="assign-media-folders" class="field-input" />
              </div>
              <datalist id="assign-media-folders">
                <option v-for="d in folders" :key="d" :value="d" />
              </datalist>
              <p class="text-xs text-ink-mute mt-2">{{ FOLDER_HINT }}</p>
            </div>
            <div v-if="folders.length" class="field-row">
              <label class="field-label" for="assign-existing">Or pick an existing folder</label>
              <select id="assign-existing" class="field-input" :value="folders.includes(assignDest.trim()) ? assignDest.trim() : ''"
                @change="assignDest = $event.target.value">
                <option value="" disabled>Choose a folder…</option>
                <option v-for="d in folders" :key="d" :value="d">{{ d }}</option>
              </select>
            </div>
            <p class="text-sm text-ink">Episodes already imported stay where they are.</p>
            <div class="epg-modal-actions flex flex-wrap items-center justify-end gap-2">
              <span v-if="assignStatusText" :class="['status-readout', assignStatusKind, 'mr-auto']">{{ assignStatusText }}</span>
              <button type="submit" class="btn btn-primary" :disabled="busyKey === assigning.key">
                <template v-if="busyKey === assigning.key">ASSIGNING…</template><template v-else><check-icon /> ASSIGN</template>
              </button>
            </div>
          </div>
        </form>
      </div>
      </transition>
      </teleport>
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash, flashUntilSyncDone } = useFlash()
    const [formStatusText, formStatusKind, setFormStatus] = makeStatus()
    const series = ref([])
    const titleMatches = ref([])
    const loaded = ref(false)
    const error = ref('')
    const stale = ref(false)
    const editingKey = ref('')
    const busyKey = ref('')
    const tvhShows = ref([])
    const folders = ref([])
    const newPattern = ref('')
    const newFolder = ref('')
    const newTemplate = ref('Season {season}')
    const newDeleteAfter = ref(false)
    const newAdRemoval = ref('off')
    const suggestion = ref('')
    const suggestionIsNew = ref(false)
    const adding = ref(false)
    const loadingShows = ref(false)
    const syncingId = ref(null)
    const mediaRoot = ref('')
    const adRemovalEnabled = ref(false)
    const importUnmatched = ref(true)
    const assigning = ref(null)
    const assignDest = ref('')
    const [assignStatusText, assignStatusKind, setAssignStatus] = makeStatus()
    const filterQ = ref('')
    const statusFilter = ref('all')
    const sortKey = storedChoice({ key: SERIES_SORT_KEY, options: SERIES_SORTS.map((o) => o.key), fallback: 'az' })
    const narrow = useMediaQuery(EPG_NARROW_QUERY)
    const nowMs = ref(Date.now())
    const clock = setInterval(() => (nowMs.value = Date.now()), 30000)
    onUnmounted(() => clearInterval(clock))

    const isFiltering = computed(() => Boolean(filterQ.value.trim()) || statusFilter.value !== 'all')
    const visibleSeries = computed(() => sortSeries({
      series: filterSeries({ series: series.value, query: filterQ.value, status: statusFilter.value, nowMs: nowMs.value }),
      sort: sortKey.value,
    }))
    const visibleTitleMatches = computed(() => filterTitleMatches({ titleMatches: titleMatches.value, query: filterQ.value }))
    const countLabel = ({ shown, total }) => (isFiltering.value && total ? `${shown} of ${total}` : String(total))
    const seriesCountLabel = computed(() => countLabel({ shown: visibleSeries.value.length, total: series.value.length }))
    const titleMatchCountLabel = computed(() =>
      countLabel({ shown: visibleTitleMatches.value.length, total: titleMatches.value.length }))
    const statusLabel = computed(() => SERIES_STATUSES.find((o) => o.key === statusFilter.value)?.label ?? '')
    const noMatchText = computed(() => {
      const query = filterQ.value.trim()
      if (query) return `No series match "${query}".`
      return `No series match ${statusLabel.value}.`
    })
    const clearFilters = () => {
      filterQ.value = ''
      statusFilter.value = 'all'
    }

    const refresh = async () => {
      try {
        const r = await api('GET', '/api/series')
        series.value = r.series || []
        titleMatches.value = r.titleMatches || []
        error.value = r.error || ''
        stale.value = Boolean(r.stale)
      } catch (err) {
        error.value = err.message
      } finally {
        loaded.value = true
      }
    }

    const loadSettings = async () => {
      const s = await fetchSettings().catch(() => ({}))
      mediaRoot.value = s.media_root || ''
      adRemovalEnabled.value = Boolean(s.ad_removal_enabled)
      importUnmatched.value = s.import_unmatched !== false
    }

    const loadFolders = async (title) => {
      const r = await api('GET', `/api/folder-suggest?show=${encodeURIComponent(title)}`).catch(() => ({}))
      folders.value = r.folders || folders.value
      return r.match?.folder || ''
    }

    const suggestFor = async (pattern) => {
      const trimmed = (pattern || '').trim()
      if (trimmed.length < 2) {
        suggestion.value = ''
        suggestionIsNew.value = false
        return
      }
      const existing = await loadFolders(trimmed)
      suggestion.value = existing || folderNameFor(trimmed)
      suggestionIsNew.value = !existing
    }

    let debounceTimer = null
    watch(newPattern, (v) => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => suggestFor(v), 250)
    })

    onMounted(() => Promise.all([refresh(), loadSettings()]))

    const channelsOf = (s) => s.autorecs.some((a) => a.anyChannel)
      ? 'Any channel'
      : [...new Set(s.autorecs.map((a) => a.channelName).filter(Boolean))].join(' + ')
      || (s.autorecs.length === 1 ? '1 channel' : `${s.autorecs.length} channels`)

    const nextAiringLabel = (s) => {
      const next = s.nextAiring
      if (!next) return 'nothing in the guide for the next 7 days'
      const at = tsOfMs(next.startDate)
      const bits = [
        `${fmtRelativeDay(at)} ${fmtClockTz(at)}`,
        ...(next.channelName ? [next.channelName] : []),
        ...(next.episodeTitle ? [next.episodeTitle] : []),
      ]
      return bits.join(' · ')
    }

    const edit = async (key) => {
      editingKey.value = key
      if (folders.value.length === 0) await loadFolders('_')
    }

    const isEditing = (s) => editingKey.value === s.key

    const isEditingTitleMatch = (f) => editingKey.value === `folder-${f.id}`

    const toggleEdit = (key) => {
      if (editingKey.value !== key) return edit(key)
      editingKey.value = ''
    }

    const onSaved = async () => {
      editingKey.value = ''
      await refresh()
      flash({ msg: 'Saved.' })
    }

    const onDeleted = async () => {
      editingKey.value = ''
      await refresh()
      flash({ msg: 'Removed.' })
    }

    const assignPath = computed(() => {
      const folder = assignDest.value.trim() || '…'
      return `${mediaRootPrefix(mediaRoot.value)}${folder}/${seasonFolderFor(assigning.value?.nextAiring?.season)}`
    })

    const openAssign = async (s) => {
      assigning.value = s
      assignDest.value = ''
      assignDest.value = (await loadFolders(s.title)) || folderNameFor(s.title)
    }

    const closeAssign = () => {
      if (busyKey.value === assigning.value?.key) return
      assigning.value = null
    }

    const assignFolder = async () => {
      const s = assigning.value
      const destFolder = assignDest.value.trim()
      if (!destFolder) {
        setAssignStatus('Enter a folder name.', 'err', 5000)
        return
      }
      busyKey.value = s.key
      try {
        await api('POST', '/api/shows', { show_pattern: s.title, dest_folder: destFolder })
        busyKey.value = ''
        assigning.value = null
        await refresh()
        flash({ msg: `Episodes of "${s.title}" save to ${destFolder}. Press EDIT to change it.`, ms: 6000 })
      } catch (err) {
        setAssignStatus(`Error: ${err.message}`, 'err', 5000)
      } finally {
        busyKey.value = ''
      }
    }

    const cancelling = ref(null)

    const openCancelSeries = (s) => {
      cancelling.value = {
        series: s,
        episodeOutcome: stopOutcomeFor(episodeRecordingFor(s.autorecs.map((a) => a.id))),
      }
    }

    const closeCancelSeries = () => {
      if (busyKey.value !== cancelling.value?.series.key) cancelling.value = null
    }

    const cancelSeries = async ({ stopRecordingNow, removeTitleMatch }) => {
      const s = cancelling.value.series
      busyKey.value = s.key
      try {
        await api('POST', '/api/epg/cancel-series', {
          series_link_ids: s.autorecs.map((a) => a.seriesLinkId),
          stop_recording_now: stopRecordingNow,
          title_match_id: removeTitleMatch ? s.folder.id : null,
        })
        busyKey.value = ''
        cancelling.value = null
        refreshAfterRecordingChange()
        await refresh()
        flash({ msg: `Cancelled the series recording of "${s.title}".` })
      } catch (err) {
        busyKey.value = ''
        cancelling.value = null
        flash({ msg: `Cancel failed: ${err.message}`, kind: 'err', ms: 8000 })
        await refresh()
      } finally {
        busyKey.value = ''
      }
    }

    const pauseSeries = async (s, paused) => {
      busyKey.value = s.key
      try {
        await api('POST', '/api/epg/pause-series', {
          series_link_ids: s.autorecs.map((a) => a.seriesLinkId),
          paused,
        })
        await refresh()
        flash({ msg: paused ? `Paused the series recording of "${s.title}".` : `Resumed the series recording of "${s.title}".` })
      } catch (err) {
        flash({ msg: `${paused ? 'Pause' : 'Resume'} failed: ${err.message}`, kind: 'err', ms: 8000 })
        await refresh()
      } finally {
        busyKey.value = ''
      }
    }

    const add = async () => {
      if (!newPattern.value.trim() || !newFolder.value.trim()) {
        setFormStatus('Enter the title and where to save.', 'err', 5000)
        return
      }
      adding.value = true
      try {
        await api('POST', '/api/shows', {
          show_pattern: newPattern.value.trim(),
          dest_folder: newFolder.value.trim(),
          season_template: newTemplate.value.trim() || 'Season {season}',
          delete_after_import: newDeleteAfter.value === true,
          ad_removal: newAdRemoval.value,
        })
        newPattern.value = ''
        newFolder.value = ''
        newTemplate.value = 'Season {season}'
        newDeleteAfter.value = false
        newAdRemoval.value = 'off'
        suggestion.value = ''
        await refresh()
        setFormStatus('Added.')
      } catch (err) {
        setFormStatus(`Error: ${err.message}`, 'err', 5000)
      } finally {
        adding.value = false
      }
    }

    const loadTvhShows = async () => {
      loadingShows.value = true
      setFormStatus('Listing TVHeadend recordings…', 'busy', 0)
      try {
        const r = await api('POST', '/api/tvh-shows')
        tvhShows.value = r.shows
        setFormStatus(`Found ${r.shows.length} title${r.shows.length === 1 ? '' : 's'}.`, 'ok', 5000)
      } catch (err) {
        setFormStatus(`Error: ${err.message}`, 'err', 5000)
      } finally {
        loadingShows.value = false
      }
    }

    const syncOne = async (folder) => {
      syncingId.value = folder.id
      try {
        const r = await api('POST', '/api/sync', { show_id: folder.id })
        if (r.alreadyRunning) flash({ msg: 'A sync is already running.', kind: 'info' })
        else flashUntilSyncDone({ msg: `Started sync #${r.syncId} for "${folder.show_pattern}".` })
        await loadSyncStatus()
        ensureSyncPolling()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      } finally {
        syncingId.value = null
      }
    }

    return {
      series, titleMatches, loaded, error, stale, editingKey, busyKey,
      filterQ, statusFilter, sortKey, narrow, visibleSeries, visibleTitleMatches, seriesCountLabel, titleMatchCountLabel,
      statusLabel, noMatchText, clearFilters, SERIES_SORTS, SERIES_STATUSES,
      tvhShows, folders, mediaRoot, mediaRootPrefix, adRemovalEnabled, importUnmatched, FOLDER_HINT,
      assigning, assignDest, assignPath, assignStatusText, assignStatusKind, openAssign, closeAssign, assignFolder,
      newPattern, newFolder, newTemplate, newDeleteAfter, newAdRemoval,
      suggestion, suggestionIsNew, adding, loadingShows, syncingId,
      channelsOf, nextAiringLabel, edit, isEditing, isEditingTitleMatch, toggleEdit, onSaved, onDeleted, pauseSeries,
      cancelling, openCancelSeries, closeCancelSeries, cancelSeries,
      add, loadTvhShows, syncOne,
      flashText, flashKind, formStatusText, formStatusKind,
    }
  },
}
