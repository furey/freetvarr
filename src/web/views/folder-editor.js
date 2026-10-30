import { ref, computed } from '/vendor/vue.esm-browser.prod.js'
import { holdAtLeast } from '/pending.js'
import { api } from '/shared/api.js'
import { makeStatus } from '/shared/path-check.js'

export const mediaRootPrefix = (mediaRoot) => `${(mediaRoot || '/media/tv').replace(/\/+$/, '')}/`

export const FOLDER_HINT = 'Type a folder name; matching existing folders are suggested.'

export const FolderEditor = {
  props: {
    folder: { type: Object, required: true },
    folders: { type: Array, default: () => [] },
    mediaRoot: { type: String, default: '' },
    adRemovalEnabled: Boolean,
    isSeries: Boolean,
    importUnmatched: { type: Boolean, default: true },
  },
  emits: ['saved', 'cancel', 'deleted'],
  template: `
    <form class="series-editor" @submit.prevent="save" @keydown.esc.stop="closeEditor">
      <div class="settings-editor-grid">
        <div>
          <label class="field-label" :for="'saves-to-' + folder.id">Saves to</label>
          <div class="field-prefixed">
            <span class="field-prefix">{{ mediaRootPrefix(mediaRoot) }}</span>
            <input v-no-autofill :id="'saves-to-' + folder.id" type="text" v-model="destFolder" list="series-media-folders" class="field-input" />
          </div>
          <datalist id="series-media-folders">
            <option v-for="d in folders" :key="d" :value="d" />
          </datalist>
          <p class="settings-hint">{{ FOLDER_HINT }}</p>
        </div>
        <div>
          <label class="field-label" :for="'season-template-' + folder.id">Season folders</label>
          <input v-no-autofill :id="'season-template-' + folder.id" type="text" v-model="seasonTemplate" placeholder="Season {season}" class="field-input" />
        </div>
        <div>
          <label class="field-label" :for="'pattern-' + folder.id">Recording titles that contain</label>
          <input v-no-autofill :id="'pattern-' + folder.id" type="text" v-model="pattern" class="field-input" />
          <p class="settings-hint">Case-insensitive. The longest match wins when two folders match.</p>
        </div>
        <div>
          <label class="field-label" :for="'ad-removal-' + folder.id">Ad removal</label>
          <select :id="'ad-removal-' + folder.id" class="field-input" v-model="adRemoval" :disabled="!adRemovalEnabled">
            <option value="off">Off</option>
            <option value="detect">Detect: mark ad breaks so apps can skip them</option>
            <option value="cut">Cut: remove ad breaks (keeps .orig backup)</option>
          </select>
          <p v-if="!adRemovalEnabled" class="settings-hint">Turn on ad removal in <a href="#/settings/ad-removal">Settings</a> to use this.</p>
        </div>
      </div>
      <toggle-switch v-model="deleteAfter" class="settings-toggle">
        <span class="settings-row-title">Remove from TVHeadend after import</span>
      </toggle-switch>
      <div class="card-actions">
        <button type="submit" :class="['ui-button', 'ui-button-primary', { 'is-pending': saving && !confirming }]" :disabled="saving" :aria-busy="saving && !confirming">
          <template v-if="saving"><span class="spinner" aria-hidden="true"></span> Saving…</template><template v-else><check-icon /> Save</template>
        </button>
        <button v-if="!isSeries" type="button" class="ui-button ui-button-destructive" @click="confirming = true" :disabled="saving"><minus-icon /> Remove title match</button>
        <span v-if="statusText" :class="['status-readout', statusKind]">{{ statusText }}</span>
      </div>
      <ui-sheet v-if="!isSeries" :open="confirming" title="Remove title match" @close="confirming = false">
        <div class="confirm-dialog-body">
          <p>{{ removeOutcome }}</p>
          <p>Recordings already imported will stay where they are.</p>
        </div>
        <template #footer>
          <button type="button" :class="['ui-button', 'ui-button-destructive', 'ui-button-block', { 'is-pending': saving }]" @click="remove" :disabled="saving" :aria-busy="saving">
            <template v-if="saving"><span class="spinner" aria-hidden="true"></span> Removing…</template><template v-else><minus-icon /> Remove title match</template>
          </button>
          <button type="button" class="ui-button ui-button-block" @click="confirming = false" :disabled="saving">Cancel</button>
        </template>
      </ui-sheet>
    </form>
  `,
  setup(props, { emit }) {
    const [statusText, statusKind, setStatus] = makeStatus()
    const destFolder = ref(props.folder.dest_folder)
    const seasonTemplate = ref(props.folder.season_template)
    const pattern = ref(props.folder.show_pattern)
    const adRemoval = ref(props.folder.ad_removal || 'off')
    const deleteAfter = ref(Boolean(props.folder.delete_after_import))
    const saving = ref(false)
    const confirming = ref(false)
    const removeOutcome = computed(() => {
      const condition = 'If you remove this title match, future recordings with this title'
      return props.importUnmatched
        ? `${condition} will save to the one-off folder, or to a new show folder when Freetvarr finds they are a series.`
        : `${condition} will wait in the Recording log until you import them.`
    })

    const save = async () => {
      if (!destFolder.value.trim() || !pattern.value.trim()) {
        setStatus('Enter where to save and the title.', 'err', 5000)
        return
      }
      saving.value = true
      try {
        await holdAtLeast({
          task: () => api('PATCH', `/api/shows/${props.folder.id}`, {
            dest_folder: destFolder.value.trim(),
            season_template: seasonTemplate.value.trim() || 'Season {season}',
            show_pattern: pattern.value.trim(),
            enabled: true,
            delete_after_import: deleteAfter.value,
            ...(props.adRemovalEnabled ? { ad_removal: adRemoval.value } : {}),
          }),
        })
        emit('saved')
      } catch (err) {
        setStatus(`Error: ${err.message}`, 'err', 5000)
      } finally {
        saving.value = false
      }
    }

    const closeEditor = () => {
      if (!saving.value && !confirming.value) emit('cancel')
    }

    const remove = async () => {
      saving.value = true
      try {
        await holdAtLeast({ task: () => api('DELETE', `/api/shows/${props.folder.id}`) })
        confirming.value = false
        emit('deleted')
      } catch (err) {
        confirming.value = false
        setStatus(`Error: ${err.message}`, 'err', 5000)
      } finally {
        saving.value = false
      }
    }

    return {
      destFolder, seasonTemplate, pattern, adRemoval, deleteAfter, saving, confirming, closeEditor,
      removeOutcome, save, remove, statusText, statusKind, mediaRootPrefix, FOLDER_HINT,
    }
  },
}

export const FolderSyncButton = {
  props: {
    folder: { type: Object, required: true },
    isSeries: Boolean,
    syncing: Boolean,
  },
  emits: ['sync'],
  template: `
    <button type="button" class="ui-button ui-button-sm" @click.stop="$emit('sync')" @keydown.stop
      :disabled="!folder.enabled || syncing" :title="syncTitle">
      <template v-if="syncing">Starting…</template><template v-else><play-icon /> Sync</template>
    </button>
  `,
  setup(props) {
    const noun = computed(() => (props.isSeries ? 'series' : 'title'))
    const syncTitle = computed(() => (props.folder.enabled
      ? `Sync just this ${noun.value} now`
      : `Open the ${noun.value}, then press Save, to sync it`))
    return { syncTitle }
  },
}
