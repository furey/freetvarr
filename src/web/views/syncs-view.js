import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
} from '/vendor/vue.esm-browser.prod.js'
import { describeSyncFrequency } from '/sync-schedule.js'
import { clearSyncHistoryConfirm, deleteSyncConfirm } from '/confirm-copy.js'
import { syncDay, syncTime } from '/sync-when.js'
import { firstSyncError, groupSyncsByDay } from '/sync-row.js'
import { useConfirm } from '/components/dialogs.js'
import { api } from '/shared/api.js'
import { useFlash } from '/shared/composables.js'
import { routeSection } from '/shared/router.js'
import { browserStorage } from '/shared/storage.js'
import { syncMsOf, syncTookText } from '/shared/sync-format.js'
import { syncStatus, loadSyncStatus, ensureSyncPolling } from '/shared/sync-status.js'
import { tz, fmtTime, now } from '/shared/time.js'
import { prefersReducedMotion } from '/shared/utils.js'

const SYNCS_POLL_MS = 30_000

const syncDayText = (s) => syncDay({ ms: syncMsOf(s.started_at), nowMs: now.value.getTime(), timeZone: tz.value })

const syncTimeText = (s) => syncTime({
  startedMs: syncMsOf(s.started_at),
  finishedMs: s.status === 'running' ? null : syncMsOf(s.finished_at),
  timeZone: tz.value,
})

const SYNC_DETAIL_ROLES = ['trigger', 'skip', 'plex', 'ads', 'message']

const OUTCOME_OPTIONS = [
  { key: 'imports', label: 'IMPORTS' },
  { key: 'fails', label: 'FAILS' },
  { key: 'removals', label: 'REMOVALS' },
  { key: 'empty', label: 'EMPTY' },
]
const TRIGGER_OPTIONS = [
  { key: 'any', label: 'ANY' },
  { key: 'cron', label: 'SCHEDULE' },
  { key: 'manual', label: 'MANUAL' },
]
const DEFAULT_SYNC_FILTER = { outcomes: ['imports', 'fails', 'removals'], trigger: 'any' }
const SYNC_FILTER_KEY = 'freetvarr.syncFilter'

const loadSyncFilter = () => {
  try {
    const saved = JSON.parse(browserStorage()?.getItem(SYNC_FILTER_KEY) || 'null')
    const outcomes = OUTCOME_OPTIONS.map((o) => o.key).filter((o) => saved?.outcomes?.includes(o))
    const trigger = TRIGGER_OPTIONS.some((o) => o.key === saved?.trigger) ? saved.trigger : DEFAULT_SYNC_FILTER.trigger
    return outcomes.length ? { outcomes, trigger } : DEFAULT_SYNC_FILTER
  } catch {
    return DEFAULT_SYNC_FILTER
  }
}

const saveSyncFilter = (filter) => {
  try {
    browserStorage()?.setItem(SYNC_FILTER_KEY, JSON.stringify(filter))
  } catch {}
}

const LINKED_SYNC_HIGHLIGHT_MS = 1600

