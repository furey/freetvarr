import { ref, computed, onMounted } from '/vendor/vue.esm-browser.prod.js'

export const CancelSeriesStep = {
  props: {
    title: { type: String, required: true },
    episodeOutcome: { type: String, default: '' },
    titleMatch: { type: Object, default: null },
    busy: { type: Boolean, default: false },
    showBack: { type: Boolean, default: true },
  },
  emits: ['confirm', 'back'],
  template: `
    <div class="cancel-series-step">
      <div class="cancel-series-text">
        <p class="cancel-series-question">Cancel the series recording of "{{ title }}"?</p>
        <p class="cancel-series-note">TVHeadend stops recording new episodes and removes the upcoming ones. Episodes already recorded stay, and so do their files.</p>
      </div>
      <div v-if="episodeOutcome || titleMatch" class="ui-group">
        <div v-if="episodeOutcome" class="cancel-series-option">
          <toggle-switch v-model="stopNow">Stop the episode on now</toggle-switch>
          <p class="cancel-series-note">{{ stopNow ? episodeOutcome : 'The episode on now keeps recording to the end.' }}</p>
        </div>
        <div v-if="titleMatch" class="cancel-series-option">
          <toggle-switch v-model="keepTitleMatch">Keep title match</toggle-switch>
          <p class="cancel-series-note">{{ titleMatchNote }}</p>
        </div>
      </div>
      <div class="cancel-series-actions">
        <button type="button" :class="['ui-button', 'ui-button-destructive', 'ui-button-block', { 'is-busy': busy }]" @click="confirm" :disabled="busy">
          <span>Cancel series</span>
          <span v-if="busy" class="spinner spinner-overlay"></span>
        </button>
        <button v-if="showBack" ref="keepButton" type="button" class="ui-button ui-button-block" @click="$emit('back')" :disabled="busy">Keep series</button>
      </div>
    </div>
  `,

  setup(props, { emit }) {
    const stopNow = ref(true)
    const keepTitleMatch = ref(!isTitleMatchFromSeries({ titleMatch: props.titleMatch, title: props.title }))
    const titleMatchNote = computed(() => (keepTitleMatch.value
      ? `Recordings with "${props.titleMatch.show_pattern}" in the title keep saving to ${props.titleMatch.dest_folder} in your TV library. A title match records nothing by itself.`
      : 'Removes the title match. Recordings already imported stay where they are.'))
    const confirm = () => emit('confirm', {
      stopRecordingNow: Boolean(props.episodeOutcome) && stopNow.value,
      removeTitleMatch: Boolean(props.titleMatch) && !keepTitleMatch.value,
    })
    const keepButton = ref(null)
    onMounted(() => keepButton.value?.focus({ preventScroll: true }))
    return { stopNow, keepTitleMatch, titleMatchNote, confirm, keepButton }
  },
}

const isTitleMatchFromSeries = ({ titleMatch, title }) => Boolean(titleMatch)
  && titleMatch.show_pattern.trim().toLowerCase() === String(title || '').trim().toLowerCase()
