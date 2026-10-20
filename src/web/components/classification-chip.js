import { classificationOf, classificationToneOf } from '/ratings-display.js'

export const ClassificationChip = {
  props: {
    classification: { type: String, default: null },
    variant: { type: String, default: 'inline' },
  },
  template: `
    <span v-if="code" :class="['classification-chip', 'is-' + variant, 'is-' + tone]" role="img"
      :aria-label="'Classified ' + code">{{ code }}</span>
  `,
  computed: {
    code() {
      return classificationOf(this.classification)
    },
    tone() {
      return classificationToneOf(this.code)
    },
  },
}