export const SyncsView = {
  template: `
    <div class="view-reveal space-y-6">
      <section class="panel">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title" title="Freetvarr keeps the latest 500 syncs, and only the latest 100 empty ones.">SYNCS<template v-if="loaded"> · {{ rangeLabel }} of {{ total }}</template></span>
            <info-button title="SYNCS" doc="guide/syncs">
              <p>Every sync Freetvarr has run, newest first: when it started, and what it imported, failed, or removed.</p>
              <p>Syncs run on the schedule in <strong>SETTINGS</strong>, or when you press <strong>SYNC NOW</strong>. Only one runs at a time.</p>
              <p><strong>SHOW</strong> picks which syncs to list: those that imported, failed, or removed something, and empty ones that found nothing new. Empty syncs are hidden at first. <strong>FROM</strong> picks syncs started on the schedule or by hand.</p>
              <p>Press a sync to see each recording it imported, failed, or removed, and how long each step took. Its details also hold <strong>DELETE SYNC</strong>, which removes that sync from the history.</p>
              <p>The list shows 50 syncs per page. Freetvarr keeps the latest 500 syncs, and only the latest 100 empty ones.</p>
            </info-button>
          </span>
          <div class="flex items-center gap-3">
            <span class="hidden md:inline text-xs text-ink-dim"><template v-if="scheduleFrequency">Syncs run {{ scheduleFrequency }}.</template><template v-else-if="syncStatus.cron">Syncs run on the schedule <code>{{ syncStatus.cron }}</code>.</template></span>
            <span v-if="flashText" :class="['status-readout', flashKind]">{{ flashText }}</span>
          </div>
        </header>
        <div class="panel-body syncs-body space-y-4">
          <p v-if="scheduleFrequency || syncStatus.cron" class="md:hidden text-xs text-ink-dim"><template v-if="scheduleFrequency">Syncs run {{ scheduleFrequency }}.</template><template v-else-if="syncStatus.cron">Syncs run on the schedule <code>{{ syncStatus.cron }}</code>.</template></p>
          <div class="flex flex-wrap gap-3">
            <button type="button" class="btn btn-primary" @click="syncNow" :disabled="starting || !!syncStatus.activeSyncId">
              <template v-if="syncStatus.activeSyncId"><span class="spinner"></span><span><span class="hidden md:inline">SYNC </span>RUNNING…</span></template>
              <template v-else-if="starting">STARTING…</template>
              <template v-else><play-icon /> <span>SYNC<span class="hidden md:inline"> NOW</span></span></template>
            </button>
            <button type="button" class="btn" @click="manualRefresh" aria-label="Refresh" title="Refresh"><refresh-icon /><span class="hidden md:inline">REFRESH</span></button>
            <button type="button" class="btn btn-danger" @click="askClearAll" :disabled="!total" aria-label="Clear history"><trash-icon /> <span><span class="hidden md:inline">CLEAR </span>HISTORY</span></button>
          </div>

          <div class="flex flex-wrap items-center gap-x-6 gap-y-2 md:gap-y-3">
            <div class="flex items-center gap-2 min-w-0" role="group" aria-label="Show">
              <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">SHOW</span>
              <div class="chip-row md:flex-wrap">
                <button v-for="opt in OUTCOME_OPTIONS" :key="opt.key" type="button"
                  :class="['btn', 'btn-sm', outcomes.includes(opt.key) ? 'btn-on' : '']"
                  :aria-pressed="String(outcomes.includes(opt.key))"
                  @click="toggleOutcome(opt.key)">{{ opt.label }}</button>
              </div>
            </div>
            <div class="flex items-center gap-2 min-w-0" role="group" aria-label="Started by">
              <span class="text-xs font-mono uppercase tracking-[0.16em] text-ink-dim">FROM</span>
              <div class="chip-row">
                <button v-for="opt in TRIGGER_OPTIONS" :key="opt.key" type="button"
                  :class="['btn', 'btn-sm', trigger === opt.key ? 'btn-on' : '']"
                  :aria-pressed="String(trigger === opt.key)"
                  @click="setTrigger(opt.key)">{{ opt.label }}</button>
              </div>
            </div>
          </div>

          <list-skeleton v-if="!loaded" :rows="8" />
          <table v-else-if="syncs.length" class="deck-table sync-table hidden md:table">
            <thead><tr>
              <th class="sync-status-cell"><span class="sr-only">Status</span></th><th>Time</th><th>Result</th><th>Details</th><th>Took</th><th class="sync-chevron-cell"><span class="sr-only">Open</span></th>
            </tr></thead>
            <tbody>
              <template v-for="group in dayGroups" :key="group.day">
                <tr class="sync-day-row"><th colspan="6" scope="colgroup">{{ group.day }}</th></tr>
                <template v-for="s in group.syncs" :key="s.id">
                  <tr :class="['sync-row', { active: s.id === syncStatus.activeSyncId, open: isOpen(s), linked: highlightId === s.id }]" :data-sync-id="s.id"
                    tabindex="0" :aria-expanded="String(isOpen(s))" :aria-label="'Sync #' + s.id + ': show details'"
                    @click="toggleOpen(s)" @keydown.enter.prevent="toggleOpen(s)" @keydown.space.prevent="toggleOpen(s)">
                    <td class="sync-status-cell"><sync-status-icon :status="s.status" /></td>
                    <td class="font-mono whitespace-nowrap">{{ timeOf(s) }}</td>
                    <td><sync-result :sync="s" /></td>
                    <td class="sync-details-cell">
                      <span class="sync-details-line">
                        <summary-line :summary="s.summary" :roles="SYNC_DETAIL_ROLES" />
                        <template v-if="firstSyncError(s)"><span class="text-ink-mute">·</span><span class="sync-details-error truncate">{{ firstSyncError(s) }}</span></template>
                      </span>
                    </td>
                    <td class="font-mono whitespace-nowrap text-ink-dim">{{ tookOf(s) }}</td>
                    <td class="sync-chevron-cell"><chevron-right-icon :class="['sync-line-chevron', { open: isOpen(s) }]" /></td>
                  </tr>
                  <tr v-if="isOpen(s)" class="drawer-row">
                    <td colspan="6"><sync-detail class="drawer-card" :sync="s" :deletable="s.id !== syncStatus.activeSyncId" @delete="askRemoveSync(s)" /></td>
                  </tr>
                </template>
              </template>
            </tbody>
          </table>
          <div v-if="loaded && syncs.length" class="md:hidden list-rows sync-list">
            <template v-for="group in dayGroups" :key="group.day">
              <p class="sync-day">{{ group.day }}</p>
              <article v-for="s in group.syncs" :key="s.id"
                :class="['list-row', 'sync-card', { active: s.id === syncStatus.activeSyncId, open: isOpen(s), linked: highlightId === s.id }]" :data-sync-id="s.id"
                tabindex="0" :aria-expanded="String(isOpen(s))" :aria-label="'Sync #' + s.id + ': show details'"
                @click="toggleOpen(s)" @keydown.enter.self.prevent="toggleOpen(s)" @keydown.space.self.prevent="toggleOpen(s)">
                <div class="sync-line sync-line-took">
                  <sync-status-icon :status="s.status" />
                  <span class="sync-line-time truncate">{{ timeOf(s) }}</span>
                  <sync-result :sync="s" />
                  <span class="sync-line-took-text">{{ tookOf(s) }}</span>
                  <chevron-right-icon :class="['sync-line-chevron', { open: isOpen(s) }]" />
                  <span v-if="firstSyncError(s)" class="sync-line-error truncate">{{ firstSyncError(s) }}</span>
                </div>
                <sync-detail v-if="isOpen(s)" class="drawer-card" :sync="s" :deletable="s.id !== syncStatus.activeSyncId" @delete="askRemoveSync(s)" @click.stop />
              </article>
            </template>
          </div>
          <p v-else-if="loaded && total === 0" class="text-ink-dim text-sm">{{ emptyText }}</p>
          <p v-if="loaded && hiddenEmptyCount" class="text-xs text-ink-dim">
            {{ hiddenEmptyCount }} empty sync{{ hiddenEmptyCount === 1 ? '' : 's' }} hidden.
            <button type="button" class="btn-link" @click="toggleOutcome('empty')">Show {{ hiddenEmptyCount === 1 ? 'it' : 'them' }}</button>
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
    const { flashText, flashKind, flash, flashUntilSyncDone } = useFlash()
    const syncs = ref([])
    const starting = ref(false)
    const outcomes = ref(loadSyncFilter().outcomes)
    const trigger = ref(loadSyncFilter().trigger)
    const total = ref(0)
    const emptyCount = ref(0)
    const loaded = ref(false)
    const page = ref(1)
    const pageSize = ref(50)
    const openIds = ref(new Set())
    const scheduleFrequency = computed(() => describeSyncFrequency(syncStatus.value.cron))

    const hiddenEmptyCount = computed(() => (outcomes.value.includes('empty') ? 0 : emptyCount.value))

    const emptyText = computed(() => {
      const isEverything = outcomes.value.length === OUTCOME_OPTIONS.length && trigger.value === 'any'
      return isEverything ? 'No syncs yet.' : 'No syncs match the current filter.'
    })

    const toggleOutcome = (key) => {
      const picked = outcomes.value.includes(key)
        ? outcomes.value.filter((o) => o !== key)
        : [...outcomes.value, key]
      if (!picked.length) return
      outcomes.value = OUTCOME_OPTIONS.map((o) => o.key).filter((o) => picked.includes(o))
      page.value = 1
      saveSyncFilter({ outcomes: outcomes.value, trigger: trigger.value })
    }

    const setTrigger = (key) => {
      trigger.value = key
      page.value = 1
      saveSyncFilter({ outcomes: outcomes.value, trigger: trigger.value })
    }

    const isOpen = (s) => openIds.value.has(s.id)

    const toggleOpen = (s) => {
      const next = new Set(openIds.value)
      if (next.has(s.id)) next.delete(s.id)
      else next.add(s.id)
      openIds.value = next
      if (!next.has(s.id) && s.id === linkedSyncId.value) clearLinkedSync()
    }

    const timeOf = syncTimeText
    const tookOf = syncTookText
    const dayGroups = computed(() => groupSyncsByDay({ syncs: syncs.value, dayOf: syncDayText }))
    const linkedSyncId = computed(() => Number(routeSection.value) || null)
    const highlightId = ref(null)

    const clearLinkedSync = () => {
      if (!linkedSyncId.value) return
      history.replaceState(null, '', '#/settings/system/activity')
      routeSection.value = ''
    }

    const visibleElementFor = (id) => [...document.querySelectorAll(`[data-sync-id="${id}"]`)]
      .find((el) => el.offsetParent !== null)

    const focusLinkedSync = async () => {
      const id = linkedSyncId.value
      if (!id) return
      if (!syncs.value.some((s) => s.id === id)) {
        outcomes.value = DEFAULT_SYNC_FILTER.outcomes
        trigger.value = DEFAULT_SYNC_FILTER.trigger
        page.value = 1
        await refresh()
      }
      if (!syncs.value.some((s) => s.id === id)) {
        flash({ msg: `Sync #${id} is no longer in the history.`, kind: 'info', ms: 5000 })
        clearLinkedSync()
        return
      }
      openIds.value = new Set([...openIds.value, id])
      highlightId.value = id
      await nextTick()
      visibleElementFor(id)?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      setTimeout(() => { highlightId.value = null }, LINKED_SYNC_HIGHLIGHT_MS)
    }

    const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

    const rangeLabel = computed(() => {
      if (total.value === 0) return '0'
      const start = (page.value - 1) * pageSize.value + 1
      const end = Math.min(total.value, page.value * pageSize.value)
      return `${start}–${end}`
    })

    const refresh = async () => {
      const params = new URLSearchParams({
        page: String(page.value),
        pageSize: String(pageSize.value),
      })
      params.set('show', outcomes.value.join(','))
      if (trigger.value !== 'any') params.set('trigger', trigger.value)
      const r = await api('GET', `/api/syncs?${params}`)
      syncs.value = r.syncs
      total.value = r.total
      emptyCount.value = r.emptyCount || 0
      loaded.value = true
      if (page.value > 1 && r.syncs.length === 0) page.value = 1
    }

    const manualRefresh = async () => {
      try {
        await refresh()
        flash({ msg: `Refreshed ${total.value} sync${total.value === 1 ? '' : 's'}.` })
      } catch (err) {
        flash({ msg: `Refresh failed: ${err.message}`, kind: 'err', ms: 6000 })
      }
    }

    const syncNow = async () => {
      starting.value = true
      try {
        const r = await api('POST', '/api/sync')
        if (r.alreadyRunning) flash({ msg: 'A sync is already running.', kind: 'info' })
        else flashUntilSyncDone({ msg: `Started sync #${r.syncId}.` })
        await loadSyncStatus()
        ensureSyncPolling()
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      } finally {
        starting.value = false
      }
    }

    const { confirming, confirmBusy, askConfirm, closeConfirm, runConfirmed } = useConfirm()

    const askRemoveSync = (s) => askConfirm({
      dialog: deleteSyncConfirm({ syncId: s.id }),
      icon: 'trash-icon',
      run: () => removeSync(s),
    })

    const askClearAll = () => askConfirm({
      dialog: clearSyncHistoryConfirm({ syncRunning: Boolean(syncStatus.value.activeSyncId) }),
      run: clearAll,
    })

    const removeSync = async (s) => {
      try {
        await api('DELETE', `/api/syncs/${s.id}`)
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      }
    }

    const clearAll = async () => {
      try {
        const r = await api('DELETE', '/api/syncs')
        flash({ msg: `Deleted ${r.deleted} sync${r.deleted === 1 ? '' : 's'}.` })
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'err', ms: 5000 })
      }
    }

    let pollTimer = null
    onMounted(() => {
      refresh().then(focusLinkedSync)
      pollTimer = setInterval(refresh, SYNCS_POLL_MS)
    })
    watch(linkedSyncId, (id) => { if (id) focusLinkedSync() })
    onUnmounted(() => {
      if (pollTimer) clearInterval(pollTimer)
    })
    watch([page, outcomes, trigger], refresh)
    const stopWatch = watch(() => syncStatus.value.activeSyncId, refresh)
    onUnmounted(stopWatch)

    return {
      syncs, syncStatus, scheduleFrequency, starting,
      outcomes, trigger, toggleOutcome, setTrigger, OUTCOME_OPTIONS, TRIGGER_OPTIONS,
      emptyText, hiddenEmptyCount, isOpen, toggleOpen, timeOf, tookOf, dayGroups, highlightId,
      firstSyncError, SYNC_DETAIL_ROLES,
      total, loaded, page, pageSize, totalPages, rangeLabel,
      syncNow, refresh, manualRefresh, askRemoveSync, askClearAll,
      confirming, confirmBusy, closeConfirm, runConfirmed,
      fmtTime,
      flashText, flashKind,
    }
  },
}
