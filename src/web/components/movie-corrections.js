import { ref, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { clearProgrammeKind, listProgrammeKinds } from '/shared/programme-kind-session.js'
import { correctionRowsOf } from '/movie-choice.js'
import { settingLabelOf } from '/settings-index.js'

export const MovieCorrections = {
  template: `
    <div class="settings-group" data-setting="movie-corrections">
      <div class="ui-group">
        <button type="button" class="ui-group-row suggestions-row-button" @click="open = true">
          <span class="settings-toggle-text">
            <span class="settings-row-title">{{ label }}</span>
            <span class="settings-row-meta">Shows you marked Not a movie or This is a movie</span>
          </span>
          <span class="suggestions-count ui-tabular"><span v-if="!loaded" class="ui-skeleton is-text" style="--skeleton-w: 1.2em"></span><template v-else>{{ corrections.length }}</template></span>
          <chevron-glyph class="suggestions-chevron" />
        </button>
      </div>
      <p class="settings-note">A correction changes how the TV guide, Home, and Recordings list a show, and which folder a film saves to.</p>
      <ui-sheet :open="open" :title="label" subtitle="Freetvarr lists these shows your way. Undo a correction to go back to how the TV guide lists it." @close="open = false">
        <p v-if="error" class="ui-banner is-error" role="alert">{{ error }}</p>
        <div v-if="corrections.length" class="ui-group">
          <div v-for="correction in corrections" :key="correction.showKey" class="ui-group-row suggestions-hidden-row">
            <span class="settings-toggle-text">
              <span class="settings-row-title suggestions-hidden-title">{{ correction.title }}</span>
              <span class="settings-row-meta">{{ correction.choice }}</span>
            </span>
            <button type="button" class="ui-button ui-button-secondary is-small" :disabled="undoing === correction.showKey"
              @click="undo(correction)">Undo</button>
          </div>
        </div>
        <p v-else class="settings-row-meta">No movie corrections. Choose Not a movie or This is a movie in a show’s menu to correct how it is listed.</p>
      </ui-sheet>
    </div>
  `,
  setup() {
    const corrections = ref([])
    const loaded = ref(false)
    const open = ref(false)
    const undoing = ref('')
    const error = ref('')

    const load = async () => {
      corrections.value = correctionRowsOf(await listProgrammeKinds().catch(() => []))
      loaded.value = true
    }

    const undo = async (correction) => {
      undoing.value = correction.showKey
      error.value = ''
      try {
        await clearProgrammeKind(correction.showKey)
        corrections.value = corrections.value.filter((entry) => entry.showKey !== correction.showKey)
      } catch (err) {
        error.value = `Could not undo the correction to ${correction.title}: ${err.message}`
      } finally {
        undoing.value = ''
      }
    }

    onMounted(load)

    return { label: settingLabelOf('movie-corrections'), corrections, loaded, open, undoing, error, undo }
  },
}
