import { ref, computed, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { plexWatchStatusText } from '/plex-watch-text.js'
import { createSettingBaseline } from '/setting-baseline.js'
import { api } from '/shared/api.js'
import { now, tz } from '/shared/time.js'

export const PlexWatchSetting = {
  template: `
    <div class="settings-group" data-setting="plex-watched">
      <h3 class="ui-group-label">Watched state</h3>
      <div class="ui-group">
        <div class="settings-row" data-setting="plex-watched-from">
          <toggle-switch v-model="fromPlex" :pending="!loaded" class="settings-toggle">
            <span class="settings-toggle-text">
              <span class="settings-row-title">From Plex</span>
              <span class="settings-row-meta">What you watch in Plex, or in Infuse through Plex, shows as watched here, with its resume point.</span>
            </span>
          </toggle-switch>
        </div>
        <div class="settings-row" data-setting="plex-watched-to">
          <toggle-switch v-model="toPlex" :pending="!loaded" class="settings-toggle">
            <span class="settings-toggle-text">
              <span class="settings-row-title">Back to Plex</span>
              <span class="settings-row-meta">What you watch or mark here shows as watched in Plex.</span>
            </span>
          </toggle-switch>
        </div>
        <div class="settings-row settings-row-actions">
          <button type="button" class="ui-button ui-button-sm" @click="syncNow" :disabled="syncing || !status?.configured">
            <template v-if="syncing">Syncing…</template><template v-else><refresh-icon /> Sync watched now</template>
          </button>
          <span v-if="readout.text" :class="['status-readout', readout.kind]" role="status"><meta-line :text="readout.text" /></span>
        </div>
      </div>
      <p class="settings-hint">It uses the Plex account that owns the token. Other Plex Home users keep their own watched state. It runs after each sync and when you open Recordings.</p>
    </div>
  `,
  setup(_, { expose }) {
    const fromPlex = ref(true)
    const toPlex = ref(true)
    const loaded = ref(false)
    const status = ref(null)
    const syncing = ref(false)
    const runError = ref('')
    const fromBaseline = createSettingBaseline()
    const toBaseline = createSettingBaseline()

    const readout = computed(() => {
      if (runError.value) return { text: runError.value, kind: 'err' }
      return plexWatchStatusText({ status: status.value, nowMs: now.value.getTime(), timeZone: tz.value })
    })

    const useStatus = (next) => {
      status.value = next
      fromPlex.value = next.fromPlex
      toPlex.value = next.toPlex
      fromBaseline.remember(next.fromPlex)
      toBaseline.remember(next.toPlex)
      loaded.value = true
    }

    const load = async () => {
      const next = await api('GET', '/api/plex/watch-sync').catch(() => null)
      if (next) useStatus(next)
    }

    const save = async () => {
      const body = {}
      if (fromBaseline.isChanged(fromPlex.value)) body.from_plex = fromPlex.value
      if (toBaseline.isChanged(toPlex.value)) body.to_plex = toPlex.value
      if (!Object.keys(body).length) return
      useStatus(await api('PUT', '/api/plex/watch-sync', body))
    }

    const syncNow = async () => {
      syncing.value = true
      runError.value = ''
      try {
        await save()
        useStatus(await api('POST', '/api/plex/watch-sync/run', {}))
      } catch (err) {
        runError.value = `Sync failed: ${err.message}`
        await load()
      } finally {
        syncing.value = false
      }
    }

    onMounted(load)
    expose({ save, load })
    return { fromPlex, toPlex, loaded, status, syncing, readout, syncNow }
  },
}
