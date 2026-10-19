import { ref, computed } from '/vendor/vue.esm-browser.prod.js'
import { DOCS_BASE } from '/shared/constants.js'

export const InfoButton = {
  props: {
    title: { type: String, required: true },
    doc: { type: String, default: '' },
  },
  template: `
    <button type="button" class="info-btn" :aria-label="'About ' + title" :title="'About ' + title"
      :aria-expanded="open" @click="open = true"><info-icon /></button>
    <ui-sheet :open="open" :title="title" @close="open = false">
      <template #header-actions>
        <button type="button" class="ui-icon-button" aria-label="Close" @click="open = false"><close-glyph /></button>
      </template>
      <div class="info-sheet-body"><slot /></div>
      <template v-if="doc" #footer>
        <a :href="docUrl" target="_blank" rel="noopener noreferrer" class="ui-button ui-button-secondary ui-button-block">
          Read the docs <external-link-icon />
        </a>
      </template>
    </ui-sheet>
  `,

  setup(props) {
    const open = ref(false)
    const docUrl = computed(() => `${DOCS_BASE}${props.doc}`)
    return { open, docUrl }
  },
}
