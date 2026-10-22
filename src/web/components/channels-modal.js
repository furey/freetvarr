import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { optionLabel } from '/typeahead.js'
import { holdAtLeast } from '/pending.js'
import { HIDE_SD_COPY, hideSdPrefsOf, hideSdSwitchesOf } from '/hide-sd.js'
import { api } from '/shared/api.js'
import { loadChannelPrefs, saveChannelPrefs } from '/shared/channel-prefs.js'
import { makeStatus } from '/shared/path-check.js'
import { overlayStack } from '/overlay-stack.js'
import { keepFocusInside } from '/components/ui-sheet.js'
import { SORT_PART_COMPONENTS } from '/components/sort-parts.js'
import { useSortable } from '/shared/pin-drag.js'
import { menuMovesFor, moveItem, movedText } from '/sortable-math.js'

const CHANNEL_SORT_OPTIONS = [
  { key: 'default', label: 'Channel number' },
  { key: 'name', label: 'Name' },
]

export const ChannelsModal = {
  components: SORT_PART_COMPONENTS,
  props: ['channels', 'hiddenIds', 'sort', 'hideSdSimulcasts', 'hideSdChannels', 'startMode'],
  emits: ['close', 'saved'],
  template: `
    <div class="ui-sheet-backdrop channels-sheet-backdrop" :style="{ zIndex }" @click.self="$emit('close')">
      <section ref="sheet" :class="['ui-sheet', 'channels-sheet', { 'is-order-mode': orderMode }]" role="dialog" aria-modal="true" aria-labelledby="channels-sheet-title" tabindex="-1">
        <span class="ui-sheet-grab" aria-hidden="true"></span>
        <template v-if="orderMode">
        <header class="ui-sheet-header">
          <h2 id="channels-sheet-title" class="ui-sheet-title">Favourite order</h2>
        </header>
        <p class="ui-meta channels-order-hint">Drag <sort-grip-icon class="icon-inline" /> to move a channel, or use <more-glyph class="icon-inline" />.</p>
        <transition-group ref="orderListRef" name="channels-order-rows" tag="div" class="ui-group channels-order-list">
          <div v-for="(id, i) in pinnedDraft" :key="id" :data-sort-id="id" class="ui-group-row channels-order-row">
            <span class="channels-order-number" aria-hidden="true">{{ positionOf(id) }}</span>
            <span class="channels-order-logo"><channel-logo :channel-id="id" :has-logo="hasLogoOf(id)" /></span>
            <span class="ui-group-row-main channels-row-name"><span class="channels-row-title">{{ draftName(id) }}</span></span>
            <button type="button" class="channels-order-more" data-sort-menu :aria-label="'Move ' + draftName(id)" aria-haspopup="menu"
              :aria-expanded="String(menuFor === id)" @click="openMenu(id, $event)"><more-glyph /></button>
            <button type="button" class="sort-handle channels-order-handle" data-sort-handle aria-roledescription="sortable"
              :aria-label="'Reorder ' + draftName(id) + ', position ' + (i + 1) + ' of ' + pinnedDraft.length + '. Press Space to pick up.'"
              @pointerdown="sorter.onPointerDown(id, $event)" @keydown="sorter.onKeydown(id, $event)" @blur="sorter.onBlur(id)"><sort-grip-icon /></button>
          </div>
        </transition-group>
        <div v-if="menuFor" class="channels-order-menu-backdrop" @click="closeMenu"></div>
        <div v-if="menuFor" ref="menuEl" class="channels-order-menu" role="menu" :style="menuStyle" :aria-label="'Move ' + draftName(menuFor)">
          <button v-for="move in menuMoves" :key="move.key" type="button" role="menuitem" class="channels-order-menu-item"
            @click="applyMenuMove(move)">{{ move.label }}</button>
          <hr v-if="menuMoves.length" class="channels-order-menu-rule" />
          <button type="button" role="menuitem" class="channels-order-menu-item is-quiet" @click="removeFromOrder(menuFor)">Remove from favourites</button>
        </div>
        <sort-announcer :message="sorter.announcement.value" :keyboard-active="sorter.keyboardActive.value" />
        <div class="ui-sheet-footer channels-footer">
          <span v-if="statusText" :class="['status-readout', statusKind]" role="status">{{ statusText }}</span>
          <div class="channels-footer-buttons is-order">
            <button type="button" class="ui-button ui-button-secondary" @click="cancelOrder">Cancel</button>
            <button type="button" :class="['ui-button', 'ui-button-primary', { 'is-pending': savingPrefs }]" @click="finishOrder" :disabled="savingPrefs" :aria-busy="savingPrefs">
              <span v-if="savingPrefs" class="spinner" aria-hidden="true"></span>{{ savingPrefs ? 'Saving…' : 'Done' }}
            </button>
          </div>
        </div>
        </template>
        <template v-else>
        <header class="ui-sheet-header">
          <h2 id="channels-sheet-title" class="ui-sheet-title">Channels</h2>
          <info-button title="Channels" doc="guide/tv-guide#favourites" piece="tuner">
            <p>Favourites sit at the top of Live TV and the TV guide, in the order set here. Press a star to add or remove a favourite, and press Edit order to change the order.</p>
            <p>Turn a channel off to hide it from both pages. A favourite is always shown. The sort order, Hide SD simulcasts, and Hide SD channels apply to the other channels.</p>
            <p>Each channel's shows come from a channel in the TV guide you set up. If a channel shows the wrong shows, or none, press the pencil and pick the guide channel that matches it. Tick to keep the pick, or cross to drop it. Pick No listings to remove its shows. A new pick can take a minute to show in the Guide.</p>
          </info-button>
          <button type="button" class="ui-icon-button is-plain" @click="$emit('close')" aria-label="Close"><close-glyph /></button>
        </header>
        <div class="channels-grid">
          <div class="channels-settings">
            <section class="channels-section" aria-labelledby="channels-favourites-label">
              <div class="channels-favourites-head">
                <h3 id="channels-favourites-label" class="ui-label">Favourites, shown first in this order</h3>
                <button v-if="pinnedDraft.length >= 2" type="button" class="sort-edit-order" @click="enterOrderMode">Edit order</button>
              </div>
              <p v-if="pinnedDraft.length === 0" class="ui-meta">
                No favourites yet. Tap the <span class="whitespace-nowrap"><star-icon class="icon-inline" /> next</span> to a channel below, in the TV guide rail, or in Live TV.
              </p>
              <div v-else class="ui-group">
                <div v-for="id in shownFavourites" :key="id" class="ui-group-row channels-pin-row">
                  <button type="button" class="epg-pin pinned" @click="toggleDraftPin(id)"
                    title="Remove from favourites" :aria-label="'Remove ' + draftName(id) + ' from favourites'"><star-icon /></button>
                  <span class="channels-order-logo"><channel-logo :channel-id="id" :has-logo="hasLogoOf(id)" /></span>
                  <span class="ui-group-row-main channels-row-name"><span class="channels-row-title">{{ draftName(id) }}</span></span>
                </div>
              </div>
              <button v-if="hiddenFavouriteCount > 0" type="button" class="channels-more-favourites"
                @click="showAllFavourites = true">+{{ hiddenFavouriteCount }} more</button>
            </section>
            <section class="channels-section" aria-labelledby="channels-sort-label">
              <h3 id="channels-sort-label" class="ui-label">Sort other channels by</h3>
              <ui-segmented fill v-model="sortDraft" aria-labelledby="channels-sort-label"
                :options="CHANNEL_SORT_OPTIONS.map((s) => ({ value: s.key, label: s.label }))" />
            </section>
            <div class="ui-group">
              <div class="ui-group-row">
                <span class="ui-group-row-main">
                  <span class="ui-group-row-title">{{ copy.simulcasts.title }}</span>
                  <span class="ui-group-row-meta">{{ copy.simulcasts.meta }}</span>
                </span>
                <toggle-switch :aria-label="copy.simulcasts.title"
                  :model-value="switches.simulcastsOn" :disabled="switches.simulcastsLocked"
                  @update:model-value="setHideSd({ hideSdSimulcasts: $event })" />
              </div>
              <div class="ui-group-row">
                <span class="ui-group-row-main">
                  <span class="ui-group-row-title">{{ copy.channels.title }}</span>
                  <span class="ui-group-row-meta">{{ copy.channels.meta }}</span>
                </span>
                <toggle-switch :aria-label="copy.channels.title" :model-value="switches.channelsOn"
                  @update:model-value="setHideSd({ hideSdChannels: $event })" />
              </div>
            </div>
            <p class="ui-meta">
              Each channel's shows come from the TV guide you set up (for example the Sydney guide). If a channel shows the wrong shows, or none, <span class="whitespace-nowrap">press <pencil-icon class="icon-inline" /> and</span> pick the guide channel that matches it.
            </p>
          </div>
          <section class="channels-list" aria-labelledby="channels-all-label">
            <h3 id="channels-all-label" class="ui-label">All channels</h3>
            <p v-if="guideLoadError" class="status-readout err">{{ guideLoadError }}</p>
            <p v-else-if="guideLinks && !guideLinks.ready" class="ui-meta">
              Set up the TV guide first to change the listings of a channel. <a href="#/settings/system/setup/guide" @click="$emit('close')">Set up the guide</a>.
            </p>
            <div class="ui-group">
              <div v-for="ch in listedChannels" :key="ch.id" class="ui-group-row channels-row" @keydown.esc="onRowEscape">
                <div class="channels-row-line">
                  <button type="button" :class="['epg-pin', { pinned: pinnedDraft.includes(String(ch.id)) }]"
                    @click="toggleDraftPin(String(ch.id))"
                    :title="pinnedDraft.includes(String(ch.id)) ? 'Remove from favourites' : 'Add to favourites'"
                    :aria-label="pinnedDraft.includes(String(ch.id)) ? 'Remove ' + ch.name + ' from favourites' : 'Add ' + ch.name + ' to favourites'"><star-icon /></button>
                  <span class="ui-group-row-main channels-row-name">
                    <span class="channels-row-number">{{ paddedNumber(ch.number) }}</span>
                    <span class="channels-row-title">{{ ch.name }}</span>
                    <span :class="['channels-format', ch.hd ? 'is-hd' : 'is-sd']" :title="ch.hd ? 'High definition' : 'Standard definition'">{{ ch.hd ? 'HD' : 'SD' }}</span>
                  </span>
                  <template v-if="guideLoading">
                    <span class="channels-row-source">Reading…</span>
                    <button type="button" class="ui-icon-button is-plain" disabled
                      title="Reading the listings" aria-label="Reading the listings"><pencil-icon /></button>
                  </template>
                  <template v-else-if="showGuideColumn && String(ch.id) in guideDraft">
                    <span :class="['channels-row-source', { 'is-changed': isGuideChanged(ch) }]"
                      :title="isGuideChanged(ch) ? 'Changed; Save writes it' : null">{{ guideNameFor(guideDraft[String(ch.id)]) }}</span>
                    <button type="button" class="ui-icon-button is-plain" @click="startGuideEdit(ch)"
                      :title="'Change guide source for ' + ch.name" :aria-label="'Change guide source for ' + ch.name"><pencil-icon /></button>
                  </template>
                  <toggle-switch
                    :model-value="!hiddenDraft.has(String(ch.id))"
                    :disabled="pinnedDraft.includes(String(ch.id))"
                    :title="pinnedDraft.includes(String(ch.id)) ? 'Favourites are always shown' : null"
                    :aria-label="'Show ' + ch.name" @update:model-value="toggleHidden(ch)" />
                </div>
                <div v-if="editingId === String(ch.id)" class="channels-row-edit">
                  <guide-combobox class="channels-row-combobox" v-model="editValue" :options="guideLinks.options"
                    none-label="No listings" :label="'Listings for ' + ch.name" autofocus
                    @confirm="confirmGuideEdit" />
                  <button type="button" class="ui-icon-button" @click="confirmGuideEdit"
                    title="Use this guide source" aria-label="Use this guide source"><check-icon /></button>
                  <button type="button" class="ui-icon-button" @click="cancelGuideEdit"
                    title="Keep the current guide source" aria-label="Keep the current guide source"><cross-icon /></button>
                </div>
              </div>
            </div>
          </section>
        </div>
        <p v-if="guideStatusText" :class="['status-readout', guideStatusKind]">{{ guideStatusText }}</p>
        <div class="ui-sheet-footer channels-footer">
          <span v-if="statusText" :class="['status-readout', statusKind]" role="status">{{ statusText }}</span>
          <div class="channels-footer-buttons">
            <button type="button" class="ui-button ui-button-secondary" @click="$emit('close')">Cancel</button>
            <button type="button" :class="['ui-button', 'ui-button-primary', { 'is-pending': savingPrefs }]" @click="save" :disabled="savingPrefs || guideLoading" :aria-busy="savingPrefs">
              <span v-if="savingPrefs" class="spinner" aria-hidden="true"></span>{{ savingPrefs ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
        </template>
      </section>
    </div>
  `,
  setup(props, { emit }) {
    const pinnedDraft = ref(props.channels.filter((c) => c.pinned).map((c) => String(c.id)))
    const hiddenDraft = ref(new Set((props.hiddenIds || []).map(String)))
    const sortDraft = ref(props.sort === 'name' ? 'name' : 'default')
    const hideSdDraft = ref(Boolean(props.hideSdSimulcasts))
    const hideSdChannelsDraft = ref(Boolean(props.hideSdChannels))
    const switches = computed(() => hideSdSwitchesOf({
      hideSdSimulcasts: hideSdDraft.value,
      hideSdChannels: hideSdChannelsDraft.value,
    }))
    let hideSdTouched = false
    const setHideSd = ({ hideSdSimulcasts, hideSdChannels }) => {
      hideSdTouched = true
      if (hideSdSimulcasts != null) hideSdDraft.value = hideSdSimulcasts
      if (hideSdChannels != null) hideSdChannelsDraft.value = hideSdChannels
    }
    const refreshHideSd = async () => {
      const saved = await loadChannelPrefs().catch(() => null)
      if (!saved || hideSdTouched) return
      const fresh = hideSdPrefsOf(saved)
      hideSdDraft.value = fresh.hideSdSimulcasts
      hideSdChannelsDraft.value = fresh.hideSdChannels
    }
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

    const sheet = ref(null)
    const layer = overlayStack.push({ onBack: () => emit('close') })
    const zIndex = ref(layer.zIndex)
    let returnFocus = null
    const onKeydown = (event) => {
      if (!overlayStack.isTop(layer.id)) return
      if (event.key === 'Tab') return keepFocusInside({ event, root: sheet.value })
      if (event.key !== 'Escape' || editingId.value !== null || sorter.isActive()) return
      event.stopImmediatePropagation()
      if (menuFor.value) return closeMenu({ refocus: true })
      if (orderMode.value) return cancelOrder()
      emit('close')
    }

    onMounted(async () => {
      try { document.body.classList.add('sheet-open') } catch { /* ignore */ }
      returnFocus = document.activeElement
      window.addEventListener('keydown', onKeydown, true)
      loadGuideLinks()
      refreshHideSd()
      await nextTick()
      sheet.value?.focus()
    })
    onUnmounted(() => {
      window.removeEventListener('keydown', onKeydown, true)
      overlayStack.remove(layer.id)
      try { document.body.classList.toggle('sheet-open', overlayStack.size() > 0) } catch { /* ignore */ }
      returnFocus?.focus?.()
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

    const hasLogoOf = (id) => {
      const channel = props.channels.find((c) => String(c.id) === String(id))
      return Boolean(channel?.hasLogo || channel?.logos?.length)
    }

    const showAllFavourites = ref(false)
    const shownFavourites = computed(() => (showAllFavourites.value
      ? pinnedDraft.value
      : pinnedDraft.value.slice(0, IDLE_FAVOURITES_SHOWN)))
    const hiddenFavouriteCount = computed(() => pinnedDraft.value.length - shownFavourites.value.length)

    const orderMode = ref(props.startMode === 'order')
    const openedInOrderMode = props.startMode === 'order'
    let orderSnapshot = [...pinnedDraft.value]
    const orderListRef = ref(null)
    const menuFor = ref(null)
    const menuStyle = ref({})
    const menuEl = ref(null)

    const sorter = useSortable({
      listEl: () => orderListRef.value?.$el,
      ids: () => pinnedDraft.value,
      nameOf: draftName,
      onDrop: ({ order }) => { pinnedDraft.value = order },
    })

    const positionOf = (id) => (sorter.previewOrder.value || pinnedDraft.value).indexOf(id) + 1

    const enterOrderMode = () => {
      orderSnapshot = [...pinnedDraft.value]
      orderMode.value = true
      nextTick(() => sheet.value?.focus())
    }

    const leaveOrderMode = () => {
      closeMenu()
      if (openedInOrderMode) return emit('close')
      orderMode.value = false
      nextTick(() => sheet.value?.focus())
    }

    const cancelOrder = () => {
      pinnedDraft.value = orderSnapshot
      leaveOrderMode()
    }

    const finishOrder = async () => {
      savingPrefs.value = true
      const saved = await holdAtLeast({ task: savePrefs })
      savingPrefs.value = false
      if (!saved) return
      if (openedInOrderMode) return emit('saved', { listingsLoading: false })
      orderSnapshot = [...pinnedDraft.value]
      setStatus('Order saved.', 'ok')
      leaveOrderMode()
    }

    const menuMoves = computed(() => (menuFor.value
      ? menuMovesFor({ index: pinnedDraft.value.indexOf(menuFor.value), count: pinnedDraft.value.length })
      : []))

    const openMenu = (id, event) => {
      const button = event.currentTarget.getBoundingClientRect()
      const box = sheet.value.getBoundingClientRect()
      menuStyle.value = {
        top: `${button.bottom - box.top + sheet.value.scrollTop + 4}px`,
        right: `${box.right - button.right}px`,
      }
      menuFor.value = id
      nextTick(() => menuEl.value?.querySelector('button')?.focus())
    }

    const focusMenuButtonOf = (id) => nextTick(() =>
      orderListRef.value?.$el?.querySelector(`[data-sort-id="${id}"] [data-sort-menu]`)?.focus())

    const closeMenu = ({ refocus = false } = {}) => {
      const id = menuFor.value
      menuFor.value = null
      if (refocus && id) focusMenuButtonOf(id)
    }

    const applyMenuMove = (move) => {
      const id = menuFor.value
      const from = pinnedDraft.value.indexOf(id)
      pinnedDraft.value = moveItem({ list: pinnedDraft.value, from, to: move.to })
      menuFor.value = null
      sorter.announce(movedText({ name: draftName(id), index: move.to, count: pinnedDraft.value.length }))
      focusMenuButtonOf(id)
    }

    const removeFromOrder = (id) => {
      menuFor.value = null
      toggleDraftPin(id)
      sorter.announce(`${draftName(id)} removed from favourites.`)
      if (pinnedDraft.value.length === 0) leaveOrderMode()
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
        await saveChannelPrefs({
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
      const prefsSaved = await holdAtLeast({ task: savePrefs })
      if (prefsSaved) setStatus('Channels saved.', 'ok')
      const links = await saveGuideLinks()
      savingPrefs.value = false
      if (prefsSaved && links.saved) emit('saved', { listingsLoading: links.listingsLoading })
    }

    return {
      CHANNEL_SORT_OPTIONS, pinnedDraft, hiddenDraft, sortDraft, copy: HIDE_SD_COPY, switches, setHideSd, listedChannels, savingPrefs,
      statusText, statusKind, draftName, toggleDraftPin, toggleHidden, save,
      hasLogoOf, showAllFavourites, shownFavourites, hiddenFavouriteCount,
      orderMode, orderListRef, sorter, positionOf, enterOrderMode, cancelOrder, finishOrder,
      menuFor, menuStyle, menuEl, menuMoves, openMenu, closeMenu, applyMenuMove, removeFromOrder,
      guideLinks, guideLoading, guideLoadError, guideDraft, showGuideColumn, guideStatusText, guideStatusKind,
      editingId, editValue, guideNameFor, isGuideChanged, startGuideEdit, cancelGuideEdit, confirmGuideEdit,
      onRowEscape, paddedNumber, sheet, zIndex,
    }
  },
}

const IDLE_FAVOURITES_SHOWN = 5

export const togglePinnedChannel = async ({ pinnedIds, channelId }) => {
  const key = String(channelId)
  const next = pinnedIds.includes(key) ? pinnedIds.filter((id) => id !== key) : [...pinnedIds, key]
  await saveChannelPrefs({ pinned_ids: next })
}
