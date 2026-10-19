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
import { adScanTitle, canAdScan as canAdScanRecording, isAdScanBlocked } from '/ad-scan.js'
import { useConfirm } from '/components/dialogs.js'
import { api, fetchSettings } from '/shared/api.js'
import { useMediaQuery, useFlash, FLASH_DEFAULT_MS } from '/shared/composables.js'
import { EPG_NARROW_QUERY } from '/shared/constants.js'
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
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">RECORDINGS<template v-if="loaded"> · {{ rangeLabel }} of {{ total }}</template></span>
            <info-button title="RECORDINGS" doc="guide/recordings">
              <p>Every recording TVHeadend has finished, and what Freetvarr did with it: <strong>IMPORTED</strong>, <strong>PARTIAL</strong>, <strong>SKIPPED</strong>, <strong>FAILED</strong>, or <strong>NOT IMPORTED</strong>. The next sync tries a <strong>PARTIAL</strong> import again.</p>
              <p><strong>REPLACED</strong> means another app, such as Sonarr, put a different file for the episode in place of Freetvarr's. <strong>NOT IN LIBRARY</strong> means the file is gone; press <strong>IMPORT AGAIN</strong> to import the TVHeadend copy again.</p>
              <p>Series episodes go into their series folder. A single recording goes to the one-off folder, and a film to the movies folder. Press <strong>IMPORT</strong> on a <strong>NOT IMPORTED</strong> recording to add it to the library.</p>
              <p><strong>NOT IN TVHEADEND</strong> means TVHeadend has deleted its copy. The episode is still in your library, so you can play it, scan it for ads, or cut it again.</p>
              <p>A copy, an ad scan, or a cut shows a progress bar while it runs.</p>
              <p><strong>SORT</strong> orders the list by air date, title, series, import time, or size. The browser remembers your choice.</p>
              <p>Press a row to see the recording's details: its channel, length, size, file, ads, and the full error if it has one. The buttons there play, import, scan for ads, or remove it.</p>
            </info-button>
          </span>
          <div class="header-actions flex flex-wrap items-center justify-end gap-3">
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
            <header-button v-if="undoIds.length" label="Undo" @click="undoClear" :disabled="restoring"
              title="Puts the cleared rows back in this list."><arrow-left-icon /></header-button>
            <header-button :label="clearing ? 'Clearing…' : 'Clear from list'" @click="askClearList"
              :disabled="clearing || clearable === 0"
              title="Removes rows for recordings no longer in TVHeadend from this list. Files stay in your library."><cross-icon /></header-button>
            <header-button label="Refresh" @click="manualRefresh"><refresh-icon /></header-button>
          </div>
        </header>
        <div class="panel-body space-y-4">
          <template v-if="narrow">
            <div class="view-controls view-controls-sticky" style="flex-wrap: wrap;">
              <select :value="showFilter" @change="setShow($event.target.value)" class="field-input" style="flex-basis: 100%;" aria-label="Show">
                <option value="all">Any show</option>
                <option v-for="s in shows" :key="s.id" :value="s.id">{{ s.show_pattern }}</option>
              </select>
              <select v-model="sortKey" class="field-input" aria-label="Sort recordings">
                <option v-for="o in RECORDING_SORTS" :key="o.key" :value="o.key">{{ o.label }}</option>
              </select>
              <filter-sheet title="FILTER RECORDINGS" :count="activeFilters.length" @clear="clearSheetFilters">
                <div v-for="g in chipGroups" :key="g.key" class="filter-group" role="group" :aria-label="g.label">
                  <span class="field-label">{{ g.label }}</span>
                  <div class="filter-chips">
                    <button v-for="opt in g.options" :key="opt.key" type="button"
                      :class="['btn', 'btn-sm', g.value === opt.key ? 'btn-on' : '']" :aria-pressed="String(g.value === opt.key)"
                      @click="g.set(opt.key)">{{ opt.label }}</button>
                  </div>
                </div>
              </filter-sheet>
            </div>
            <div v-if="activeFilters.length" class="active-filters">
              <button v-for="f in activeFilters" :key="f.key" type="button" class="btn btn-sm btn-on"
                :aria-label="'Remove filter: ' + f.label" @click="f.clear">{{ f.label }} <cross-icon /></button>
            </div>
          </template>
          <div v-else class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
            <template v-for="g in chipGroups" :key="g.key">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">{{ g.label }}</span>
                <div class="chip-row md:flex-wrap">
                  <button v-for="opt in g.options" :key="opt.key" type="button"
                    :class="['btn', 'btn-sm', g.value === opt.key ? 'btn-on' : '']" :aria-pressed="String(g.value === opt.key)"
                    @click="g.set(opt.key)">{{ opt.label }}</button>
                </div>
              </div>
              <div v-if="g.key === 'status'" class="flex items-center gap-2">
                <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">SHOW</span>
                <select :value="showFilter" @change="setShow($event.target.value)" aria-label="Show"
                  class="field-input" style="width: auto; min-width: 9rem; padding-top: 0.3rem; padding-bottom: 0.3rem;">
                  <option value="all">Any</option>
                  <option v-for="s in shows" :key="s.id" :value="s.id">{{ s.show_pattern }}</option>
                </select>
              </div>
              <div v-if="g.key === 'status'" class="flex items-center gap-2">
                <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">SORT</span>
                <select v-model="sortKey" aria-label="Sort recordings"
                  class="field-input" style="width: auto; min-width: 9rem; padding-top: 0.3rem; padding-bottom: 0.3rem;">
                  <option v-for="o in RECORDING_SORTS" :key="o.key" :value="o.key">{{ o.label }}</option>
                </select>
              </div>
            </template>
          </div>
          <list-skeleton v-if="!loaded" :rows="8" />
          <table v-else-if="recordings.length" class="deck-table recordings-table hidden lg:table">
            <thead><tr>
              <th class="sortable" @click="toggleSort('title')">Recording<sort-arrow :dir="sortDirFor('title')" /></th>
              <th class="sortable" @click="toggleSort('show_pattern')">Show<sort-arrow :dir="sortDirFor('show_pattern')" /></th>
              <th>Status</th>
              <th class="sortable" @click="toggleSort('aired_at')">Aired<sort-arrow :dir="sortDirFor('aired_at')" /></th>
              <th></th>
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
                        <span class="font-mono">{{ r.title }}</span>
                        <span v-if="r.episode_title" class="recording-cell-episode">{{ r.episode_title }}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="recording-cell-text">
                      <span class="font-mono">{{ showLabel(r) }}</span>
                      <span v-if="se(r)" class="recording-cell-channel">{{ se(r) }}</span>
                    </div>
                  </td>
                  <td class="recording-status-cell">
                    <recording-status :recording="r" :ctx="drawerContext" />
                  </td>
                  <td class="font-mono whitespace-nowrap text-ink-dim">{{ r.aired_at ? fmtTime(r.aired_at) : '' }}</td>
                  <td>
                    <div class="rec-actions flex items-center justify-end">
                      <button v-if="r.playable" type="button" class="btn btn-sm btn-icon btn-watch recording-play"
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
          <div v-if="loaded && recordings.length" class="lg:hidden list-rows">
            <article v-for="r in recordings" :key="r.recording_id"
              :class="['list-row', 'toggle-card', 'space-y-2', { 'not-in-tvh': r.deleted_from_tvh_at, open: isOpen(r) }]"
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
                <button v-if="r.playable" type="button" class="btn btn-sm btn-icon btn-watch recording-play"
                  @click.stop="playRecording(r)" @keydown.stop :title="playTitle(r)" :aria-label="playTitle(r)">
                  <play-icon />
                </button>
              </div>
              <recording-drawer v-if="isOpen(r)" class="drawer-card" :recording="r" :ctx="drawerContext" @click.stop @keydown.stop />
            </article>
          </div>
          <p v-else-if="loaded && total === 0 && hasFiltersApplied" class="text-ink-dim text-sm pt-3">No recordings match the current filters.</p>
          <p v-else-if="loaded && total === 0" class="text-ink-dim text-sm pt-3">
            No recordings yet. To make a recording, open the <a href="#/guide">TV Guide</a>, pick a programme, and press <strong>RECORD</strong> or <strong>SERIES</strong>. Recordings show here once TVHeadend starts them.
          </p>
          <div v-if="total > pageSize" class="flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-ink-dim pt-1">
            <span>Page {{ page }} of {{ totalPages }} · {{ total }} total</span>
            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-sm" :disabled="page <= 1" @click="page = page - 1"><arrow-left-icon /> PREV</button>
              <button type="button" class="btn btn-sm" :disabled="page >= totalPages" @click="page = page + 1">NEXT <arrow-right-icon /></button>
            </div>
          </div>
        </div>
      </section>
      <confirm-dialog :open="Boolean(confirming)" :dialog="confirming?.dialog" :icon="confirming?.icon"
        :busy="confirmBusy" @confirm="runConfirmed" @cancel="closeConfirm" />
    </div>
  `,
  setup() {
    const { flashText, flashKind, flash } = useFlash()
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
    const statusFilter = ref('all')
    const showFilter = ref('all')
    const sinceFilter = ref('all')
    const deletedFilter = ref('all')
    const clearable = ref(0)
    const undoIds = ref([])
    const restoring = ref(false)

    const statusOptions = ['all', 'done', 'not_imported', 'replaced', 'not_in_library', 'partial', 'failed', 'skipped', 'importing']
    const sinceOptions = [
      { key: 'all', label: 'ALL' },
      { key: '1h',  label: '1H'  },
      { key: '24h', label: '24H' },
      { key: '7d',  label: '7D'  },
      { key: '30d', label: '30D' },
      { key: '90d', label: '90D' },
    ]
    const deletedOptions = [
      { key: 'all',     label: 'ALL'              },
      { key: 'on_tvh',  label: 'IN TVHEADEND'     },
      { key: 'deleted', label: 'NOT IN TVHEADEND' },
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
        flash({ msg: `Refresh failed: ${err.message}`, kind: 'err', ms: 6000 })
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

    const narrow = useMediaQuery(EPG_NARROW_QUERY)

    const chipGroups = computed(() => [
      {
        key: 'status',
        label: 'STATUS',
        value: statusFilter.value,
        set: setStatus,
        options: statusOptions.map((opt) => ({ key: opt, label: statusLabel(opt).toUpperCase() })),
      },
      { key: 'since', label: 'WHEN', value: sinceFilter.value, set: setSince, options: sinceOptions },
      { key: 'deleted', label: 'TVHEADEND', value: deletedFilter.value, set: setDeleted, options: deletedOptions },
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
    const importLabel = (r) => (r.library_state === 'not_in_library' ? 'IMPORT AGAIN' : 'IMPORT')
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
        flash({ msg: `Import failed: ${err.message}`, kind: 'err', ms: 6000 })
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
        flash({ msg: `Ad scan failed: ${err.message}`, kind: 'err', ms: 6000 })
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
          flash({
            msg: `TVHeadend remove failed: ${result.error} (stage: ${result.stage || '?'})`,
            kind: 'err',
            ms: 8000,
          })
        }
      } catch (err) {
        flash({ msg: `TVHeadend remove failed: ${err.message}`, kind: 'err', ms: 8000 })
      } finally {
        deletingId.value = null
      }
    }

    const removeRecording = async (r) => {
      removingId.value = r.recording_id
      try {
        await api('DELETE', `/api/recordings/${encodeURIComponent(r.recording_id)}`)
        const undoable = Boolean(r.deleted_from_tvh_at)
        flash({ msg: `Cleared "${r.title}" from the list.`, ms: undoable ? UNDO_WINDOW_MS : FLASH_DEFAULT_MS })
        if (undoable) offerUndo([r.recording_id])
        await refresh()
      } catch (err) {
        flash({ msg: `Clear failed: ${err.message}`, kind: 'err', ms: 6000 })
      } finally {
        removingId.value = null
      }
    }

    const clearNotInTvh = async () => {
      clearing.value = true
      try {
        const r = await api('DELETE', '/api/recordings?deleted=true')
        flash({ msg: clearedListMessage(r.deleted), ms: UNDO_WINDOW_MS })
        offerUndo(r.ids)
        await refresh()
      } catch (err) {
        flash({ msg: `Clear failed: ${err.message}`, kind: 'err', ms: 6000 })
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
        flash({ msg: `Undo failed: ${err.message}`, kind: 'err', ms: 6000 })
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
    onUnmounted(() => {
      if (pollTimer) clearTimeout(pollTimer)
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
      narrow, chipGroups, activeFilters, clearSheetFilters,
      se: seasonEpisodeLabel, fmtBytes, fmtTime,
      flashText, flashKind,
    }
  },
}
