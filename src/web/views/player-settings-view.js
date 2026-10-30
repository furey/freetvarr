import { ControlsHideSetting } from '/components/controls-hide-setting.js'
import { playerMuted } from '/shared/player-shared.js'

export const PlayerSettingsView = {
  components: { ControlsHideSetting },
  template: `
    <div v-page-reveal class="settings-page player-settings">
      <div class="settings-group" data-setting="player-device">
        <h3 class="ui-group-label">This device</h3>
        <div class="ui-group">
          <div class="settings-row" data-setting="start-muted">
            <toggle-switch :model-value="playerMuted" class="settings-toggle"
              @update:model-value="playerMuted = $event">
              <span class="settings-toggle-text">
                <span class="settings-row-title">Start muted</span>
                <span class="settings-row-meta">Saved on this device.</span>
              </span>
            </toggle-switch>
          </div>
          <controls-hide-setting />
        </div>
      </div>
      <live-streams-setting />
    </div>
  `,
  setup() {
    return { playerMuted }
  },
}
