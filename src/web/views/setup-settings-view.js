import { ref, computed, onMounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { setupSettingsRows, setupDrawerOf } from '/setup-steps.js'
import { failedCheck, storageCheckOutcome, folderRows } from '/setup-folders.js'
import { holdAtLeast } from '/pending.js'
import { api, fetchSettings } from '/shared/api.js'
import { routeParams } from '/shared/router.js'
import { SetupStatusIcon } from '/views/welcome-shared.js'

export const SetupSettingsView = {
  components: { SetupStatusIcon },
  template: `
    <div class="setup-settings">
      <div class="ui-group">
        <template v-for="row in rows" :key="row.key">
          <button type="button" :class="['ui-group-row', 'setup-settings-row', { 'is-open': open === row.key }]"
            :aria-expanded="String(open === row.key)" :aria-controls="'setup-drawer-' + row.key" @click="toggle(row.key)">
            <span :class="['ui-dot', row.tone ? 'is-' + row.tone : 'is-none']" aria-hidden="true"></span>
            <span class="ui-group-row-main">
              <span class="ui-group-row-title">{{ row.title }}</span>
              <span class="ui-group-row-meta">{{ row.meta }}</span>
            </span>
            <span v-if="row.value" :class="['ui-group-row-value', { 'setup-mono': row.mono }]">{{ row.value }}</span>
          </button>
          <div v-if="open === row.key" :id="'setup-drawer-' + row.key" class="setup-drawer" @keydown.esc="open = ''">
            <template v-if="row.key === 'tvheadend'">
              <p class="setup-hint">The address, the login Freetvarr uses, and open access are on the TVHeadend page.</p>
              <div class="setup-drawer-actions">
                <a class="ui-button ui-button-secondary" href="#/settings/system/tvheadend">Open TVHeadend settings</a>
              </div>
            </template>
            <channel-setup-step v-else-if="row.key === 'channels'" :tvh-url="settings.tvh_url || ''" start-editing @state="noteChannels" />
            <guide-setup-step v-else-if="row.key === 'guide'" :tvh-url="settings.tvh_url || ''" start-editing @state="noteGuide" />
            <template v-else-if="row.key === 'folders'">
              <div v-if="folderList.length" class="ui-group setup-drawer-group">
                <div v-for="folder in folderList" :key="folder.key" class="ui-group-row">
                  <setup-status-icon :status="folder.ok ? 'done' : 'failed'" />
                  <span class="ui-group-row-main"><span class="ui-group-row-title">{{ folder.title }}</span><span class="ui-group-row-meta setup-mono">{{ folder.path }}</span></span>
                  <span class="ui-group-row-value">{{ folder.value }}</span>
                </div>
              </div>
              <template v-for="p in folders?.problems || []" :key="p.text">
                <p class="setup-hint is-error">{{ p.text }}</p>
                <p class="setup-hint">{{ p.fix }}</p>
              </template>
              <p v-for="note in folders?.notes || []" :key="note" class="setup-hint">{{ note }}</p>
              <div class="setup-drawer-actions">
                <a class="ui-button ui-button-secondary" href="#/settings/storage">Change folders</a>
                <button type="button" class="ui-button ui-button-primary" :disabled="checkingFolders" @click="checkFolders">{{ checkingFolders ? 'Checking…' : 'Check again' }}</button>
              </div>
            </template>
            <template v-else-if="row.key === 'plex'">
              <p class="setup-hint">The Plex address, token, and libraries are on the Library and Plex page.</p>
              <div class="setup-drawer-actions">
                <a class="ui-button ui-button-secondary" href="#/settings/plex">Open Library and Plex settings</a>
              </div>
            </template>
            <template v-else-if="row.key === 'time-zone'">
              <p class="setup-hint">Change the time zone on the Schedule page.</p>
              <div class="setup-drawer-actions">
                <a class="ui-button ui-button-secondary" href="#/settings/schedule">Open Schedule settings</a>
              </div>
            </template>
          </div>
        </template>
      </div>
      <button type="button" class="setup-quiet-link" :disabled="restarting" @click="runFromStart">Run the whole setup from the start</button>
    </div>
  `,
  setup() {
    const settings = ref({})
    const channelStatus = ref(null)
    const guideStatus = ref(null)
    const folders = ref(null)
    const folderList = ref([])
    const checkingFolders = ref(false)
    const restarting = ref(false)
    const open = ref(setupDrawerOf(routeParams.value))

    const rows = computed(() => setupSettingsRows({
      settings: settings.value,
      channelStatus: channelStatus.value,
      guideStatus: guideStatus.value,
      folders: folders.value,
    }))

    const toggle = (key) => {
      open.value = open.value === key ? '' : key
      const hash = `#/settings/system/setup${open.value ? `/${open.value}` : ''}`
      history.replaceState(history.state, '', hash)
    }

    const loadChannels = async () => {
      channelStatus.value = await api('GET', '/api/tvh-setup/status').catch(() => ({ channels: 0 }))
    }

    const loadGuide = async () => {
      guideStatus.value = await api('GET', '/api/tvh-guide/status').catch(() => ({ suggestion: null }))
    }

    const checkFolders = async () => {
      checkingFolders.value = true
      const paths = {
        mediaRoot: settings.value.media_root || '',
        recordingsRoot: settings.value.recordings_root || '',
        tvhRecordingsPath: settings.value.tvh_recordings_path || '',
      }
      const [library, recordings, tvh] = await holdAtLeast({
        task: () => Promise.all([
          api('POST', '/api/media-root-test', { path: paths.mediaRoot }).catch(failedCheck),
          api('POST', '/api/recordings-root-test', { path: paths.recordingsRoot, media_root: paths.mediaRoot }).catch(failedCheck),
          api('POST', '/api/tvh-recordings-path-check', { path: paths.tvhRecordingsPath }).catch(failedCheck),
        ]),
      })
      folders.value = storageCheckOutcome({ folders: paths, library, recordings, tvh })
      folderList.value = folderRows({ folders: paths, library, recordings, tvh })
      checkingFolders.value = false
    }

    const noteChannels = (state) => {
      if (channelStatus.value && state.channels !== channelStatus.value.channels) loadChannels()
    }

    const noteGuide = (state) => {
      if (guideStatus.value?.suggestion && !state.busy && state.linked !== guideStatus.value.suggestion.linked) loadGuide()
    }

    const runFromStart = async () => {
      restarting.value = true
      try {
        await holdAtLeast({ task: () => api('POST', '/api/settings', { welcome_dismissed: false }) })
      } catch { /* setup still opens */ }
      window.location.hash = '#/welcome'
    }

    watch(routeParams, (params) => {
      const drawer = setupDrawerOf(params)
      if (drawer) open.value = drawer
    })

    onMounted(async () => {
      settings.value = await fetchSettings().catch(() => ({}))
      await Promise.all([loadChannels(), loadGuide(), checkFolders()])
    })

    return {
      settings, rows, open, toggle, folders, folderList, checkingFolders, checkFolders,
      noteChannels, noteGuide, restarting, runFromStart,
    }
  },
}
