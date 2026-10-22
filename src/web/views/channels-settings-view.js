import { ref, computed, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { HIDE_SD_COPY, hideSdBodyOf, hideSdPrefsOf, hideSdSwitchesOf } from '/hide-sd.js'
import { loadChannelPrefs, saveChannelPrefs } from '/shared/channel-prefs.js'
import { loadNowAll } from '/shared/channel-twins.js'

export const ChannelsSettingsView = {
  template: `
    <div v-page-reveal class="settings-page channels-settings">
      <teleport defer to="#settings-page-info">
        <info-button title="Channels" doc="guide/tv-guide#favourites" piece="tuner">
          <p>The TV tuner receives the channels, and TVHeadend lists them after a channel scan.</p>
          <p>These switches hide SD channels from Live TV, the TV guide, and search. A favourite is never hidden.</p>
        </info-button>
      </teleport>
      <p v-if="error" class="ui-banner is-error" role="alert">{{ error }}</p>
      <div class="settings-group">
        <div class="ui-group">
          <div class="settings-row">
            <toggle-switch :model-value="switches.simulcastsOn" class="settings-toggle" :pending="!loaded"
              :disabled="!loaded || switches.simulcastsLocked" @update:model-value="save({ hideSdSimulcasts: $event })">
              <span class="settings-toggle-text">
                <span class="settings-row-title">{{ copy.simulcasts.title }}</span>
                <span class="settings-row-meta">{{ copy.simulcasts.meta }}</span>
              </span>
            </toggle-switch>
          </div>
          <div class="settings-row">
            <toggle-switch :model-value="switches.channelsOn" class="settings-toggle" :pending="!loaded"
              @update:model-value="save({ hideSdChannels: $event })">
              <span class="settings-toggle-text">
                <span class="settings-row-title">{{ copy.channels.title }}</span>
                <span class="settings-row-meta">{{ copy.channels.meta }}</span>
              </span>
            </toggle-switch>
          </div>
        </div>
        <p class="settings-note">Favourites, the sort order, and which channels show are in the Channels window on Live TV and the TV guide.</p>
      </div>
    </div>
  `,
  setup() {
    const prefs = ref(hideSdPrefsOf())
    const loaded = ref(false)
    const error = ref('')
    const switches = computed(() => hideSdSwitchesOf(prefs.value))

    const load = async () => {
      try {
        prefs.value = hideSdPrefsOf(await loadChannelPrefs())
        loaded.value = true
      } catch (err) {
        error.value = `Could not load the channel settings: ${err.message}`
      }
    }

    const save = async (patch) => {
      const previous = prefs.value
      prefs.value = { ...previous, ...patch }
      error.value = ''
      try {
        prefs.value = hideSdPrefsOf(await saveChannelPrefs(hideSdBodyOf(patch)))
        loadNowAll().catch(() => {})
      } catch (err) {
        prefs.value = previous
        error.value = `Could not save: ${err.message}`
      }
    }

    onMounted(load)

    return { copy: HIDE_SD_COPY, switches, loaded, error, save }
  },
}
