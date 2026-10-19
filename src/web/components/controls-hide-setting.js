import { ref } from '/vendor/vue.esm-browser.prod.js'
import { CONTROLS_HIDE_CHOICES_S, loadControlsHideS, saveControlsHideS } from '/controls-hide.js'

export const ControlsHideSetting = {
  template: `
    <div class="settings-row">
      <span id="controls-hide-label" class="field-label">Hide player controls after</span>
      <div class="ui-segmented controls-hide-choices" role="group" aria-labelledby="controls-hide-label">
        <button v-for="seconds in choices" :key="seconds" type="button" class="ui-segment"
          :aria-pressed="String(current === seconds)" @click="choose(seconds)">{{ seconds }} s</button>
      </div>
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
