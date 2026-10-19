import { ref, computed } from '/vendor/vue.esm-browser.prod.js'
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
    <form class="series-editor space-y-4" @submit.prevent="save" @keydown.esc.stop="closeEditor">
      <div class="grid gap-4 md:grid-cols-2">
        <div class="field-row">
          <label class="field-label" :for="'saves-to-' + folder.id">Saves to</label>
          <div class="field-prefixed">
            <span class="field-prefix">{{ mediaRootPrefix(mediaRoot) }}</span>
            <input v-no-autofill :id="'saves-to-' + folder.id" type="text" v-model="destFolder" list="series-media-folders" class="field-input" />
          </div>
          <datalist id="series-media-folders">
            <option v-for="d in folders" :key="d" :value="d" />
          </datalist>
          <p class="text-xs text-ink-mute mt-2">{{ FOLDER_HINT }}</p>
        </div>
        <div class="field-row">
          <label class="field-label">Season folders</label>
          <input v-no-autofill type="text" v-model="seasonTemplate" placeholder="Season {season}" class="field-input" />
        </div>
        <div class="field-row">
          <label class="field-label">Recording titles that contain</label>
          <input v-no-autofill type="text" v-model="pattern" class="field-input" />
          <p class="text-xs text-ink-mute mt-2">Case-insensitive. The longest match wins when two folders match.</p>
        </div>
        <div class="field-row">
          <label class="field-label">Ad removal</label>
          <select class="field-input" v-model="adRemoval" :disabled="!adRemovalEnabled">
            <option value="off">OFF</option>
            <option value="detect">DETECT: mark ad breaks so apps can skip them</option>
            <option value="cut">CUT: remove ad breaks (keeps .orig backup)</option>
          </select>
          <p v-if="!adRemovalEnabled" class="text-xs text-ink-mute mt-2">Enable ad removal in Settings to use this.</p>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <toggle-switch v-model="deleteAfter">REMOVE FROM TVHEADEND AFTER IMPORT</toggle-switch>
      </div>
      <div class="card-actions">
        <button type="submit" class="btn btn-primary" :disabled="saving">
          <template v-if="saving">SAVING…</template><template v-else><check-icon /> SAVE</template>
        </button>
        <button type="button" class="btn btn-danger" @click="confirming = true" :disabled="saving"><component :is="removeIcon" /> {{ removeLabel }}</button>
        <span v-if="statusText" :class="['status-readout', statusKind]">{{ statusText }}</span>
      </div>
      <teleport to="body">
      <transition name="epg-sheet">
      <div v-if="confirming" class="epg-modal-backdrop" @click.self="confirming = false">
        <section class="panel epg-modal info-modal" role="alertdialog" aria-modal="true" :aria-labelledby="'remove-title-' + folder.id">
          <header class="panel-header">
            <span :id="'remove-title-' + folder.id" class="panel-title">{{ removeTitle }}</span>
            <button type="button" class="btn btn-icon epg-modal-x" @click="confirming = false" aria-label="Close"><cross-icon /></button>
          </header>
          <div class="panel-body space-y-4">
            <p class="text-sm text-ink">{{ removeOutcome }}</p>
            <p class="text-sm text-ink">{{ isSeries ? 'Episodes' : 'Recordings' }} already imported will stay where they are.</p>
            <div class="epg-modal-actions flex flex-wrap items-center justify-end gap-2">
              <button type="button" class="btn btn-danger" @click="remove" :disabled="saving">
                <template v-if="saving">REMOVING…</template><template v-else><component :is="removeIcon" /> {{ removeLabel }}</template>
              </button>
            </div>
          </div>
        </section>
      </div>
      </transition>
      </teleport>
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
    const removeLabel = computed(() => (props.isSeries ? 'UNASSIGN FOLDER' : 'REMOVE TITLE MATCH'))
    const removeIcon = computed(() => (props.isSeries ? 'unlink-icon' : 'minus-icon'))
    const removeTitle = computed(() => (props.isSeries ? 'Unassign folder' : 'Remove title match'))
    const removeOutcome = computed(() => {
      const condition = props.isSeries
        ? 'If you unassign this series folder, future episodes'
        : 'If you remove this title match, future recordings with this title'
      return props.importUnmatched
        ? `${condition} will save to the one-off folder again.`
        : `${condition} will wait in RECORDINGS until you import them.`
    })

    const save = async () => {
      if (!destFolder.value.trim() || !pattern.value.trim()) {
        setStatus('Enter where to save and the title.', 'err', 5000)
        return
      }
      saving.value = true
      try {
        await api('PATCH', `/api/shows/${props.folder.id}`, {
          dest_folder: destFolder.value.trim(),
          season_template: seasonTemplate.value.trim() || 'Season {season}',
          show_pattern: pattern.value.trim(),
          enabled: true,
          delete_after_import: deleteAfter.value,
          ...(props.adRemovalEnabled ? { ad_removal: adRemoval.value } : {}),
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
        await api('DELETE', `/api/shows/${props.folder.id}`)
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
      removeLabel, removeIcon, removeTitle, removeOutcome, save, remove, statusText, statusKind, mediaRootPrefix, FOLDER_HINT,
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
    <button type="button" class="btn btn-sm" @click.stop="$emit('sync')" @keydown.stop
      :disabled="!folder.enabled || syncing" :title="syncTitle">
      <template v-if="syncing">STARTING…</template><template v-else><play-icon /> SYNC</template>
    </button>
  `,
  setup(props) {
    const noun = computed(() => (props.isSeries ? 'series' : 'title'))
    const syncTitle = computed(() => (props.folder.enabled
      ? `Sync just this ${noun.value} now`
      : `Open the ${noun.value}, then press SAVE, to sync it`))
    return { syncTitle }
  },
}
