import { ref, computed, watch, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import {
  PICTURE_KINDS,
  artworkPathOf,
  candidatesPathOf,
  emptyPicturesText,
  pictureChangedText,
  pictureGroupsOf,
  pictureResetText,
  tmdbNoteOf,
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
      <div class="ui-chip-row picture-kinds" role="group" aria-label="Picture">
        <button v-for="option in kinds" :key="option.key" type="button" class="ui-chip"
          :aria-pressed="String(kind === option.key)" @click="kind = option.key">{{ option.label }}</button>
      </div>
      <div class="picture-body" :aria-busy="String(loading)">
        <div v-if="loading && !groups.length" :class="['picture-grid', 'is-' + kind]">
          <span v-for="n in 4" :key="n" class="ui-skeleton picture-tile"></span>
        </div>
        <p v-else-if="error" class="picture-note is-error" role="alert">Cannot load pictures: {{ error }}</p>
        <p v-else-if="!groups.length" class="picture-note">{{ emptyText }}</p>
        <section v-for="group in groups" :key="group.source" class="picture-group" :aria-label="group.label">
          <h3 class="picture-source">{{ group.label }}</h3>
          <div :class="['picture-grid', 'is-' + kind]">
            <button v-for="picture in group.pictures" v-show="!failed[picture.id]" :key="picture.id" type="button"
              :class="['picture-tile', { 'is-chosen': picture.id === chosenId }]" :aria-pressed="String(picture.id === chosenId)"
              :aria-label="tileLabel(group, picture)" :disabled="busy" @click="choose(picture)">
              <img :src="picture.url" alt="" loading="lazy" @error="markFailed(picture)" />
              <span v-if="picture.caption" class="picture-caption">{{ picture.caption }}</span>
              <span v-if="picture.id === chosenId" class="picture-tick" aria-hidden="true"><menu-icon name="check" /></span>
            </button>
          </div>
        </section>
        <p v-if="tmdbNote && !loading" class="picture-note">{{ tmdbNote }}</p>
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
    const error = ref('')
    const busy = ref(false)
    const failed = ref({})
    let retryTimer = null
    let retries = 0
    let loadSeq = 0

    const groups = computed(() => pictureGroupsOf({ candidates: offer.value?.candidates || [], kind: kind.value }))
    const chosenId = computed(() => offer.value?.chosen?.[kind.value] || null)
    const tmdbNote = computed(() => (offer.value ? tmdbNoteOf({ kind: kind.value, tmdbKey: offer.value.tmdbKey }) : ''))
    const emptyText = computed(() => emptyPicturesText(kind.value))

    const stopRetry = () => {
      clearTimeout(retryTimer)
      retryTimer = null
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

    const change = async ({ id, text }) => {
      if (busy.value || !props.show) return
      const key = props.show.key
      const pictureKind = kind.value
      const previous = chosenId.value
      busy.value = true
      try {
        await apply({ key, pictureKind, id })
        toast({ text, action: { label: 'Undo', run: () => undo({ key, pictureKind, id: previous }) } })
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

    const markFailed = (picture) => {
      failed.value = { ...failed.value, [picture.id]: true }
    }

    const tileLabel = (group, picture) => [
      picture.id === chosenId.value ? 'Current' : 'Use',
      `${group.label} ${kind.value}`,
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
      kinds: PICTURE_KINDS, kind, groups, chosenId, loading, error, busy, failed, tmdbNote, emptyText,
      choose, reset, markFailed, tileLabel,
    }
  },
}

const RETRY_MS = 4000
const MAX_RETRIES = 3
