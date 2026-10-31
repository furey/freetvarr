import { ref, computed, onMounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { tvAppsAddresses, tvAppsHost } from '/tv-apps.js'
import { holdAtLeast } from '/pending.js'
import { api } from '/shared/api.js'
import { makeStatus } from '/shared/path-check.js'
import { toast } from '/shared/toast.js'
import { useConfirm } from '/components/dialogs.js'
import { deleteTvLoginConfirm } from '/confirm-copy.js'

export const TvAppsPanel = {
  props: {
    tvhUrl: { type: String, default: '' },
    showInfo: { type: Boolean, default: false },
  },
  template: `
    <section id="section-tv-apps" class="settings-section">
      <p class="settings-intro">Watch live TV on your TV in Jellyfin or Kodi. Freetvarr sets up the connection to TVHeadend; the app then plays straight from TVHeadend.</p>
      <teleport v-if="showInfo" defer to="#settings-page-info">
        <info-button title="Watch on TV" doc="guide/tv-apps" piece="player">
          <p>This setting is so you can use Jellyfin or Kodi instead of your tuner's own app (e.g. the HDHomeRun app).</p>
          <p v-if="!login.authCode"><strong>Make a TV login</strong> makes a login in TVHeadend that can only watch TV. Freetvarr then shows the details to copy into the app.</p>
          <p v-else>Your TV login is a login in TVHeadend that can only watch TV. Copy its details into the app.</p>
          <p>Once set up, the app plays straight from TVHeadend, so your live TV keeps working, even if Freetvarr was stopped for whatever reason. The app also gets TVHeadend's TV guide listings from TVHeadend.</p>
          <p>Your recordings appear separately, in Plex or Infuse.</p>
          <p>A Freetvarr app for Apple TV and Android TV is planned. Stay tuned!</p>
          <p>The setup guide has the steps for each app.</p>
        </info-button>
      </teleport>
      <p class="ui-banner">This setting is so you can use Jellyfin or Kodi instead of your tuner's own app (e.g. the HDHomeRun app). Once set up, the app plays straight from TVHeadend, so your live TV keeps working, even if Freetvarr was stopped for whatever reason. Your recordings appear separately, in Plex or Infuse.</p>
      <p class="ui-banner is-info">A Freetvarr app for Apple TV and Android TV is planned. Stay tuned!</p>
      <div v-if="!tvhUrl" class="ui-group">
        <p class="settings-row settings-row-meta">Set the TVHeadend address in Settings → SYSTEM → TVHeadend first.</p>
      </div>
      <div v-else-if="!login.authCode" class="settings-group" data-setting="tv-login">
        <h3 class="ui-group-label">TV login</h3>
        <div class="ui-group">
          <div class="settings-row">
            <p class="settings-row-meta">A TV app needs its own login to get your channels from TVHeadend. Press Make a TV login, and Freetvarr makes a login in TVHeadend that can only watch TV. It then shows the details to copy into the app.</p>
          </div>
          <div class="settings-row">
            <label class="field-label" for="tv-login-name">Login name</label>
            <div class="field-action">
              <div class="field-action-controls">
                <input v-no-autofill id="tv-login-name" type="text" :class="['field-input', { 'is-invalid': statusKind === 'err' && statusText }]"
                  v-model="name" :disabled="making" :aria-invalid="statusKind === 'err' && Boolean(statusText)" />
                <button type="button" :class="['ui-button', 'ui-button-primary', { 'is-pending': making }]" @click="makeLogin" :disabled="making" :aria-busy="making">
                  <template v-if="making"><span class="spinner" aria-hidden="true"></span> Making…</template><template v-else><tv-icon /> Make a TV login</template>
                </button>
              </div>
            </div>
            <p v-if="statusText" :class="['status-readout', 'field-status', statusKind]" role="status">{{ statusText }}</p>
          </div>
        </div>
      </div>
      <template v-else>
        <div class="settings-group" data-setting="tv-apps-address">
          <h3 class="ui-group-label">TVHeadend address</h3>
          <div class="ui-group">
            <div class="settings-row field-row mb-0!">
              <label class="field-label" for="tv-apps-host">TVHeadend address for TV apps</label>
              <input v-no-autofill id="tv-apps-host" type="text" class="field-input" v-model="host" placeholder="e.g. 192.168.1.10" />
            </div>
          </div>
        </div>
        <template v-if="addresses">
          <div class="settings-group" data-setting="jellyfin">
            <h3 class="ui-group-label">Jellyfin</h3>
            <div class="ui-group">
              <copy-row label="Tuner (M3U) URL" :value="addresses.playlist" />
              <copy-row label="Guide (XMLTV) URL" :value="addresses.guide" />
            </div>
          </div>
          <div class="settings-group" data-setting="kodi">
            <h3 class="ui-group-label">Kodi (TVHeadend HTSP client)</h3>
            <div class="ui-group">
              <copy-row label="Hostname" :value="addresses.host" />
              <copy-row label="HTTP port" :value="addresses.httpPort" />
              <copy-row label="HTSP port" :value="addresses.htspPort" />
              <copy-row label="Username" :value="login.username" />
              <copy-row label="Password" :value="login.password" />
            </div>
          </div>
        </template>
        <p v-else class="settings-note">Enter the network address of the computer that runs TVHeadend.</p>
        <p class="settings-note">Anyone on your home network with these details can watch your channels. They cannot change your settings or your recordings.</p>
        <div class="settings-group" data-setting="tv-login">
          <h3 class="ui-group-label">TV login</h3>
          <div class="ui-group">
            <div class="settings-row">
              <p class="settings-row-meta">Your TV login is “{{ login.username }}”. Delete it when no TV app uses it any more; TV apps that use it stop getting channels.</p>
              <div class="settings-row-actions">
                <button type="button" class="ui-button ui-button-destructive" @click="askDeleteLogin" :disabled="Boolean(confirming)">
                  <trash-icon /> Delete TV login
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
      <confirm-dialog :open="Boolean(confirming)" :dialog="confirming?.dialog" :icon="confirming?.icon"
        :busy="confirmBusy" @confirm="runConfirmed" @cancel="closeConfirm" />
    </section>
  `,

  setup(props) {
    const login = ref({})
    const name = ref(DEFAULT_TV_LOGIN_NAME)
    const host = ref('')
    const making = ref(false)
    const [statusText, statusKind, setStatus] = makeStatus()
    const prefillHost = () => {
      host.value = tvAppsHost({ tvhUrl: props.tvhUrl, browserHost: window.location.hostname })
    }
    const addresses = computed(() => tvAppsAddresses({ tvhUrl: props.tvhUrl, host: host.value, authCode: login.value.authCode }))
    const makeLogin = async () => {
      making.value = true
      try {
        login.value = await holdAtLeast({ task: () => api('POST', '/api/tv-login', { username: name.value }) })
      } catch (err) {
        setStatus(err.message, 'err', 0)
      } finally {
        making.value = false
      }
    }
    const { confirming, confirmBusy, askConfirm, closeConfirm, runConfirmed } = useConfirm()
    const deleteLogin = async () => {
      const { username } = login.value
      try {
        await api('DELETE', '/api/tv-login', { username })
        login.value = {}
        name.value = DEFAULT_TV_LOGIN_NAME
        setStatus('', 'ok', 0)
        toast({ text: `Deleted the TV login ${username}` })
      } catch (err) {
        toast({ text: `TV login not deleted: ${err.message}`, kind: 'error' })
      }
    }
    const askDeleteLogin = () => askConfirm({ dialog: deleteTvLoginConfirm({ username: login.value.username }), icon: 'trash-icon', run: deleteLogin })
    watch(() => props.tvhUrl, prefillHost, { immediate: true })
    onMounted(async () => {
      login.value = await api('GET', '/api/tv-login').catch(() => ({}))
    })
    return {
      login, name, host, making, statusText, statusKind, addresses, makeLogin,
      confirming, confirmBusy, closeConfirm, runConfirmed, askDeleteLogin,
    }
  },
}

const DEFAULT_TV_LOGIN_NAME = 'tv'
