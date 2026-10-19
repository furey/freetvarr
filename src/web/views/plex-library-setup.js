import { ref, computed, watch } from '/vendor/vue.esm-browser.prod.js'
import { api } from '/shared/api.js'
import { makeStatus } from '/shared/path-check.js'

export const PlexLibrarySetup = {
  props: {
    plexUrl: { type: String, default: '' },
    plexToken: { type: String, default: '' },
    loads: { type: Number, default: 0 },
  },
  emits: ['created'],
  template: `
    <div v-if="missing.length || statusText" class="plex-library-setup">
      <template v-if="missing.length">
        <p class="plex-library-text">
          Plex has no library for {{ missingSummary }}. Freetvarr can create {{ missing.length === 1 ? 'it' : 'them' }}. Check each name and folder, then press Create libraries.
        </p>
        <div v-for="lib in missing" :key="lib.kind" class="plex-library-fields">
          <div class="field-row">
            <label class="field-label" :for="'plex-library-name-' + lib.kind">{{ PLEX_LIBRARY_LABELS[lib.kind] }} library name</label>
            <input v-no-autofill :id="'plex-library-name-' + lib.kind" type="text" class="field-input" v-model="lib.name" />
          </div>
          <div class="field-row">
            <label class="field-label" :for="'plex-library-folder-' + lib.kind">Folder <span class="text-ink-mute">(as Plex sees it)</span></label>
            <input v-no-autofill :id="'plex-library-folder-' + lib.kind" type="text" class="field-input" v-model="lib.location" />
          </div>
        </div>
        <p class="settings-hint">
          Plex can see your files at a different path from Freetvarr. With the Plex in Freetvarr's compose file, the paths are the same. If you installed Plex yourself, enter the path that Plex shows when you add a folder to a library.
        </p>
      </template>
      <div class="plex-library-actions">
        <button v-if="missing.length" type="button" class="btn" @click="create" :disabled="creating">
          <template v-if="creating">Creating…</template><template v-else><plus-icon /> Create libraries</template>
        </button>
        <span v-if="statusText" :class="['status-readout', statusKind]">{{ statusText }}</span>
      </div>
    </div>
  `,
  setup(props, { emit }) {
    const [statusText, statusKind, setStatus] = makeStatus()
    const missing = ref([])
    const creating = ref(false)

    const missingSummary = computed(() => listInWords(missing.value.map((lib) => PLEX_LIBRARY_SUMMARIES[lib.kind])))

    const connection = () => ({
      plex_url: props.plexUrl,
      ...(props.plexToken ? { plex_token: props.plexToken } : {}),
    })

    const loadPlan = async () => {
      const { libraries = [] } = await api('POST', '/api/plex-libraries', connection()).catch(() => ({}))
      missing.value = libraries.filter((lib) => !lib.existing)
    }

    const create = async () => {
      creating.value = true
      setStatus('Creating libraries in Plex…', 'busy', 0)
      try {
        const { results, selected } = await api('POST', '/api/plex-libraries/create', {
          ...connection(),
          libraries: missing.value.map(({ kind, name, location }) => ({ kind, name, location })),
        })
        const failed = results.filter((r) => r.status === 'failed')
        setStatus(plexLibraryOutcome(results), failed.length ? 'err' : 'ok', 0)
        emit('created', selected)
      } catch (err) {
        setStatus(`Create failed: ${err.message}`, 'err', 0)
      } finally {
        creating.value = false
      }
    }

    watch(() => props.loads, loadPlan)

    return { missing, missingSummary, creating, create, statusText, statusKind, PLEX_LIBRARY_LABELS }
  },
}

const PLEX_LIBRARY_LABELS = { tv: 'TV', oneoff: 'One-off', movies: 'Movies' }
const PLEX_LIBRARY_SUMMARIES = { tv: 'TV shows', oneoff: 'one-off recordings', movies: 'movies' }

const listInWords = (items) => {
  if (items.length < 2) return items[0] || ''
  if (items.length === 2) return `${items[0]} or ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, or ${items.at(-1)}`
}

const plexLibraryOutcome = (results) => results
  .map((r) => {
    if (r.status === 'created') return `Created ${r.title}.`
    if (r.status === 'exists') return `${r.location} is already in ${r.title}.`
    return `${r.name || PLEX_LIBRARY_LABELS[r.kind]}: ${r.error}`
  })
  .join(' ')
