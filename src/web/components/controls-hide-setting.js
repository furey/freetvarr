import { ref } from '/vendor/vue.esm-browser.prod.js'
import { CONTROLS_HIDE_CHOICES_S, loadControlsHideS, saveControlsHideS } from '/controls-hide.js'

export const ControlsHideSetting = {
  template: `
    <div class="settings-row">
      <span id="controls-hide-label" class="field-label">Hide player controls after</span>
      <ui-segmented class="controls-hide-choices" aria-labelledby="controls-hide-label" :model-value="current"
        :options="choices.map((seconds) => ({ value: seconds, label: seconds + ' s' }))" @update:model-value="choose" />
      <p class="settings-hint">Saved on this device.</p>
    </div>
  `,
  setup() {
    const current = ref(loadControlsHideS(localStorage))
    const choose = (seconds) => {
      saveControlsHideS(localStorage, seconds)
      current.value = loadControlsHideS(localStorage)
    }
    return { choices: CONTROLS_HIDE_CHOICES_S, current, choose }
  },
}
