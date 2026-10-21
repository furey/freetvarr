import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
} from '/vendor/vue.esm-browser.prod.js'
import { describeSyncFrequency } from '/sync-schedule.js'
import { holdAtLeast } from '/pending.js'
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
  { key: 'imports', label: 'Imports' },
  { key: 'fails', label: 'Fails' },
  { key: 'removals', label: 'Removals' },
  { key: 'empty', label: 'Empty' },
]
const TRIGGER_OPTIONS = [
  { key: 'any', label: 'Any' },
  { key: 'cron', label: 'Schedule' },
  { key: 'manual', label: 'Manual' },
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
    <div class="view-reveal settings-page activity-page">
      <div class="settings-toolbar">
        <button type="button" :class="['ui-button', 'ui-button-primary', { 'is-pending': starting || !!syncStatus.activeSyncId }]" @click="syncNow"
          :disabled="starting || !!syncStatus.activeSyncId" :aria-busy="starting || !!syncStatus.activeSyncId">
          <template v-if="starting || syncStatus.activeSyncId"><span class="spinner" aria-hidden="true"></span> Syncing…</template>
          <template v-else><refresh-icon /> Sync now</template>
        </button>
        <button type="button" class="ui-icon-button" @click="manualRefresh" aria-label="Refresh" title="Refresh"><refresh-icon /></button>
        <button type="button" class="btn btn-danger settings-toolbar-end" @click="askClearAll" :disabled="!total"><trash-icon /> Clear history</button>
      </div>
      <p class="settings-meta-line">
        <template v-if="scheduleFrequency">Syncs run {{ scheduleFrequency }}.</template><template v-else-if="syncStatus.cron">Syncs run on the schedule <code>{{ syncStatus.cron }}</code>.</template>
        <info-button title="Activity" doc="guide/syncs">
          <p>Every sync Freetvarr has run, newest first: when it started, and what it imported, failed, or removed.</p>
          <p>Syncs run on the schedule in <strong>Settings</strong>, or when you press <strong>Sync now</strong>. Only one runs at a time.</p>
          <p><strong>Show</strong> picks which syncs to list: those that imported, failed, or removed something, and empty ones that found nothing new. Empty syncs are hidden at first. <strong>From</strong> picks syncs started on the schedule or by hand.</p>
          <p>Press a sync to see each recording it imported, failed, or removed, and how long each step took. Its details also hold <strong>Delete sync</strong>, which removes that sync from the history.</p>
          <p>The list shows 50 syncs per page. Freetvarr keeps the latest 500 syncs, and only the latest 100 empty ones.</p>
        </info-button>
      </p>

      <div class="settings-filters">
        <div class="settings-filter" role="group" aria-labelledby="activity-show-label">
          <span id="activity-show-label" class="settings-filter-label">Show</span>
          <div class="ui-chip-row is-scroll">
            <button v-for="opt in OUTCOME_OPTIONS" :key="opt.key" type="button" class="ui-chip is-small"
              :aria-pressed="String(outcomes.includes(opt.key))" @click="toggleOutcome(opt.key)">{{ opt.label }}</button>
          </div>
        </div>
        <div class="settings-filter" role="group" aria-labelledby="activity-from-label">
          <span id="activity-from-label" class="settings-filter-label">From</span>
          <div class="ui-chip-row is-scroll">
            <button v-for="opt in TRIGGER_OPTIONS" :key="opt.key" type="button" class="ui-chip is-small"
              :aria-pressed="String(trigger === opt.key)" @click="setTrigger(opt.key)">{{ opt.label }}</button>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-head">
          <h3 class="ui-group-label">Syncs</h3>
          <span v-if="loaded" class="settings-group-count" title="Freetvarr keeps the latest 500 syncs, and only the latest 100 empty ones.">{{ rangeLabel }} of {{ total }}</span>
        </div>
        <div v-if="!loaded" class="ui-group settings-table-card"><list-skeleton :rows="8" /></div>
        <div v-else-if="syncs.length" class="ui-group settings-table-card">
          <table class="deck-table sync-table hidden md:table">
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
                    <td class="ui-tabular whitespace-nowrap">{{ timeOf(s) }}</td>
                    <td><sync-result :sync="s" /></td>
                    <td class="sync-details-cell">
                      <span class="sync-details-line">
                        <summary-line :summary="s.summary" :roles="SYNC_DETAIL_ROLES" />
                        <template v-if="firstSyncError(s)"><span class="text-ink-mute">·</span><span class="sync-details-error truncate">{{ firstSyncError(s) }}</span></template>
                      </span>
                    </td>
                    <td class="ui-tabular whitespace-nowrap text-ink-dim">{{ tookOf(s) }}</td>
                    <td class="sync-chevron-cell"><chevron-right-icon :class="['sync-line-chevron', { open: isOpen(s) }]" /></td>
                  </tr>
                  <tr v-if="isOpen(s)" class="drawer-row">
                    <td colspan="6"><sync-detail class="drawer-card" :sync="s" :deletable="s.id !== syncStatus.activeSyncId" @delete="askRemoveSync(s)" /></td>
                  </tr>
                </template>
              </template>
            </tbody>
          </table>
          <div class="md:hidden list-rows sync-list">
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
        </div>
        <div v-else-if="total === 0" class="ui-group"><p class="settings-empty">{{ emptyText }}</p></div>
        <p v-if="loaded && hiddenEmptyCount" class="settings-note">
          {{ hiddenEmptyCount }} empty sync{{ hiddenEmptyCount === 1 ? '' : 's' }} hidden.
          <button type="button" class="btn-link" @click="toggleOutcome('empty')">Show {{ hiddenEmptyCount === 1 ? 'it' : 'them' }}</button>
        </p>
      </div>
      <div v-if="total > pageSize" class="settings-pager">
        <span class="settings-meta-line">Page {{ page }} of {{ totalPages }} · {{ total }} total</span>
        <div class="settings-pager-buttons">
          <button type="button" class="btn btn-sm" :disabled="page <= 1" @click="page = page - 1"><arrow-left-icon /> Previous</button>
          <button type="button" class="btn btn-sm" :disabled="page >= totalPages" @click="page = page + 1">Next <arrow-right-icon /></button>
        </div>
      </div>
      <confirm-dialog :open="Boolean(confirming)" :dialog="confirming?.dialog" :icon="confirming?.icon"
        :busy="confirmBusy" @confirm="runConfirmed" @cancel="closeConfirm" />
    </div>
  `,
  setup() {
    const { flash, flashUntilSyncDone } = useFlash()
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
        flash({ msg: `Sync #${id} is no longer in the history.`, kind: 'info' })
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
        flash({ msg: `Refresh failed: ${err.message}`, kind: 'error' })
      }
    }

    const syncNow = async () => {
      starting.value = true
      try {
        const r = await holdAtLeast({ task: () => api('POST', '/api/sync') })
        if (r.alreadyRunning) flash({ msg: 'A sync is already running.', kind: 'info' })
        else flashUntilSyncDone({ msg: `Started sync #${r.syncId}.` })
        await loadSyncStatus()
        ensureSyncPolling()
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'error' })
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
        flash({ msg: `Error: ${err.message}`, kind: 'error' })
      }
    }

    const clearAll = async () => {
      try {
        const r = await api('DELETE', '/api/syncs')
        flash({ msg: `Deleted ${r.deleted} sync${r.deleted === 1 ? '' : 's'}.` })
        await refresh()
      } catch (err) {
        flash({ msg: `Error: ${err.message}`, kind: 'error' })
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
    }
  },
}
