import { ref, computed, watch, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import {
  PICTURE_KINDS,
  UPLOAD_ACCEPT,
  artworkPathOf,
  candidatesPathOf,
  emptyPicturesText,
  isPictureFile,
  isTooBigToUpload,
  pictureChangedText,
  pictureGroupsOf,
  pictureResetText,
  tmdbNoteOf,
  uploadPathOf,
  uploadRemovePathOf,
  uploadedPicturesOf,
  withUploadedOf,
  withoutUploadOf,
} from '/artwork-picker.js'
import { MenuIcon } from '/components/library-menus.js'
import { api } from '/shared/api.js'
import { toast } from '/shared/toast.js'
import { rememberArtworkStamp } from '/shared/artwork-stamps.js'

export const ArtworkPicker = {
  components: { MenuIcon },
  props: {
    open: Boolean,
    show: { type: Object, default: null },
  },
  emits: ['close', 'changed'],
  template: `
    <ui-sheet :open="open && Boolean(show)" title="Change picture" :subtitle="show?.title || ''" @close="$emit('close')">
      <template #header-actions>
        <button type="button" class="ui-icon-button" aria-label="Close" @click="$emit('close')"><close-glyph /></button>
      </template>
      <ui-segmented tabs class="picture-kinds" v-model="kind" :options="kinds" aria-label="Picture" />
      <div class="picture-body" :aria-busy="String(searching)"
        @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop.prevent="onDrop">
        <section class="picture-group" aria-label="Your pictures">
          <h3 class="picture-source">Your pictures</h3>
          <div :class="['picture-grid', 'is-' + kind]">
            <button type="button" :class="['picture-upload', { 'is-dropping': dropping }]" :disabled="uploading"
              @click="pickFile">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 15V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
              </svg>
              <span v-if="uploading" class="picture-upload-label">Uploading <span class="ui-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span></span>
              <template v-else>
                <span class="picture-upload-label">Upload picture</span>
                <span class="picture-upload-hint">or drop a file here</span>
              </template>
            </button>
            <div v-for="picture in uploaded" v-show="!failed[picture.id]" :key="picture.id" class="picture-mine">
              <button type="button" :class="['picture-tile', { 'is-chosen': picture.id === chosenId }]"
                :aria-pressed="String(picture.id === chosenId)" :aria-label="tileLabel('Your', picture)" :disabled="busy"
                @click="choose(picture)">
                <img :src="picture.url" alt="" loading="lazy" @error="markFailed(picture)" />
                <span v-if="picture.id === chosenId" class="picture-tick" aria-hidden="true"><menu-icon name="check" /></span>
              </button>
              <button type="button" class="picture-remove" aria-label="Remove picture" :disabled="busy" @click="removeUpload(picture)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
                  stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          </div>
          <input ref="fileInput" type="file" class="picture-file" :accept="accept" tabindex="-1" aria-hidden="true"
            @change="onFileChosen" />
        </section>
        <section v-for="group in groups" :key="group.source" class="picture-group" :aria-label="group.label">
          <h3 class="picture-source">{{ group.label }}</h3>
          <div :class="['picture-grid', 'is-' + kind]">
            <button v-for="picture in group.pictures" :key="picture.id" type="button"
              :class="['picture-tile', { 'is-chosen': picture.id === chosenId }]" :aria-pressed="String(picture.id === chosenId)"
              :aria-label="tileLabel(group.label, picture)" :disabled="busy" @click="choose(picture)">
              <img :src="picture.url" alt="" loading="lazy" @error="markFailed(picture)" />
              <span v-if="picture.caption" class="picture-caption">{{ picture.caption }}</span>
              <span v-if="picture.id === chosenId" class="picture-tick" aria-hidden="true"><menu-icon name="check" /></span>
            </button>
          </div>
        </section>
        <p class="picture-note picture-status" role="status">
          <template v-if="searching">Looking for pictures <span class="ui-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span></template>
          <template v-else-if="!error && !groups.length">{{ emptyText }}</template>
        </p>
        <p v-if="error" class="picture-note is-error" role="alert">Cannot load pictures: {{ error }}</p>
        <p v-if="tmdbNote && !searching" class="picture-note">{{ tmdbNote }}</p>
      </div>
      <template #footer>
        <button type="button" class="ui-button ui-button-secondary ui-button-block" :disabled="busy || !chosenId" @click="reset">
          <menu-icon name="restart" /> Reset to automatic
        </button>
      </template>
    </ui-sheet>
  `,
  setup(props, { emit }) {
    const kind = ref('background')
    const offer = ref(null)
    const loading = ref(false)
    const waiting = ref(false)
    const error = ref('')
    const busy = ref(false)
    const uploading = ref(false)
    const dropping = ref(false)
    const failed = ref({})
    const fileInput = ref(null)
    let retryTimer = null
    let retries = 0
    let loadSeq = 0

    const candidates = computed(() => offer.value?.candidates || [])
    const groups = computed(() => pictureGroupsOf({ candidates: candidates.value, kind: kind.value })
      .map((group) => ({ ...group, pictures: group.pictures.filter((picture) => !failed.value[picture.id]) }))
      .filter((group) => group.pictures.length))
    const uploaded = computed(() => uploadedPicturesOf({ candidates: candidates.value, kind: kind.value }))
    const chosenId = computed(() => offer.value?.chosen?.[kind.value] || null)
    const searching = computed(() => !error.value && (loading.value || waiting.value) && !groups.value.length)
    const tmdbNote = computed(() => (offer.value ? tmdbNoteOf({ kind: kind.value, tmdbKey: offer.value.tmdbKey }) : ''))
    const emptyText = computed(() => emptyPicturesText(kind.value))

    const stopRetry = () => {
      clearTimeout(retryTimer)
      retryTimer = null
      waiting.value = false
    }

    const load = async () => {
      stopRetry()
      const key = props.show?.key
      if (!key) return
      const seq = ++loadSeq
      loading.value = true
      try {
        const found = await api('GET', candidatesPathOf(key))
        if (seq !== loadSeq) return
        offer.value = found
        error.value = ''
        if (found.pending && retries < MAX_RETRIES) {
          retries += 1
          waiting.value = true
          retryTimer = setTimeout(load, RETRY_MS)
        }
      } catch (err) {
        if (seq === loadSeq) error.value = err.message
      } finally {
        if (seq === loadSeq) loading.value = false
      }
    }

    const setChosen = ({ pictureKind, id }) => {
      if (!offer.value) return
      offer.value = { ...offer.value, chosen: { ...offer.value.chosen, [pictureKind]: id } }
    }

    const apply = async ({ key, pictureKind, id }) => {
      const path = artworkPathOf({ key, kind: pictureKind })
      const result = id ? await api('PUT', path, { id }) : await api('DELETE', path)
      rememberArtworkStamp({ key, kind: pictureKind, stamp: result?.stamp ?? null })
      if (props.show?.key === key) setChosen({ pictureKind, id })
      emit('changed', { kind: pictureKind })
    }

    const offerUndo = ({ text, key, pictureKind, previous }) =>
      toast({ text, action: { label: 'Undo', run: () => undo({ key, pictureKind, id: previous }) } })

    const change = async ({ id, text }) => {
      if (busy.value || !props.show) return
      const key = props.show.key
      const pictureKind = kind.value
      const previous = chosenId.value
      busy.value = true
      try {
        await apply({ key, pictureKind, id })
        offerUndo({ text, key, pictureKind, previous })
      } catch (err) {
        toast({ kind: 'error', text: 'Cannot change the picture', detail: err.message })
      } finally {
        busy.value = false
      }
    }

    const undo = ({ key, pictureKind, id }) => apply({ key, pictureKind, id })
      .catch((err) => toast({ kind: 'error', text: 'Cannot undo the change', detail: err.message }))

    const choose = (picture) => {
      if (picture.id === chosenId.value) return
      return change({ id: picture.id, text: pictureChangedText(kind.value) })
    }

    const reset = () => change({ id: null, text: pictureResetText(kind.value) })

    const upload = async (file) => {
      if (!file || uploading.value || busy.value || !props.show) return
      if (!isPictureFile(file)) return toast({ kind: 'error', text: 'Cannot upload that file', detail: 'Choose a JPEG, PNG, or WebP picture.' })
      if (isTooBigToUpload(file)) return toast({ kind: 'error', text: 'Picture is too big', detail: 'Choose a picture of 20 MB or less.' })
      const key = props.show.key
      const pictureKind = kind.value
      const previous = chosenId.value
      uploading.value = true
      busy.value = true
      try {
        const result = await api('POST', uploadPathOf({ key, kind: pictureKind }), file)
        rememberArtworkStamp({ key, kind: pictureKind, stamp: result.stamp ?? null })
        if (props.show?.key === key && offer.value) {
          offer.value = withUploadedOf({ offer: offer.value, candidate: result.candidate, chosen: result.chosen })
        }
        emit('changed', { kind: pictureKind })
        offerUndo({ text: pictureChangedText(pictureKind), key, pictureKind, previous })
      } catch (err) {
        toast({ kind: 'error', text: 'Cannot upload the picture', detail: err.message })
      } finally {
        uploading.value = false
        busy.value = false
      }
    }

    const removeUpload = async (picture) => {
      if (busy.value || !props.show) return
      const key = props.show.key
      const pictureKind = kind.value
      const wasChosen = picture.id === chosenId.value
      busy.value = true
      try {
        const result = await api('DELETE', uploadRemovePathOf({ key, kind: pictureKind, id: picture.id }))
        if (props.show?.key === key && offer.value) {
          offer.value = withoutUploadOf({ offer: offer.value, id: picture.id, kind: pictureKind, chosen: result.chosen })
        }
        if (wasChosen) {
          rememberArtworkStamp({ key, kind: pictureKind, stamp: result.stamp ?? null })
          emit('changed', { kind: pictureKind })
        }
        toast({ text: wasChosen ? pictureResetText(pictureKind) : 'Picture removed' })
      } catch (err) {
        toast({ kind: 'error', text: 'Cannot remove the picture', detail: err.message })
      } finally {
        busy.value = false
      }
    }

    const pickFile = () => fileInput.value?.click()

    const onFileChosen = (event) => {
      const [file] = event.target.files || []
      event.target.value = ''
      upload(file)
    }

    const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files')

    const onDragOver = (event) => {
      if (!hasFiles(event)) return
      event.dataTransfer.dropEffect = 'copy'
      dropping.value = true
    }

    const onDragLeave = (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) dropping.value = false
    }

    const onDrop = (event) => {
      dropping.value = false
      if (hasFiles(event)) upload(event.dataTransfer.files[0])
    }

    const markFailed = (picture) => {
      failed.value = { ...failed.value, [picture.id]: true }
    }

    const tileLabel = (label, picture) => [
      picture.id === chosenId.value ? 'Current' : 'Use',
      `${label} ${kind.value}`,
      picture.caption,
    ].filter(Boolean).join(' · ')

    watch(() => [props.open, props.show?.key], ([isOpen, key], previous) => {
      if (!isOpen || !key) return stopRetry()
      if (previous?.[1] !== key) {
        offer.value = null
        failed.value = {}
        kind.value = 'background'
      }
      retries = 0
      load()
    }, { immediate: true })

    onUnmounted(stopRetry)

    return {
      kinds: PICTURE_KINDS, accept: UPLOAD_ACCEPT, kind, groups, uploaded, chosenId, searching, error, busy, uploading,
      dropping, failed, fileInput, tmdbNote, emptyText,
      choose, reset, removeUpload, pickFile, onFileChosen, onDragOver, onDragLeave, onDrop, markFailed, tileLabel,
    }
  },
}

const RETRY_MS = 4000
const MAX_RETRIES = 3
