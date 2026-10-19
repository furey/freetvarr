import { ref, reactive, computed, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { optionLabel } from '/typeahead.js'
import { api } from '/shared/api.js'
import { makeStatus } from '/shared/path-check.js'

const CHANNEL_SORT_OPTIONS = [
  { key: 'default', label: 'TVH ORDER' },
  { key: 'number', label: 'NUMBER' },
  { key: 'name', label: 'NAME' },
]

export const ChannelsModal = {
  props: ['channels', 'hiddenIds', 'sort', 'hideSdSimulcasts', 'hideSdChannels'],
  emits: ['close', 'saved'],
  template: `
    <div class="epg-modal-backdrop" @click.self="$emit('close')">
      <section class="panel epg-modal channels-modal">
        <header class="panel-header">
          <span class="panel-heading">
            <span class="panel-title">CHANNELS</span>
            <info-button title="Channels" doc="guide/tv-guide#favourites">
              <p>Favourites sit at the top of <strong>LIVE TV</strong> and the <strong>TV GUIDE</strong>, in the order set here. Press a star to add or remove a favourite, and use the arrows to change the order.</p>
              <p>Untick a channel to hide it from both pages. A favourite is always shown. The sort order, <strong>HIDE SD SIMULCASTS</strong>, and <strong>HIDE SD CHANNELS</strong> apply to the other channels.</p>
              <p>Each channel's shows come from a channel in the TV guide you set up. If a channel shows the wrong shows, or none, press the pencil and pick the guide channel that matches it. Tick to keep the pick, or cross to drop it. Pick <strong>No listings</strong> to remove its shows. A new pick can take a minute to show in the <strong>TV GUIDE</strong>.</p>
            </info-button>
          </span>
          <button type="button" class="btn btn-icon epg-modal-x" @click="$emit('close')" aria-label="Close"><cross-icon /></button>
        </header>
        <div class="panel-body channels-body">
          <div class="channels-grid">
          <div class="channels-settings space-y-5">
          <div>
            <label class="field-label">FAVOURITES · SHOWN FIRST, IN THIS ORDER</label>
            <p v-if="pinnedDraft.length === 0" class="text-xs text-ink-dim">
              No favourites yet. Tap the <span class="whitespace-nowrap"><star-icon class="icon-inline" /> next</span> to a channel below, in the TV Guide rail, or in Live TV.
            </p>
            <ul v-else class="space-y-1.5">
              <li v-for="(id, i) in pinnedDraft" :key="id" class="flex items-center gap-2">
                <button type="button" class="btn btn-sm btn-icon" :disabled="i === 0"
                  @click="movePin(i, -1)" :title="'Move up'" :aria-label="'Move ' + draftName(id) + ' up'"><arrow-up-icon /></button>
                <button type="button" class="btn btn-sm btn-icon" :disabled="i === pinnedDraft.length - 1"
                  @click="movePin(i, 1)" :title="'Move down'" :aria-label="'Move ' + draftName(id) + ' down'"><arrow-down-icon /></button>
                <button type="button" class="epg-pin pinned" @click="toggleDraftPin(id)"
                  title="Remove from favourites" :aria-label="'Remove ' + draftName(id) + ' from favourites'"><star-icon /></button>
                <span class="font-mono text-[0.8rem] flex-1 min-w-0 truncate">{{ draftName(id) }}</span>
              </li>
            </ul>
          </div>
          <div>
            <label class="field-label">SORT OTHER CHANNELS BY</label>
            <div class="chip-row">
              <button v-for="s in CHANNEL_SORT_OPTIONS" :key="s.key" type="button"
                :class="['btn', 'btn-sm', sortDraft === s.key ? 'btn-on' : '']"
                @click="sortDraft = s.key">{{ s.label }}</button>
            </div>
          </div>
          <div>
            <label class="flex items-center gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" class="chk" :checked="hideSdChannelsDraft || hideSdDraft"
                :disabled="hideSdChannelsDraft" @change="hideSdDraft = $event.target.checked" />
              <span class="font-mono text-[0.8rem]">HIDE SD SIMULCASTS</span>
            </label>
            <p class="text-xs text-ink-dim mt-1.5">
              Hides an SD channel only when its HD twin is in the lineup (10 next to 10 HD, Nine next to 9HD). SD-only channels stay. Applies to the grid and search; a favourite is never hidden. <template v-if="hideSdChannelsDraft">HIDE SD CHANNELS already hides these.</template>
            </p>
          </div>
          <div>
            <label class="flex items-center gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" class="chk" v-model="hideSdChannelsDraft" />
              <span class="font-mono text-[0.8rem]">HIDE SD CHANNELS</span>
            </label>
            <p class="text-xs text-ink-dim mt-1.5">
              Shows only HD channels. SD-only channels (for example 7flix) are hidden too. Applies to the grid, search, and Live TV; a favourite is never hidden.
            </p>
          </div>
          <p class="text-xs text-ink-dim">
            Each channel's shows come from the TV guide you set up (for example the Sydney guide). If a channel shows the wrong shows, or none, <span class="whitespace-nowrap">press <pencil-icon class="icon-inline" /> and</span> pick the guide channel that matches it.
          </p>
          </div>
          <div class="channels-list">
            <label class="field-label">ALL CHANNELS · <span class="whitespace-nowrap"><star-icon class="icon-inline" />&nbsp;FAVOURITE,</span> TICK TO SHOW, <span class="whitespace-nowrap"><pencil-icon class="icon-inline" />&nbsp;CHANGE GUIDE SOURCE</span></label>
            <p v-if="guideLoadError" class="status-readout err mb-2">{{ guideLoadError }}</p>
            <p v-else-if="guideLinks && !guideLinks.ready" class="text-xs text-ink-dim mb-2">
              Set up the TV guide first to change the listings of a channel. <a href="#/welcome" @click="$emit('close')">Open the setup wizard</a> and go to its GUIDE step.
            </p>
            <div class="grid grid-cols-1 gap-y-2">
              <div v-for="ch in listedChannels" :key="ch.id" class="flex flex-col gap-1.5"
                @keydown.esc="onRowEscape">
                <div class="flex items-center gap-2">
                  <button type="button" :class="['epg-pin', { pinned: pinnedDraft.includes(String(ch.id)) }]"
                    @click="toggleDraftPin(String(ch.id))"
                    :title="pinnedDraft.includes(String(ch.id)) ? 'Remove from favourites' : 'Add to favourites'"
                    :aria-label="pinnedDraft.includes(String(ch.id)) ? 'Remove ' + ch.name + ' from favourites' : 'Add ' + ch.name + ' to favourites'"><star-icon /></button>
                  <label class="flex flex-1 items-center gap-2.5 text-sm cursor-pointer min-w-0"
                    :title="pinnedDraft.includes(String(ch.id)) ? 'Favourites are always shown' : null">
                    <input type="checkbox" class="chk shrink-0"
                      :checked="!hiddenDraft.has(String(ch.id))"
                      :disabled="pinnedDraft.includes(String(ch.id))"
                      @change="toggleHidden(ch)" />
                    <span class="flex items-center gap-1.5 min-w-0">
                      <span :class="['pill pill-format pill-slot shrink-0', ch.hd ? 'pill-hd' : 'pill-sd']"
                        :title="ch.hd ? 'High definition' : 'Standard definition'">{{ ch.hd ? 'HD' : 'SD' }}</span>
                      <span class="font-mono text-[0.8rem] truncate">
                        <span class="text-ink-mute">{{ paddedNumber(ch.number) }}</span>
                        {{ ch.name }}
                      </span>
                    </span>
                  </label>
                  <template v-if="guideLoading">
                    <span class="font-mono text-[0.7rem] truncate max-w-[40%] sm:max-w-[16rem] text-ink-mute">Reading…</span>
                    <button type="button" class="btn btn-sm btn-icon shrink-0" disabled
                      title="Reading the listings" aria-label="Reading the listings"><pencil-icon /></button>
                  </template>
                  <template v-else-if="showGuideColumn && String(ch.id) in guideDraft">
                    <span :class="['font-mono text-[0.7rem] truncate max-w-[40%] sm:max-w-[16rem]', isGuideChanged(ch) ? 'text-signal-orange-hi' : 'text-ink-dim']"
                      :title="isGuideChanged(ch) ? 'Changed; SAVE writes it' : null">{{ guideNameFor(guideDraft[String(ch.id)]) }}</span>
                    <button type="button" class="btn btn-sm btn-icon shrink-0" @click="startGuideEdit(ch)"
                      :title="'Change guide source for ' + ch.name" :aria-label="'Change guide source for ' + ch.name"><pencil-icon /></button>
                  </template>
                </div>
                <div v-if="editingId === String(ch.id)" class="flex items-center gap-2 pl-6">
                  <guide-combobox class="flex-1 min-w-0" v-model="editValue" :options="guideLinks.options"
                    none-label="No listings" :label="'Listings for ' + ch.name" autofocus
                    @confirm="confirmGuideEdit" />
                  <button type="button" class="btn btn-sm btn-icon shrink-0" @click="confirmGuideEdit"
                    title="Use this guide source" aria-label="Use this guide source"><check-icon /></button>
                  <button type="button" class="btn btn-sm btn-icon shrink-0" @click="cancelGuideEdit"
                    title="Keep the current guide source" aria-label="Keep the current guide source"><cross-icon /></button>
                </div>
              </div>
            </div>
          </div>
          </div>
          <p v-if="guideStatusText" :class="['status-readout', guideStatusKind, 'text-right']">{{ guideStatusText }}</p>
          <div class="epg-modal-actions flex items-center justify-end gap-2 pt-1">
            <span v-if="statusText" :class="['status-readout', statusKind]">{{ statusText }}</span>
            <button type="button" class="btn btn-sm btn-primary" @click="save" :disabled="savingPrefs || guideLoading">
              {{ savingPrefs ? 'SAVING…' : 'SAVE' }}
            </button>
          </div>
        </div>
      </section>
    </div>
  `,
  setup(props, { emit }) {
    const pinnedDraft = ref(props.channels.filter((c) => c.pinned).map((c) => String(c.id)))
    const hiddenDraft = ref(new Set((props.hiddenIds || []).map(String)))
    const sortDraft = ref(props.sort || 'default')
    const hideSdDraft = ref(Boolean(props.hideSdSimulcasts))
    const hideSdChannelsDraft = ref(Boolean(props.hideSdChannels))
    const listedChannels = computed(() => (hideSdChannelsDraft.value
      ? props.channels.filter((c) => c.hd || pinnedDraft.value.includes(String(c.id)))
      : props.channels))
    const channelNumberWidth = computed(() =>
      Math.max(2, ...props.channels.map((c) => String(c.number ?? '').length)))
    const paddedNumber = (number) => (number == null ? '' : String(number).padStart(channelNumberWidth.value, '0'))
    const savingPrefs = ref(false)
    const [statusText, statusKind, setStatus] = makeStatus()
    const [guideStatusText, guideStatusKind, setGuideStatus] = makeStatus()
    const guideLinks = ref(null)
    const guideLoading = ref(true)
    const guideLoadError = ref('')
    const guideSaved = ref({})
    const guideDraft = reactive({})
    const showGuideColumn = computed(() => Boolean(guideLinks.value?.ready))
    const editingId = ref(null)
    const editValue = ref('')

    const guideNameFor = (guideIds) =>
      optionLabel({ options: guideLinks.value?.options || [], value: guideIds, noneLabel: 'No listings' })
    const isGuideChanged = (ch) => guideDraft[String(ch.id)] !== guideSaved.value[String(ch.id)]
    const startGuideEdit = (ch) => {
      editingId.value = String(ch.id)
      editValue.value = guideDraft[String(ch.id)]
    }
    const cancelGuideEdit = () => { editingId.value = null }
    const onRowEscape = (e) => {
      if (editingId.value === null) return
      e.stopPropagation()
      cancelGuideEdit()
    }
    const confirmGuideEdit = () => {
      if (editingId.value === null) return
      guideDraft[editingId.value] = editValue.value
      editingId.value = null
    }

    const loadGuideLinks = async () => {
      try {
        const links = await api('GET', '/api/tvh-guide/links')
        const picks = Object.fromEntries(links.channels.map((c) => [String(c.id), c.guideIds.join(',')]))
        guideSaved.value = picks
        Object.assign(guideDraft, picks)
        guideLinks.value = links
      } catch (err) {
        guideLoadError.value = `Freetvarr could not read the listings: ${err.message}`
      } finally {
        guideLoading.value = false
      }
    }

    onMounted(() => {
      try { document.body.classList.add('sheet-open') } catch { /* ignore */ }
      loadGuideLinks()
    })
    onUnmounted(() => {
      try { document.body.classList.remove('sheet-open') } catch { /* ignore */ }
    })

    const draftName = (id) => props.channels.find((c) => String(c.id) === String(id))?.name || `channel ${id}`

    const toggleDraftPin = (id) => {
      if (pinnedDraft.value.includes(id)) {
        pinnedDraft.value = pinnedDraft.value.filter((p) => p !== id)
        return
      }
      pinnedDraft.value = [...pinnedDraft.value, id]
      const next = new Set(hiddenDraft.value)
      next.delete(id)
      hiddenDraft.value = next
    }

    const movePin = (i, delta) => {
      const next = [...pinnedDraft.value]
      const [moved] = next.splice(i, 1)
      next.splice(i + delta, 0, moved)
      pinnedDraft.value = next
    }

    const toggleHidden = (ch) => {
      const next = new Set(hiddenDraft.value)
      const key = String(ch.id)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      hiddenDraft.value = next
    }

    const savePrefs = async () => {
      try {
        await api('PUT', '/api/epg/channel-prefs', {
          pinned_ids: pinnedDraft.value,
          hidden_ids: [...hiddenDraft.value],
          sort: sortDraft.value,
          hide_sd_simulcasts: hideSdDraft.value,
          hide_sd_channels: hideSdChannelsDraft.value,
        })
        return true
      } catch (err) {
        setStatus(`Save failed: ${err.message}`, 'err', 8000)
        return false
      }
    }

    const changedGuideLinks = () => Object.entries(guideDraft)
      .filter(([id, guideId]) => guideSaved.value[id] !== guideId)
      .map(([channel_id, guide_id]) => ({ channel_id, guide_id }))

    const saveGuideLinks = async () => {
      const links = changedGuideLinks()
      if (!links.length) return { saved: true, listingsLoading: false }
      try {
        const result = await api('POST', '/api/tvh-guide/links', { links })
        guideSaved.value = { ...guideDraft }
        return { saved: true, listingsLoading: Boolean(result.loading?.length) }
      } catch (err) {
        setGuideStatus(`Listings not saved: ${err.message}`, 'err', 0)
        return { saved: false, listingsLoading: false }
      }
    }

    const save = async () => {
      savingPrefs.value = true
      const prefsSaved = await savePrefs()
      if (prefsSaved) setStatus('Channels saved.', 'ok')
      const links = await saveGuideLinks()
      savingPrefs.value = false
      if (prefsSaved && links.saved) emit('saved', { listingsLoading: links.listingsLoading })
    }

    return {
      CHANNEL_SORT_OPTIONS, pinnedDraft, hiddenDraft, sortDraft, hideSdDraft, hideSdChannelsDraft, listedChannels, savingPrefs,
      statusText, statusKind, draftName, toggleDraftPin, movePin, toggleHidden, save,
      guideLinks, guideLoading, guideLoadError, guideDraft, showGuideColumn, guideStatusText, guideStatusKind,
      editingId, editValue, guideNameFor, isGuideChanged, startGuideEdit, cancelGuideEdit, confirmGuideEdit,
      onRowEscape, paddedNumber,
    }
  },
}

export const togglePinnedChannel = async ({ pinnedIds, channelId }) => {
  const key = String(channelId)
  const next = pinnedIds.includes(key) ? pinnedIds.filter((id) => id !== key) : [...pinnedIds, key]
  await api('PUT', '/api/epg/channel-prefs', { pinned_ids: next })
}
