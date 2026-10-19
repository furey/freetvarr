import { ref, onUnmounted, watch, nextTick } from '/vendor/vue.esm-browser.prod.js'

let filterSheetCount = 0

export const ConfirmDialog = {
  props: {
    open: Boolean,
    dialog: { type: Object, default: null },
    busy: Boolean,
    icon: { type: String, default: '' },
  },
  emits: ['confirm', 'cancel'],
  template: `
    <teleport to="body">
      <transition name="epg-sheet">
        <div v-if="open && dialog" class="epg-modal-backdrop" @click.self="cancel">
          <section ref="dialogEl" class="panel epg-modal info-modal" role="alertdialog" aria-modal="true"
            :aria-labelledby="headingId" :aria-describedby="bodyId" tabindex="-1">
            <header class="panel-header">
              <span :id="headingId" class="panel-title">{{ dialog.title }}</span>
              <button type="button" class="btn btn-icon epg-modal-x" @click="cancel" aria-label="Close"><cross-icon /></button>
            </header>
            <div class="panel-body space-y-4">
              <div :id="bodyId" class="space-y-3">
                <p v-for="(line, i) in dialog.body" :key="i" class="text-sm text-ink confirm-dialog-line">{{ line }}</p>
              </div>
              <div class="epg-modal-actions flex flex-wrap items-center justify-end gap-2">
                <button type="button" :class="['btn', dialog.danger ? 'btn-danger' : 'btn-primary']" @click="$emit('confirm')" :disabled="busy">
                  <template v-if="busy">{{ dialog.busyLabel }}</template>
                  <template v-else><component v-if="icon" :is="icon" /> {{ dialog.confirmLabel }}</template>
                </button>
              </div>
            </div>
          </section>
        </div>
      </transition>
    </teleport>
  `,
  setup(props, { emit }) {
    const dialogEl = ref(null)
    const headingId = `confirm-dialog-${++confirmDialogCount}`
    const bodyId = `${headingId}-body`

    const cancel = () => {
      if (!props.busy) emit('cancel')
    }

    const onKeydown = (e) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      cancel()
    }

    const setOpen = async (isOpen) => {
      try { document.body.classList.toggle('sheet-open', isOpen) } catch {}
      window.removeEventListener('keydown', onKeydown, true)
      if (!isOpen) return
      window.addEventListener('keydown', onKeydown, true)
      await nextTick()
      dialogEl.value?.focus()
    }

    watch(() => props.open && Boolean(props.dialog), setOpen)

    onUnmounted(() => {
      if (props.open) setOpen(false)
    })

    return { dialogEl, headingId, bodyId, cancel }
  },
}

let confirmDialogCount = 0

export const useConfirm = () => {
  const confirming = ref(null)
  const confirmBusy = ref(false)

  const askConfirm = ({ dialog, icon = '', run }) => {
    confirming.value = { dialog, icon, run }
  }

  const closeConfirm = () => { confirming.value = null }

  const runConfirmed = async () => {
    const { run } = confirming.value
    confirmBusy.value = true
    try {
      await run()
    } finally {
      confirmBusy.value = false
      confirming.value = null
    }
  }

  return { confirming, confirmBusy, askConfirm, closeConfirm, runConfirmed }
}

export const useSheet = () => {
  const open = ref(false)
  const trigger = ref(null)
  const dialog = ref(null)

  const onKeydown = (e) => {
    if (e.key !== 'Escape') return
    e.stopImmediatePropagation()
    close()
  }

  const setSheetOpen = (isOpen) => {
    try { document.body.classList.toggle('sheet-open', isOpen) } catch {}
  }

  const show = async () => {
    open.value = true
    setSheetOpen(true)
    window.addEventListener('keydown', onKeydown, true)
    await nextTick()
    dialog.value?.focus()
  }

  const close = () => {
    if (!open.value) return
    open.value = false
    setSheetOpen(false)
    window.removeEventListener('keydown', onKeydown, true)
    trigger.value?.focus()
  }

  onUnmounted(() => {
    if (!open.value) return
    setSheetOpen(false)
    window.removeEventListener('keydown', onKeydown, true)
  })

  return { open, trigger, dialog, show, close }
}

export const FilterSheet = {
  props: {
    title: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  emits: ['clear'],
  template: `
    <button ref="trigger" type="button" class="btn btn-sm filter-trigger" :aria-expanded="open"
      :aria-controls="open ? sheetId : null" :aria-label="count ? 'Filters, ' + count + ' active' : 'Filters'" @click="show">
      <filter-icon /> FILTERS<span v-if="count" class="filter-count" aria-hidden="true">{{ count }}</span>
    </button>
    <teleport to="body">
      <transition name="epg-sheet">
        <div v-if="open" class="epg-modal-backdrop filter-sheet" @click.self="close">
          <section :id="sheetId" ref="dialog" class="panel epg-modal" role="dialog" aria-modal="true"
            :aria-labelledby="headingId" tabindex="-1">
            <header class="panel-header">
              <span :id="headingId" class="panel-title">{{ title }}</span>
              <button type="button" class="btn btn-icon epg-modal-x" @click="close" aria-label="Close"><cross-icon /></button>
            </header>
            <div class="panel-body filter-sheet-body">
              <slot />
              <div class="epg-modal-actions flex items-center justify-end gap-2">
                <button type="button" class="btn mr-auto" :disabled="!count" @click="$emit('clear')"><cross-icon /> CLEAR</button>
                <button type="button" class="btn btn-primary" @click="close"><check-icon /> DONE</button>
              </div>
            </div>
          </section>
        </div>
      </transition>
    </teleport>
  `,
  setup() {
    const id = ++filterSheetCount
    return { ...useSheet(), sheetId: `filter-sheet-${id}`, headingId: `filter-sheet-title-${id}` }
  },
}
