import {
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  watch,
} from '/vendor/vue.esm-browser.prod.js'
import { fmtPlayTime, RESUME_END_MARGIN_S } from '/playback.js'
import { libraryStateTitle, libraryStatusOf } from '/recording-info.js'
import { formatMinutes } from '/time-format.js'
import { clearedListMessage, restoredListMessage } from '/clear-list.js'
import {
  adScanConfirm,
  clearListConfirm,
  clearRowConfirm,
  removeFromTvhConfirm,
} from '/recording-confirm.js'
import { RECORDING_SORTS, recordingSortFor, headerSortKey } from '/recording-sort.js'
import { LOG_STATUSES, logFiltersFromHash } from '/recording-log-filters.js'
import { sentenceCase } from '/sentence-case.js'
import { adScanTitle, canAdScan as canAdScanRecording, isAdScanBlocked } from '/ad-scan.js'
import { useConfirm } from '/components/dialogs.js'
import { api, fetchSettings } from '/shared/api.js'
import { useMediaQuery, useFlash } from '/shared/composables.js'
import { PHONE_LAYOUT_QUERY } from '/shared/constants.js'
import { fmtBytes, seasonEpisodeLabel } from '/shared/format.js'
import { playRecording } from '/shared/playback-session.js'
import { storedChoice } from '/shared/storage.js'
import { syncStatus } from '/shared/sync-status.js'
import { fmtTime } from '/shared/time.js'

const UNDO_WINDOW_MS = 10_000

const RECORDINGS_POLL_MS = 60_000
const RECORDINGS_ACTIVE_POLL_MS = 2_000
const UNIMPORTED_STATUSES = ['failed', 'skipped', 'not_imported']

const RECORDINGS_SORT_KEY = 'freetvarr.recordingsSort'

