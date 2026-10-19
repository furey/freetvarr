import { ref, computed, onMounted, watch } from '/vendor/vue.esm-browser.prod.js'
import { tvAppsAddresses, tvAppsHost } from '/tv-apps.js'
import { api } from '/shared/api.js'
import { makeStatus } from '/shared/path-check.js'

export const TvAppsPanel = {
  props: {
    tvhUrl: { type: String, default: '' },
  },
  template: `
    <section id="section-tv-apps" class="settings-section">
      <p class="settings-intro">
        Watch live TV with the guide in Jellyfin or Kodi.
        <info-button title="Watch on TV" doc="guide/tv-apps">
          <p>Watch live TV with the guide in an app on your TV, tablet, or phone (e.g. Jellyfin or Kodi). The app gets the channels and the guide straight from TVHeadend.</p>
          <p v-if="!login.authCode"><strong>Make a TV login</strong> makes a login that can only watch TV. It cannot change your settings or your recordings.</p>
          <p v-else>Your TV login can only watch TV. It cannot change your settings or your recordings.</p>
          <p>Copy each detail into the app. The setup guide has the steps for each app.</p>
        </info-button>
      </p>
      <div v-if="!tvhUrl" class="ui-group">
        <p class="settings-row settings-row-meta">Set the TVHeadend address in Settings → System → TVHeadend first.</p>
      </div>
      <div v-else-if="!login.authCode" class="settings-group">
        <h3 class="ui-group-label">TV login</h3>
        <div class="ui-group">
          <div class="settings-row">
            <p class="settings-row-meta">A TV app needs its own login to get your channels. Press Make a TV login, and Freetvarr makes a login that can only watch TV. It then shows the details to copy into the app.</p>
          </div>
          <div class="settings-row settings-row-actions">
            <div class="field-row mb-0!">
              <label class="field-label" for="tv-login-name">Login name</label>
              <input v-no-autofill id="tv-login-name" type="text" class="field-input" v-model="name" />
            </div>
            <button type="button" class="btn" @click="makeLogin" :disabled="making">
              <template v-if="making">Making…</template><template v-else><tv-icon /> Make a TV login</template>
            </button>
          </div>
          <p v-if="statusText" :class="['settings-row', 'status-readout', statusKind]">{{ statusText }}</p>
        </div>
      </div>
      <template v-else>
        <div class="settings-group">
          <h3 class="ui-group-label">TVHeadend address</h3>
          <div class="ui-group">
            <div class="settings-row field-row mb-0!">
              <label class="field-label" for="tv-apps-host">TVHeadend address for TV apps</label>
              <input v-no-autofill id="tv-apps-host" type="text" class="field-input" v-model="host" placeholder="e.g. 192.168.1.10" />
            </div>
          </div>
        </div>
        <template v-if="addresses">
          <div class="settings-group">
            <h3 class="ui-group-label">Jellyfin</h3>
            <div class="ui-group">
              <copy-row label="Tuner (M3U) URL" :value="addresses.playlist" />
              <copy-row label="Guide (XMLTV) URL" :value="addresses.guide" />
            </div>
          </div>
          <div class="settings-group">
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
      </template>
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
        login.value = await api('POST', '/api/tv-login', { username: name.value })
      } catch (err) {
        setStatus(err.message, 'err', 0)
      } finally {
        making.value = false
      }
    }
    watch(() => props.tvhUrl, prefillHost, { immediate: true })
    onMounted(async () => {
      login.value = await api('GET', '/api/tv-login').catch(() => ({}))
    })
    return { login, name, host, making, statusText, statusKind, addresses, makeLogin }
  },
}

const DEFAULT_TV_LOGIN_NAME = 'tv'
