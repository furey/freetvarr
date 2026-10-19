import { ControlsHideSetting } from '/components/controls-hide-setting.js'
import { playerMuted } from '/shared/player-shared.js'

export const PlayerSettingsView = {
  components: { ControlsHideSetting },
  template: `
    <div class="settings-page player-settings">
      <div class="settings-group">
        <div class="ui-group">
          <div class="settings-row">
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
    </div>
  `,
  setup() {
    return { playerMuted }
  },
}
