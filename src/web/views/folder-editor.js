import { ref, computed, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { holdAtLeast } from '/pending.js'
import { api } from '/shared/api.js'
import { makeStatus } from '/shared/path-check.js'
import { artFallbackStyle } from '/art-fallback.js'
import { candidateMetaOf, identityRowOf } from '/show-identity-text.js'

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
          <p v-if="folderFix" class="settings-hint">Plex finds the right show more often when the folder name carries its TVDB number. Press <strong>Rename folder</strong> to rename it to <code>{{ folderFix.to }}</code>.</p>
        </div>
        <div v-if="identityRow">
          <span class="field-label">Show</span>
          <div class="ui-group">
            <button type="button" class="ui-group-row suggestions-row-button" @click="choosing = true" :disabled="saving || !identity.candidates.length">
              <span class="settings-toggle-text">
                <span class="settings-row-title">{{ identityRow.title }}</span>
                <span class="settings-row-meta">{{ identityRow.meta }}</span>
              </span>
            </button>
          </div>
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
        <button v-if="folderFix" type="button" class="ui-button" @click="renaming = true" :disabled="saving">Rename folder</button>
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
      <ui-sheet v-if="identity" :open="choosing" title="Check which show this is" subtitle="Freetvarr names the folder after the show you pick, so Plex matches the right one." @close="closeChoosing">
        <p v-if="chooseError" class="ui-banner is-error" role="alert">{{ chooseError }}</p>
        <div class="ui-group move-show-list">
          <button v-for="candidate in identity.candidates" :key="candidate.tvmazeId" type="button" class="ui-group-row is-tall move-show-row"
            :disabled="saving" @click="chooseShow(candidate)">
            <span class="library-menu-art ui-art-fallback is-poster" :style="artFallbackStyle(candidate.name)" aria-hidden="true"></span>
            <span class="ui-group-row-main">
              <span class="ui-group-row-title">{{ candidate.identity?.name || candidate.name }}</span>
              <span class="ui-group-row-meta">{{ candidateMetaOf({ candidate, current: identity.current }) }}</span>
            </span>
          </button>
        </div>
      </ui-sheet>
      <ui-sheet v-if="folderFix" :open="renaming" title="Rename folder" @close="closeRename">
        <div class="confirm-dialog-body">
          <p>Freetvarr renames <code>{{ folderFix.from }}</code> to <code>{{ folderFix.to }}</code> in your TV library.</p>
          <p>{{ renameOutcome }}</p>
          <p v-if="renameError" class="status-readout err">{{ renameError }}</p>
        </div>
        <template #footer>
          <button type="button" :class="['ui-button', 'ui-button-primary', 'ui-button-block', { 'is-pending': saving }]" @click="renameFolder" :disabled="saving" :aria-busy="saving">
            <template v-if="saving"><span class="spinner" aria-hidden="true"></span> Renaming…</template><template v-else>Rename folder</template>
          </button>
          <button type="button" class="ui-button ui-button-block" @click="closeRename" :disabled="saving">Cancel</button>
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
    const renaming = ref(false)
    const renameError = ref('')
    const folderFix = ref(null)
    const renameOutcome = computed(() => folderFixOutcomeOf(folderFix.value))
    const identity = ref(null)
    const choosing = ref(false)
    const chooseError = ref('')
    const identityRow = computed(() => identityRowOf({ status: identity.value, title: props.folder.show_pattern }))
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
      if (!saving.value && !confirming.value && !renaming.value) emit('cancel')
    }

    const loadFolderFix = async () => {
      const plan = await api('GET', `/api/shows/${props.folder.id}/folder-fix`).catch(() => null)
      folderFix.value = plan?.state === 'ready' ? plan : null
    }

    const closeRename = () => {
      if (saving.value) return
      renaming.value = false
      renameError.value = ''
    }

    const renameFolder = async () => {
      saving.value = true
      renameError.value = ''
      try {
        await holdAtLeast({ task: () => api('POST', `/api/shows/${props.folder.id}/folder-fix`, { to: folderFix.value.to }) })
        destFolder.value = folderFix.value.to
        folderFix.value = null
        renaming.value = false
        emit('saved')
      } catch (err) {
        renameError.value = `Error: ${err.message}`
      } finally {
        saving.value = false
      }
    }

    const loadIdentity = async () => {
      identity.value = await api('GET', `/api/shows/${props.folder.id}/identity`).catch(() => null)
    }

    const closeChoosing = () => {
      if (saving.value) return
      choosing.value = false
      chooseError.value = ''
    }

    const chooseShow = async (candidate) => {
      saving.value = true
      chooseError.value = ''
      try {
        await holdAtLeast({ task: () => api('POST', `/api/shows/${props.folder.id}/identity`, { tvmaze_id: candidate.tvmazeId }) })
        await Promise.all([loadIdentity(), loadFolderFix()])
        choosing.value = false
      } catch (err) {
        chooseError.value = `Error: ${err.message}`
      } finally {
        saving.value = false
      }
    }

    onMounted(() => Promise.all([loadFolderFix(), loadIdentity()]))

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
      folderFix, renaming, renameError, renameOutcome, closeRename, renameFolder,
      identity, identityRow, choosing, chooseError, closeChoosing, chooseShow, candidateMetaOf, artFallbackStyle,
      removeOutcome, save, remove, statusText, statusKind, mediaRootPrefix, FOLDER_HINT,
    }
  },
}

export const folderFixOutcomeOf = (plan) => {
  if (!plan) return ''
  const plex = 'Plex then rescans your TV library.'
  if (!plan.folderExists) return `The folder is not on disk yet, so Freetvarr changes where new episodes save to. ${plex}`
  const count = plan.recordings === 1 ? '1 recording' : `${plan.recordings} recordings`
  return plan.recordings
    ? `Freetvarr updates the ${count} in it, and new episodes save to the new folder. ${plex}`
    : `New episodes save to the new folder. ${plex}`
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
