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
import { PHONE_LAYOUT_QUERY } from '/shared/constants.js'
import { makeStatus } from '/shared/path-check.js'
import { episodeRecordingFor, stopOutcomeFor } from '/shared/recording-helpers.js'
import { refreshAfterRecordingChange } from '/shared/recording-now.js'
import { storedChoice } from '/shared/storage.js'
import { loadSyncStatus, ensureSyncPolling } from '/shared/sync-status.js'
import { fmtClockTz, fmtRelativeDay, tsOfMs } from '/shared/time.js'
import { sentenceCase } from '/sentence-case.js'
import { mediaRootPrefix, FOLDER_HINT } from '/views/folder-editor.js'

const SERIES_SORT_KEY = 'freetvarr.seriesSort'

const seasonFolderFor = (season) => `Season ${season == null ? '…' : String(season).padStart(2, '0')}`

const folderNameFor = (title) => String(title || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()

export const SeriesView = {
  props: {
    part: { type: String, default: 'series' },
  },
  template: `
    <div v-page-reveal class="settings-page series-page">
      <template v-if="part === 'series'">
        <teleport defer to="#settings-page-info">
          <info-button title="Series rules" doc="guide/series">
            <p>Each row is a series recording in TVHeadend. <strong>Saves to</strong> shows the folder where each sync saves its finished episodes.</p>
            <p>To record a new series, open the <strong>TV guide</strong>, pick a programme, and press <strong>Record series</strong>. An SD and an HD recording of the same title show as one series.</p>
            <p>Press a row to open the series under it. There you change where episodes save, the season folders, ad removal, and whether Freetvarr removes the TVHeadend copy after import.</p>
            <p>A series with no folder in your TV library gets a new folder, named after the series, on its next import. To choose the folder first, open the series and press <strong>Assign folder</strong>. To save a series to the one-off folder instead, choose <strong>Move to One-offs</strong> in its ⋯ menu in Recordings. Episodes already imported stay where they are.</p>
            <p><strong>Pause</strong>, in the open series, stops TVHeadend recording new episodes of this series, and the row shows <strong>Paused</strong>. Episodes already recorded still import. <strong>Resume</strong> starts it again.</p>
            <p><strong>Cancel series</strong>, in the open series, cancels the series recording in TVHeadend. It asks whether to stop an episode recording now and whether to keep the title match. Episodes already recorded stay, and so do their files.</p>
            <p>Type in the filter box to find a series by title, channel, or folder. <strong>Sort</strong> orders the rows, and <strong>Status</strong> shows only paused series, series not in the TV guide, or series recording now.</p>
          </info-button>
        </teleport>
        <template v-if="loaded">
          <p v-if="error" class="ui-banner is-error">Cannot read the series recordings from TVHeadend: {{ error }}</p>
          <p v-else-if="stale" class="ui-banner is-warning">TVHeadend is not answering. This is its last known state.</p>
        </template>
        <div v-if="!loaded || (!error && series.length)" class="settings-filters">
          <div class="settings-filter-bar">
            <input v-no-autofill v-model="filterQ" type="search" class="field-input settings-search"
              placeholder="Filter series or channels" aria-label="Filter series or channels" />
            <select v-model="sortKey" class="field-input settings-select" aria-label="Sort series">
              <option v-for="o in SERIES_SORTS" :key="o.key" :value="o.key">{{ sentenceCase(o.label) }}</option>
            </select>
          </div>
          <div class="settings-filter" role="group" aria-labelledby="series-status-label">
            <span id="series-status-label" class="settings-filter-label">Status</span>
            <div class="ui-chip-row is-scroll">
              <button v-for="o in SERIES_STATUSES" :key="o.key" type="button" class="ui-chip is-small"
                :aria-pressed="String(statusFilter === o.key)" @click="statusFilter = o.key">{{ sentenceCase(o.label) }}</button>
            </div>
          </div>
        </div>
        <div v-if="!loaded" class="settings-group" aria-hidden="true">
          <div class="settings-group-head">
            <h3 class="ui-group-label">Series</h3>
          </div>
          <div class="ui-group settings-table-card"><list-skeleton :rows="5" /></div>
        </div>
        <template v-else>
          <div v-if="!error && series.length === 0" class="ui-group">
            <p class="settings-empty">No series recordings yet. Open the <a href="#/guide">TV guide</a>, pick a programme, and press <strong>Record series</strong>.</p>
          </div>
          <template v-else>
            <div v-if="!visibleSeries.length" class="settings-meta-line settings-no-match">
              <span>{{ noMatchText }}</span>
              <button type="button" class="ui-button ui-button-sm" @click="clearFilters"><cross-icon /> Clear filters</button>
            </div>
            <div v-else class="settings-group">
              <div class="settings-group-head">
                <h3 class="ui-group-label">Series</h3>
                <span class="settings-group-count" aria-live="polite">{{ seriesCountLabel }}</span>
              </div>
              <div class="ui-group settings-table-card">
                <table v-if="!narrow" class="deck-table series-table">
                  <thead><tr>
                    <th>Series</th><th>Next</th><th>Saves to</th><th><span class="sr-only">Sync</span></th>
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
                              <span class="settings-cell-title">{{ s.title }}<span v-if="!s.recording" class="settings-badge">Paused</span></span>
                              <span class="recording-cell-channel">{{ channelsOf(s) }}<template v-if="s.episodesToKeep"> · keeps the latest {{ s.episodesToKeep }}</template></span>
                            </div>
                          </div>
                        </td>
                        <td class="series-next">{{ nextAiringLabel(s) }}</td>
                        <td class="series-saves-to"><template v-if="s.savesTo?.path"><code>{{ s.savesTo.path }}</code> <template v-if="s.savesTo?.kind === 'newFolder'">(a new folder, made on the next import)</template></template><template v-else>Nowhere yet: episodes wait in the <a href="#/settings/system/log">Recording log</a></template></td>
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
                            @saved="onSaved" @close="editingKey = ''" @assign="openAssign(s)"
                            @pause="pauseSeries(s, s.recording)" @cancel-series="openCancelSeries(s)" />
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
                <div v-else class="list-rows">
                  <article v-for="s in visibleSeries" :key="s.key" :class="['list-row', 'series-card', 'toggle-card', { open: isEditing(s) }]"
                    tabindex="0" :aria-expanded="String(isEditing(s))" :aria-label="s.title + ': show settings'"
                    @click="toggleEdit(s.key)" @keydown.enter.self.prevent="toggleEdit(s.key)" @keydown.space.self.prevent="toggleEdit(s.key)">
                    <div class="list-row-main">
                      <div class="deck-card-with-image">
                        <programme-image :event-id="s.imageProgramId" :channel-id="s.autorecs[0]?.channelId" :title="s.title" />
                        <div class="deck-card-text">
                          <span class="deck-card-title">{{ s.title }}<span v-if="!s.recording" class="settings-badge">Paused</span></span>
                          <p class="deck-card-meta">{{ channelsOf(s) }}<template v-if="s.episodesToKeep"> · keeps the latest {{ s.episodesToKeep }}</template></p>
                          <p class="deck-card-meta"><span class="deck-card-label">Next</span> {{ nextAiringLabel(s) }}</p>
                          <p class="deck-card-meta"><span class="deck-card-label">Saves to</span> <template v-if="s.savesTo?.path"><code>{{ s.savesTo.path }}</code> <template v-if="s.savesTo?.kind === 'newFolder'">(a new folder, made on the next import)</template></template><template v-else>nowhere yet: episodes wait in the <a href="#/settings/system/log">Recording log</a></template></p>
                        </div>
                      </div>
                      <folder-sync-button v-if="s.folder" :folder="s.folder" is-series :syncing="syncingId === s.folder.id" @sync="syncOne(s.folder)" />
                    </div>
                    <series-drawer v-if="isEditing(s)" class="drawer-card" @click.stop @keydown.stop :series="s" :folders="folders" :media-root="mediaRoot" :ad-removal-enabled="adRemovalEnabled"
                      :import-unmatched="importUnmatched" :busy="busyKey === s.key"
                      @saved="onSaved" @close="editingKey = ''" @assign="openAssign(s)"
                      @pause="pauseSeries(s, s.recording)" @cancel-series="openCancelSeries(s)" />
                  </article>
                </div>
              </div>
            </div>
          </template>
        </template>
        <p class="settings-note settings-cross-link">For title matches and their folders, open <a href="#/settings/system/folders">Title matches</a>.</p>
      </template>

      <ui-sheet :open="Boolean(cancelling)" title="Cancel series" @close="closeCancelSeries">
        <cancel-series-step v-if="cancelling" :title="cancelling.series.title" :episode-outcome="cancelling.episodeOutcome"
          :title-match="cancelling.series.folder" :busy="busyKey === cancelling.series.key" :show-back="false"
          @confirm="cancelSeries" />
      </ui-sheet>

      <template v-if="part === 'folders'">
        <p class="settings-meta-line">A recording whose title contains this text saves to its folder, even without a series recording.</p>
        <teleport defer to="#settings-page-info">
          <info-button title="Title matches" doc="guide/series#title-matches">
            <p>A recording whose title contains this text saves to its folder, even without a series recording. This covers a title you typed by hand, such as <code>NRL</code>, or a series you cancelled and kept the title match for.</p>
            <p><strong>Add title</strong> adds one. Freetvarr suggests a folder under your media root, and matches folders that are already there.</p>
          </info-button>
        </teleport>
        <section id="section-folders" class="settings-group">
          <div class="settings-group-head">
            <h3 class="ui-group-label">Title matches</h3>
            <span class="settings-group-count">{{ titleMatchCountLabel }}</span>
          </div>
          <input v-if="titleMatches.length > 5" v-no-autofill v-model="filterQ" type="search" class="field-input settings-search settings-search-block"
            placeholder="Filter titles" aria-label="Filter titles" />
          <div v-if="!loaded" class="ui-group"><list-skeleton :rows="3" /></div>
          <div v-else-if="!titleMatches.length" class="ui-group"><p class="settings-empty">No title matches yet. Add one below.</p></div>
          <div v-else-if="!visibleTitleMatches.length" class="ui-group"><p class="settings-empty">No title matches for "{{ filterQ.trim() }}".</p></div>
          <div v-else class="ui-group settings-table-card">
            <table v-if="!narrow" class="deck-table title-match-table">
              <thead><tr>
                <th>Title</th><th>Saves to</th><th><span class="sr-only">Sync</span></th>
              </tr></thead>
              <tbody>
                <template v-for="f in visibleTitleMatches" :key="f.id">
                  <tr :class="['toggle-row', { open: isEditingTitleMatch(f) }]" tabindex="0"
                    :aria-expanded="String(isEditingTitleMatch(f))" :aria-label="f.show_pattern + ': show settings'"
                    @click="toggleEdit('folder-' + f.id)" @keydown.enter.self.prevent="toggleEdit('folder-' + f.id)" @keydown.space.self.prevent="toggleEdit('folder-' + f.id)">
                    <td class="settings-cell-title">{{ f.show_pattern }}</td>
                    <td class="series-saves-to"><code v-if="f.savesTo?.path">{{ f.savesTo.path }}</code><template v-else>Nowhere yet: recordings wait in the <a href="#/settings/system/log">Recording log</a></template></td>
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
            <div v-else class="list-rows">
              <article v-for="f in visibleTitleMatches" :key="f.id" :class="['list-row', 'toggle-card', { open: isEditingTitleMatch(f) }]"
                tabindex="0" :aria-expanded="String(isEditingTitleMatch(f))" :aria-label="f.show_pattern + ': show settings'"
                @click="toggleEdit('folder-' + f.id)" @keydown.enter.self.prevent="toggleEdit('folder-' + f.id)" @keydown.space.self.prevent="toggleEdit('folder-' + f.id)">
                <div class="list-row-main">
                  <div class="list-row-stack">
                    <span class="deck-card-title block">{{ f.show_pattern }}</span>
                    <p class="deck-card-meta"><span class="deck-card-label">Saves to</span> <code v-if="f.savesTo?.path">{{ f.savesTo.path }}</code><template v-else>nowhere yet: recordings wait in the <a href="#/settings/system/log">Recording log</a></template></p>
                  </div>
                  <folder-sync-button :folder="f" :syncing="syncingId === f.id" @sync="syncOne(f)" />
                </div>
                <series-folder-editor v-if="isEditingTitleMatch(f)" class="drawer-card" @click.stop @keydown.stop :folder="f" :folders="folders"
                  :media-root="mediaRoot" :ad-removal-enabled="adRemovalEnabled" :import-unmatched="importUnmatched"
                  @saved="onSaved" @deleted="onDeleted" @cancel="editingKey = ''" />
              </article>
            </div>
          </div>
        </section>

        <form class="settings-group" data-setting="add-title" @submit.prevent="add">
          <h3 class="ui-group-label">Add title</h3>
          <div class="ui-group">
            <div class="settings-row">
              <label class="field-label" for="new-title-pattern">Recording titles that contain</label>
              <div class="field-action">
                <div class="field-action-controls">
                  <input v-no-autofill id="new-title-pattern" type="text" v-model="newPattern" list="tvh-shows" placeholder="e.g. NRL" class="field-input" />
                  <button type="button" :class="['ui-button', { 'is-pending': loadingShows }]" @click="loadTvhShows" :disabled="loadingShows"
                    title="List the titles TVHeadend has finished recordings for.">
                    <template v-if="loadingShows"><span class="spinner" aria-hidden="true"></span> Listing…</template><template v-else><refresh-icon /> Refresh titles</template>
                  </button>
                </div>
              </div>
              <datalist id="tvh-shows">
                <option v-for="fs in tvhShows" :key="fs.id" :value="fs.title" />
              </datalist>
              <p class="settings-hint">Case-insensitive part of the TVHeadend recording title.</p>
            </div>
            <div class="settings-row">
              <label class="field-label" for="new-saves-to">Saves to</label>
              <div class="field-prefixed">
                <span class="field-prefix">{{ mediaRootPrefix(mediaRoot) }}</span>
                <input v-no-autofill id="new-saves-to" type="text" v-model="newFolder" list="media-folders" placeholder="e.g. NRL" class="field-input" />
              </div>
              <datalist id="media-folders">
                <option v-for="d in folders" :key="d" :value="d" />
              </datalist>
              <p class="settings-hint">{{ FOLDER_HINT }}</p>
              <p v-if="suggestion" class="settings-hint">
                Suggested ({{ suggestionIsNew ? 'new folder' : 'existing' }}):
                <code>{{ suggestion }}</code>
                <button type="button" class="btn-link" @click="newFolder = suggestion">Use</button>
              </p>
            </div>
            <div class="settings-row settings-row-split">
              <div>
                <label class="field-label" for="new-season-template">Season folders</label>
                <input v-no-autofill id="new-season-template" type="text" v-model="newTemplate" placeholder="Season {season}" class="field-input" />
              </div>
              <div>
                <label class="field-label" for="new-ad-removal">Ad removal</label>
                <select id="new-ad-removal" class="field-input" v-model="newAdRemoval" :disabled="!adRemovalEnabled">
                  <option value="off">Off</option>
                  <option value="detect">Detect: mark ad breaks so apps can skip them</option>
                  <option value="cut">Cut: remove ad breaks (keeps .orig backup)</option>
                </select>
                <p v-if="!adRemovalEnabled" class="settings-hint">Turn on ad removal in <a href="#/settings/ad-removal">Settings</a> to use this.</p>
              </div>
            </div>
            <div class="settings-row" data-setting="remove-after-import">
              <toggle-switch v-model="newDeleteAfter" class="settings-toggle">
                <span class="settings-row-title">Remove from TVHeadend after import</span>
              </toggle-switch>
            </div>
            <div class="settings-row settings-row-actions">
              <button type="submit" class="ui-button ui-button-primary" :disabled="adding">
                <template v-if="adding">Adding…</template><template v-else><plus-icon /> Add title</template>
              </button>
              <span v-if="formStatusText" :class="['status-readout', formStatusKind]">{{ formStatusText }}</span>
            </div>
          </div>
        </form>
      </template>

      <ui-sheet :open="Boolean(assigning)" title="Assign a folder" @close="closeAssign">
        <form v-if="assigning" id="assign-folder-form" class="assign-folder-form" @submit.prevent="assignFolder">
          <p class="cancel-series-question">Future episodes save to <code>{{ assignPath }}</code>.</p>
          <div class="field-row">
            <label class="field-label" for="assign-folder">Folder</label>
            <div class="field-prefixed">
              <span class="field-prefix">{{ mediaRootPrefix(mediaRoot) }}</span>
              <input v-no-autofill id="assign-folder" v-autofocus type="text" v-model="assignDest" list="assign-media-folders" class="field-input" />
            </div>
            <datalist id="assign-media-folders">
              <option v-for="d in folders" :key="d" :value="d" />
            </datalist>
            <p class="cancel-series-note">{{ FOLDER_HINT }}</p>
          </div>
          <div v-if="folders.length" class="field-row">
            <label class="field-label" for="assign-existing">Or pick an existing folder</label>
            <select id="assign-existing" class="field-input" :value="folders.includes(assignDest.trim()) ? assignDest.trim() : ''"
              @change="assignDest = $event.target.value">
              <option value="" disabled>Choose a folder…</option>
              <option v-for="d in folders" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
          <p class="cancel-series-note">Episodes already imported stay where they are.</p>
          <p v-if="assignStatusText" :class="['status-readout', assignStatusKind]">{{ assignStatusText }}</p>
        </form>
        <template v-if="assigning" #footer>
          <button type="submit" form="assign-folder-form" class="ui-button ui-button-primary ui-button-block" :disabled="busyKey === assigning.key">
            <template v-if="busyKey === assigning.key">Assigning…</template><template v-else><check-icon /> Assign</template>
          </button>
        </template>
      </ui-sheet>
    </div>
  `,
  setup() {
    const { flash, flashUntilSyncDone } = useFlash()
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
    const narrow = useMediaQuery(PHONE_LAYOUT_QUERY)
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
      return `No series match ${sentenceCase(statusLabel.value).toLowerCase()}.`
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
        flash({ msg: `Episodes of "${s.title}" save to ${destFolder}. Open the series to change it.` })
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
        flash({ msg: `Cancel failed: ${err.message}`, kind: 'error' })
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
        flash({ msg: `${paused ? 'Pause' : 'Resume'} failed: ${err.message}`, kind: 'error' })
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
        flash({ msg: `Error: ${err.message}`, kind: 'error' })
      } finally {
        syncingId.value = null
      }
    }

    return {
      series, titleMatches, loaded, error, stale, editingKey, busyKey,
      filterQ, statusFilter, sortKey, narrow, visibleSeries, visibleTitleMatches, seriesCountLabel, titleMatchCountLabel,
      statusLabel, noMatchText, clearFilters, SERIES_SORTS, SERIES_STATUSES, sentenceCase,
      tvhShows, folders, mediaRoot, mediaRootPrefix, adRemovalEnabled, importUnmatched, FOLDER_HINT,
      assigning, assignDest, assignPath, assignStatusText, assignStatusKind, openAssign, closeAssign, assignFolder,
      newPattern, newFolder, newTemplate, newDeleteAfter, newAdRemoval,
      suggestion, suggestionIsNew, adding, loadingShows, syncingId,
      channelsOf, nextAiringLabel, edit, isEditing, isEditingTitleMatch, toggleEdit, onSaved, onDeleted, pauseSeries,
      cancelling, openCancelSeries, closeCancelSeries, cancelSeries,
      add, loadTvhShows, syncOne,
      formStatusText, formStatusKind,
    }
  },
}
