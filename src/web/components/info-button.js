import { computed } from '/vendor/vue.esm-browser.prod.js'
import { useSheet } from '/components/dialogs.js'
import { DOCS_BASE } from '/shared/constants.js'

let infoDialogCount = 0

export const InfoButton = {
  props: {
    title: { type: String, required: true },
    doc: { type: String, default: '' },
  },
  template: `
    <button ref="trigger" type="button" class="info-btn" :aria-label="'About ' + title" :title="'About ' + title"
      :aria-expanded="open" @click="show"><info-icon /></button>
    <teleport to="body">
      <transition name="epg-sheet">
        <div v-if="open" class="epg-modal-backdrop" @click.self="close">
          <section ref="dialog" class="panel epg-modal info-modal" role="dialog" aria-modal="true"
            :aria-labelledby="headingId" tabindex="-1">
            <header class="panel-header">
              <span :id="headingId" class="panel-title">{{ title }}</span>
              <button type="button" class="btn btn-icon epg-modal-x" @click="close" aria-label="Close"><cross-icon /></button>
            </header>
            <div class="panel-body info-modal-body">
              <slot />
              <div v-if="doc" class="epg-modal-actions flex items-center justify-end gap-2">
                <a v-if="doc" :href="docUrl" target="_blank" rel="noopener noreferrer" class="btn no-hover-underline">
                  READ THE DOCS <external-link-icon />
                </a>
              </div>
            </div>
          </section>
        </div>
      </transition>
    </teleport>
  `,
  setup(props) {
    const headingId = `info-dialog-${++infoDialogCount}`
    const docUrl = computed(() => `${DOCS_BASE}${props.doc}`)
    return { ...useSheet(), headingId, docUrl }
  },
}
