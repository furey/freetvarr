import { classificationLabelOf, classificationOf, classificationToneOf } from '/ratings-display.js'

export const ClassificationChip = {
  props: {
    classification: { type: String, default: null },
    variant: { type: String, default: 'inline' },
    advice: { type: Array, default: () => [] },
  },
  template: `
    <span v-if="code" :class="['classification-chip', 'is-' + variant, 'is-' + tone]" role="img"
      :aria-label="label" :title="label">{{ code }}</span>
  `,
  computed: {
    code() {
      return classificationOf(this.classification)
    },
    tone() {
      return classificationToneOf(this.code)
    },
    label() {
      return classificationLabelOf({ classification: this.code, advice: this.advice })
    },
  },
}