export const RecordingsView = {
  template: `
    <div class="view-reveal settings-page log-page">
      <div class="settings-toolbar">
        <button type="button" class="ui-icon-button" @click="manualRefresh" aria-label="Refresh" title="Refresh"><refresh-icon /></button>
        <button type="button" class="ui-button" @click="askClearList" :disabled="clearing || clearable === 0"
          title="Removes rows for recordings no longer in TVHeadend from this list. Files stay in your library.">
          <cross-icon /> {{ clearing ? 'Clearing…' : 'Clear from list' }}
        </button>
        <button v-if="undoIds.length" type="button" class="ui-button" @click="undoClear" :disabled="restoring"
          title="Puts the cleared rows back in this list."><arrow-left-icon /> Undo</button>
        <span class="settings-toolbar-end"></span>
        <info-button title="Recording log" doc="guide/recordings">
          <p>Every recording TVHeadend has finished, and what Freetvarr did with it: <strong>Imported</strong>, <strong>Partial</strong>, <strong>Skipped</strong>, <strong>Failed</strong>, or <strong>Not imported</strong>. The next sync tries a <strong>Partial</strong> import again.</p>
          <p><strong>Replaced</strong> means another app, such as Sonarr, put a different file for the episode in place of Freetvarr's. <strong>Not in library</strong> means the file is gone; press <strong>Import again</strong> to import the TVHeadend copy again.</p>
          <p>Series episodes go into their series folder. A single recording goes to the one-off folder, and a film to the movies folder. Press <strong>Import</strong> on a <strong>Not imported</strong> recording to add it to the library.</p>
          <p><strong>Not in TVHeadend</strong> means TVHeadend has deleted its copy. The episode is still in your library, so you can play it, scan it for ads, or cut it again.</p>
          <p>A copy, an ad scan, or a cut shows a progress bar while it runs.</p>
          <p><strong>Sort</strong> orders the list by air date, title, series, import time, or size. The browser remembers your choice.</p>
          <p>Press a row to see the recording's details: its channel, length, size, file, ads, and the full error if it has one. The buttons there play, import, scan for ads, or remove it.</p>
        </info-button>
      </div>

      <div class="settings-filters">
        <div class="settings-filter-bar">
          <select :value="showFilter" @change="setShow($event.target.value)" class="field-input settings-select" aria-label="Show">
            <option value="all">Any show</option>
            <option v-for="s in shows" :key="s.id" :value="s.id">{{ s.show_pattern }}</option>
          </select>
          <select v-model="sortKey" class="field-input settings-select" aria-label="Sort recordings">
            <option v-for="o in RECORDING_SORTS" :key="o.key" :value="o.key">{{ sentenceCase(o.label) }}</option>
          </select>
        </div>
        <div v-for="g in chipGroups" :key="g.key" class="settings-filter" role="group" :aria-labelledby="'log-filter-' + g.key">
          <span :id="'log-filter-' + g.key" class="settings-filter-label">{{ g.label }}</span>
          <div class="ui-chip-row is-scroll">
            <button v-for="opt in g.options" :key="opt.key" type="button" class="ui-chip is-small"
              :aria-pressed="String(g.value === opt.key)" @click="g.set(opt.key)">{{ opt.label }}</button>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-head">
          <h3 class="ui-group-label">Recordings</h3>
          <span v-if="loaded" class="settings-group-count">{{ rangeLabel }} of {{ total }}</span>
        </div>
        <div v-if="!loaded" class="ui-group settings-table-card"><list-skeleton :rows="8" /></div>
        <div v-else-if="recordings.length" class="ui-group settings-table-card">
          <table class="deck-table recordings-table hidden lg:table">
            <thead><tr>
              <th class="sortable" @click="toggleSort('title')">Recording<sort-arrow :dir="sortDirFor('title')" /></th>
              <th class="sortable" @click="toggleSort('show_pattern')">Show<sort-arrow :dir="sortDirFor('show_pattern')" /></th>
              <th>Status</th>
              <th class="sortable" @click="toggleSort('aired_at')">Aired<sort-arrow :dir="sortDirFor('aired_at')" /></th>
              <th><span class="sr-only">Play</span></th>
            </tr></thead>
            <tbody>
              <template v-for="r in recordings" :key="r.recording_id">
                <tr :class="['toggle-row', { 'not-in-tvh': r.deleted_from_tvh_at, open: isOpen(r) }]" tabindex="0"
                  :aria-expanded="String(isOpen(r))" :aria-label="r.title + ': show details'"
                  @click="toggleOpen(r)" @keydown.enter.self.prevent="toggleOpen(r)" @keydown.space.self.prevent="toggleOpen(r)">
                  <td>
                    <div class="recording-cell">
                      <programme-image :source="imageUrl(r)" variant="thumb" :channel-id="r.channel_id" :has-logo="Boolean(r.channel_id)" :title="r.title" />
                      <div class="recording-cell-text">
                        <span class="settings-cell-title">{{ r.title }}</span>
                        <span v-if="r.episode_title" class="recording-cell-episode">{{ r.episode_title }}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="recording-cell-text">
                      <span>{{ showLabel(r) }}</span>
                      <span v-if="se(r)" class="recording-cell-channel">{{ se(r) }}</span>
                    </div>
                  </td>
                  <td class="recording-status-cell">
                    <recording-status :recording="r" :ctx="drawerContext" />
                  </td>
                  <td class="ui-tabular whitespace-nowrap text-ink-dim">{{ r.aired_at ? fmtTime(r.aired_at) : '' }}</td>
                  <td>
                    <div class="rec-actions flex items-center justify-end">
                      <button v-if="r.playable" type="button" class="ui-button ui-button-sm ui-button-icon ui-button-watch recording-play"
                        @click.stop="playRecording(r)" @keydown.stop :title="playTitle(r)" :aria-label="playTitle(r)">
                        <play-icon />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="isOpen(r)" class="drawer-row">
                  <td colspan="5"><recording-drawer class="drawer-card" :recording="r" :ctx="drawerContext" /></td>
                </tr>
              </template>
            </tbody>
          </table>
          <div class="lg:hidden list-rows">
            <article v-for="r in recordings" :key="r.recording_id"
              :class="['list-row', 'toggle-card', { 'not-in-tvh': r.deleted_from_tvh_at, open: isOpen(r) }]"
              tabindex="0" :aria-expanded="String(isOpen(r))" :aria-label="r.title + ': show details'"
              @click="toggleOpen(r)" @keydown.enter.self.prevent="toggleOpen(r)" @keydown.space.self.prevent="toggleOpen(r)">
              <div class="list-row-main">
                <div class="deck-card-with-image">
                  <programme-image :source="imageUrl(r)" variant="thumb" :channel-id="r.channel_id" :has-logo="Boolean(r.channel_id)" :title="r.title" />
                  <div class="deck-card-text">
                    <span class="deck-card-title block">{{ r.title }}</span>
                    <span v-if="r.episode_title" class="recording-cell-episode block">{{ r.episode_title }}</span>
                    <p class="deck-card-meta">{{ [showLabel(r), se(r), r.aired_at ? fmtTime(r.aired_at) : ''].filter(Boolean).join(' · ') }}</p>
                    <recording-status :recording="r" :ctx="drawerContext" inline />
                  </div>
                </div>
                <button v-if="r.playable" type="button" class="ui-button ui-button-sm ui-button-icon ui-button-watch recording-play"
                  @click.stop="playRecording(r)" @keydown.stop :title="playTitle(r)" :aria-label="playTitle(r)">
                  <play-icon />
                </button>
              </div>
              <recording-drawer v-if="isOpen(r)" class="drawer-card" :recording="r" :ctx="drawerContext" @click.stop @keydown.stop />
            </article>
          </div>
        </div>
        <div v-else-if="total === 0 && hasFiltersApplied" class="ui-group settings-no-match-card">
          <p class="settings-empty">No recordings match the current filters.</p>
          <button type="button" class="ui-button ui-button-sm" @click="clearAllFilters"><cross-icon /> Clear filters</button>
        </div>
        <div v-else-if="total === 0" class="ui-group">
          <p class="settings-empty">
            No recordings yet. To make a recording, open the <a href="#/guide">TV guide</a>, pick a programme, and press <strong>Record</strong> or <strong>Record series</strong>. Recordings show here once TVHeadend starts them.
          </p>
        </div>
      </div>
      <div v-if="total > pageSize" class="settings-pager">
        <span class="settings-meta-line">Page {{ page }} of {{ totalPages }} · {{ total }} total</span>
        <div class="settings-pager-buttons">
          <button type="button" class="ui-button ui-button-sm" :disabled="page <= 1" @click="page = page - 1"><arrow-left-icon /> Previous</button>
          <button type="button" class="ui-button ui-button-sm" :disabled="page >= totalPages" @click="page = page + 1">Next <arrow-right-icon /></button>
        </div>
      </div>
      <confirm-dialog :open="Boolean(confirming)" :dialog="confirming?.dialog" :icon="confirming?.icon"
        :busy="confirmBusy" @confirm="runConfirmed" @cancel="closeConfirm" />
    </div>
  `,
  setup() {
    const { flash } = useFlash()
    const recordings = ref([])
    const shows = ref([])
    const deletingId = ref(null)
    const removingId = ref(null)
    const importingId = ref(null)
    const clearing = ref(false)
    const adRemovalEnabled = ref(false)
    const adRetentionDays = ref('7')
    const { confirming, confirmBusy, askConfirm, closeConfirm, runConfirmed } = useConfirm()
    const adScanningId = ref(null)
    const total = ref(0)
    const loaded = ref(false)
    const page = ref(1)
    const pageSize = ref(50)
    const sortKey = storedChoice({ key: RECORDINGS_SORT_KEY, options: RECORDING_SORTS.map((o) => o.key), fallback: 'newest' })
    const sort = computed(() => recordingSortFor(sortKey.value))
    const linkedFilters = logFiltersFromHash(window.location.hash)
    const statusFilter = ref(linkedFilters.status)
    const showFilter = ref('all')
    const sinceFilter = ref(linkedFilters.since)
    const deletedFilter = ref(linkedFilters.deleted)
    const clearable = ref(0)
    const undoIds = ref([])
    const restoring = ref(false)

    const statusOptions = LOG_STATUSES
    const sinceOptions = [
      { key: 'all', label: 'Any time' },
      { key: '1h', label: 'Last hour' },
      { key: '24h', label: '24 hours' },
      { key: '7d', label: '7 days' },
      { key: '30d', label: '30 days' },
      { key: '90d', label: '90 days' },
    ]
    const deletedOptions = [
      { key: 'all', label: 'All' },
      { key: 'on_tvh', label: 'In TVHeadend' },
      { key: 'deleted', label: 'Not in TVHeadend' },
    ]

    const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

    const rangeLabel = computed(() => {
      if (total.value === 0) return '0'
      const start = (page.value - 1) * pageSize.value + 1
      const end = Math.min(total.value, page.value * pageSize.value)
      return `${start}–${end}`
    })

    const hasFiltersApplied = computed(() =>
      statusFilter.value !== 'all'
      || showFilter.value !== 'all'
      || sinceFilter.value !== 'all'
      || deletedFilter.value !== 'all',
    )

    const manualRefresh = async () => {
      try {
        await refresh()
        flash({ msg: `Refreshed ${total.value} recording${total.value === 1 ? '' : 's'}.` })
      } catch (err) {
        flash({ msg: `Refresh failed: ${err.message}`, kind: 'error' })
      }
    }

    const refresh = async () => {
      const params = new URLSearchParams({
        page: String(page.value),
        pageSize: String(pageSize.value),
      })
      params.set('sort', sort.value.column)
      params.set('dir', sort.value.dir)
      if (statusFilter.value !== 'all') params.set('status', statusFilter.value)
      if (showFilter.value !== 'all') params.set('show_id', String(showFilter.value))
      if (sinceFilter.value !== 'all') params.set('since', sinceFilter.value)
      if (deletedFilter.value !== 'all') params.set('deleted', deletedFilter.value)
      const r = await api('GET', `/api/recordings?${params}`)
      recordings.value = r.recordings
      total.value = r.total
      loaded.value = true
      clearable.value = r.clearable ?? 0
      if (page.value > 1 && r.recordings.length === 0) page.value = 1
    }

    const loadShows = async () => {
      const r = await api('GET', '/api/shows').catch(() => ({ shows: [] }))
      shows.value = r.shows || []
    }

    const loadAdRemovalSetting = async () => {
      const s = await fetchSettings().catch(() => ({}))
      adRemovalEnabled.value = Boolean(s.ad_removal_enabled)
      adRetentionDays.value = s.ad_original_retention_days || '7'
    }

    const setStatus = (v) => { statusFilter.value = v; page.value = 1 }
    const setShow = (v) => { showFilter.value = v; page.value = 1 }
    const setSince = (v) => { sinceFilter.value = v; page.value = 1 }
    const setDeleted = (v) => { deletedFilter.value = v; page.value = 1 }

    const narrow = useMediaQuery(PHONE_LAYOUT_QUERY)

    const chipGroups = computed(() => [
      {
        key: 'status',
        label: 'Status',
        value: statusFilter.value,
        set: setStatus,
        options: statusOptions.map((opt) => ({ key: opt, label: sentenceCase(statusLabel(opt)) })),
      },
      { key: 'since', label: 'When', value: sinceFilter.value, set: setSince, options: sinceOptions },
      { key: 'deleted', label: 'TVHeadend', value: deletedFilter.value, set: setDeleted, options: deletedOptions },
    ])

    const activeFilters = computed(() => chipGroups.value
      .filter((g) => g.value !== 'all')
      .map((g) => ({
        key: g.key,
        label: g.options.find((opt) => opt.key === g.value)?.label ?? g.value,
        clear: () => g.set('all'),
      })))

    const clearSheetFilters = () => {
      statusFilter.value = 'all'
      sinceFilter.value = 'all'
      deletedFilter.value = 'all'
      page.value = 1
    }

    const clearAllFilters = () => {
      clearSheetFilters()
      showFilter.value = 'all'
    }

    const applyLinkedFilters = () => {
      if (!window.location.hash.includes('?')) return
      const linked = logFiltersFromHash(window.location.hash)
      statusFilter.value = linked.status
      sinceFilter.value = linked.since
      deletedFilter.value = linked.deleted
      page.value = 1
    }

    const toggleSort = (column) => {
      sortKey.value = headerSortKey({ column, current: sortKey.value })
    }

    watch(sortKey, () => { page.value = 1 })

    const sortDirFor = (column) => (sort.value.column === column ? sort.value.dir : null)

    const canDelete = (r) => r.status === 'done' && !r.deleted_from_tvh_at
    const canRemove = (r) => Boolean(r.deleted_from_tvh_at)
      || UNIMPORTED_STATUSES.includes(r.status)
    const removeTitle = (r) => (r.deleted_from_tvh_at
      ? 'Clear this row from the list. The file stays in your library.'
      : 'Clear this row from the list. While TVHeadend has the recording, the next sync adds it back.')
    const notInTvhTitle = (r) => `TVHeadend deleted its copy ${fmtTime(r.deleted_from_tvh_at)}.`
      + (r.library_state ? '' : ' The episode is still in your library.')
    const canAdScan = (r) => canAdScanRecording({ adRemovalEnabled: adRemovalEnabled.value, recording: r })
    const canImport = (r) => ['not_imported', 'not_in_library'].includes(libraryStatusOf(r)) && !r.deleted_from_tvh_at
    const importLabel = (r) => (r.library_state === 'not_in_library' ? 'Import again' : 'Import')
    const statusLabel = (status) => (status === 'done' ? 'imported' : status.replace(/_/g, ' '))
    const showLabel = (r) => r.show_pattern || (r.show_id == null ? 'One-off' : 'none')
    const imageUrl = (r) => (r.image_path ? `/api/recordings/${encodeURIComponent(r.recording_id)}/image` : null)

    const resumeLabel = (r) => {
      const saved = r.playback_position_s
      if (!r.playable || !saved) return ''
      if (r.duration_s && saved >= r.duration_s - RESUME_END_MARGIN_S) return 'Watched'
      return `Resume at ${fmtPlayTime(saved)}`
    }

    const playTitle = (r) => (resumeLabel(r).startsWith('Resume') ? `Play (${resumeLabel(r).toLowerCase()})` : 'Play')

    const importRecording = async (r) => {
      importingId.value = r.recording_id
      try {
        await api('POST', `/api/recordings/${encodeURIComponent(r.recording_id)}/library`, { choice: 'include' })
        flash({ msg: `Importing "${r.title}".` })
        await refresh()
      } catch (err) {
        flash({ msg: `Import failed: ${err.message}`, kind: 'error' })
      } finally {
        importingId.value = null
      }
    }

    const adLabel = (status) => status.replace(/_/g, ' ')

    const progressPhase = (r) => r.progress?.phase || null

    const isAdProgress = (r) => {
      const phase = progressPhase(r)
      return phase === 'scanning' || phase === 'cutting' || phase === 'verifying'
    }

    const hasBar = (r) => {
      const phase = progressPhase(r)
      return phase === 'importing' || phase === 'scanning'
    }

    const progressCaption = (r) => {
      const p = r.progress
      if (!p) return ''
      if (p.phase === 'importing') {
        const bits = [`${p.percent}%`]
        if (p.etaLabel) bits.push(p.etaLabel)
        if (p.detail) bits.push(p.detail)
        return bits.join(' · ')
      }
      if (p.phase === 'scanning') {
        if (p.percent == null) return p.detail || 'scanning'
        return p.etaLabel ? `${p.percent}% · ~${p.etaLabel} left` : `${p.percent}%`
      }
      return p.detail || p.phase
    }

    const adTooltip = (r) => {
      if (!r.ad_breaks_json) return ''
      try {
        const breaks = JSON.parse(r.ad_breaks_json)
        const secs = breaks.reduce((sum, b) => sum + (b.end - b.start), 0)
        return `${breaks.length} break${breaks.length === 1 ? '' : 's'} · ${formatMinutes(Number((secs / 60).toFixed(1)))} of ads`
      } catch {
        return ''
      }
    }

    const adScan = async (r) => {
      adScanningId.value = r.recording_id
      try {
        await api('POST', `/api/recordings/${encodeURIComponent(r.recording_id)}/ad-scan`)
        flash({ msg: `Ad scan started for "${r.title}". This can take minutes.` })
        await refresh()
      } catch (err) {
        flash({ msg: `Ad scan failed: ${err.message}`, kind: 'error' })
      } finally {
        adScanningId.value = null
      }
    }

    const deleteFromTvh = async (r) => {
      deletingId.value = r.recording_id
      try {
        const url = `/api/recordings/${encodeURIComponent(r.recording_id)}/delete-from-tvh`
        const result = await api('POST', url)
        if (result.ok) {
          flash({ msg: `Removed "${r.title}" from TVHeadend.` })
          await refresh()
        } else {
          flash({ msg: `TVHeadend remove failed: ${result.error} (stage: ${result.stage || '?'})`, kind: 'error' })
        }
      } catch (err) {
        flash({ msg: `TVHeadend remove failed: ${err.message}`, kind: 'error' })
      } finally {
        deletingId.value = null
      }
    }

    const removeRecording = async (r) => {
      removingId.value = r.recording_id
      try {
        await api('DELETE', `/api/recordings/${encodeURIComponent(r.recording_id)}`)
        const undoable = Boolean(r.deleted_from_tvh_at)
        flash({ msg: `Cleared "${r.title}" from the list.` })
        if (undoable) offerUndo([r.recording_id])
        await refresh()
      } catch (err) {
        flash({ msg: `Clear failed: ${err.message}`, kind: 'error' })
      } finally {
        removingId.value = null
      }
    }

    const clearNotInTvh = async () => {
      clearing.value = true
      try {
        const r = await api('DELETE', '/api/recordings?deleted=true')
        flash({ msg: clearedListMessage(r.deleted) })
        offerUndo(r.ids)
        await refresh()
      } catch (err) {
        flash({ msg: `Clear failed: ${err.message}`, kind: 'error' })
      } finally {
        clearing.value = false
      }
    }

    const askAdScan = (r) => askConfirm({
      dialog: adScanConfirm({ recording: r, retentionDays: adRetentionDays.value }),
      icon: 'ad-scan-icon',
      run: () => adScan(r),
    })

    const askRemoveFromTvh = (r) => askConfirm({
      dialog: removeFromTvhConfirm({ recording: r }),
      icon: 'trash-icon',
      run: () => deleteFromTvh(r),
    })

    const askClearRow = (r) => askConfirm({
      dialog: clearRowConfirm({ recording: r, undoSeconds: UNDO_WINDOW_MS / 1000 }),
      icon: 'trash-icon',
      run: () => removeRecording(r),
    })

    const askClearList = () => askConfirm({
      dialog: clearListConfirm({ count: clearable.value, undoSeconds: UNDO_WINDOW_MS / 1000 }),
      run: clearNotInTvh,
    })

    let undoTimer = null
    const offerUndo = (ids) => {
      clearTimeout(undoTimer)
      undoIds.value = ids
      undoTimer = setTimeout(() => (undoIds.value = []), UNDO_WINDOW_MS)
    }

    const undoClear = async () => {
      restoring.value = true
      try {
        const r = await api('POST', '/api/recordings/restore', { ids: undoIds.value })
        offerUndo([])
        flash({ msg: restoredListMessage(r.restored) })
        await refresh()
      } catch (err) {
        flash({ msg: `Undo failed: ${err.message}`, kind: 'error' })
      } finally {
        restoring.value = false
      }
    }

    let pollTimer = null
    const hasActiveProgress = () => recordings.value.some((r) => r.progress)
    const scheduleNextPoll = () => {
      const delay = hasActiveProgress() ? RECORDINGS_ACTIVE_POLL_MS : RECORDINGS_POLL_MS
      pollTimer = setTimeout(pollTick, delay)
    }
    const pollTick = async () => {
      await refresh().catch(() => {})
      scheduleNextPoll()
    }
    onMounted(() => {
      loadShows()
      loadAdRemovalSetting()
      refresh().catch(() => {}).finally(scheduleNextPoll)
    })
    window.addEventListener('hashchange', applyLinkedFilters)
    onUnmounted(() => {
      if (pollTimer) clearTimeout(pollTimer)
      window.removeEventListener('hashchange', applyLinkedFilters)
    })

    watch(
      [page, sortKey, statusFilter, showFilter, sinceFilter, deletedFilter],
      refresh,
    )

    const stopSyncWatch = watch(() => syncStatus.value.activeSyncId, refresh)
    onUnmounted(stopSyncWatch)

    const openIds = ref(new Set())
    const isOpen = (r) => openIds.value.has(r.recording_id)
    const toggleOpen = (r) => {
      const next = new Set(openIds.value)
      if (next.has(r.recording_id)) next.delete(r.recording_id)
      else next.add(r.recording_id)
      openIds.value = next
    }

    const drawerContext = reactive({
      deletingId, removingId, importingId, adScanningId,
      canImport, importLabel, importRecording, canAdScan, isAdScanBlocked, adScanTitle, askAdScan,
      canDelete, askRemoveFromTvh, canRemove, removeTitle, askClearRow,
      statusLabel, libraryStatusOf, libraryStateTitle, notInTvhTitle, showLabel, resumeLabel, playTitle, playRecording,
      adLabel, adTooltip, progressPhase, isAdProgress, hasBar, progressCaption,
    })

    return {
      isOpen, toggleOpen, drawerContext,
      recordings, shows, total, loaded, page, pageSize, totalPages, rangeLabel,
      sortKey, RECORDING_SORTS, statusFilter, showFilter, sinceFilter, deletedFilter,
      statusOptions, sinceOptions, deletedOptions, hasFiltersApplied,
      deletingId, removingId, importingId, clearing, adRemovalEnabled, adScanningId,
      canImport, importLabel, importRecording, statusLabel, libraryStatusOf, libraryStateTitle, showLabel, imageUrl, resumeLabel, playTitle, playRecording,
      refresh, manualRefresh, canDelete,
      canAdScan, isAdScanBlocked, adScanTitle, adLabel, adTooltip, adScan,
      progressPhase, isAdProgress, hasBar, progressCaption,
      deleteFromTvh, removeRecording, canRemove, removeTitle, notInTvhTitle, clearNotInTvh,
      clearable, undoIds, restoring, undoClear,
      confirming, confirmBusy, askAdScan, askRemoveFromTvh, askClearRow, askClearList, closeConfirm, runConfirmed,
      setStatus, setShow, setSince, setDeleted, toggleSort, sortDirFor,
      narrow, chipGroups, activeFilters, clearSheetFilters, clearAllFilters, sentenceCase,
      se: seasonEpisodeLabel, fmtBytes, fmtTime,
    }
  },
}
