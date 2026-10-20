import { classificationOf, classificationToneOf } from '/ratings-display.js'

export const ClassificationChip = {
  props: {
    classification: { type: String, default: null },
    variant: { type: String, default: 'thumb' },
  },
  template: `
    <span v-if="code" :class="['classification-chip', 'is-' + variant, 'is-' + tone]" role="img"
      :aria-label="'Classified ' + code">{{ code }}</span>
  `,
  computed: {
    code() {
      return chipCodeOf({ classification: this.classification, variant: this.variant })
    },
    tone() {
      return classificationToneOf(this.code)
    },
  },
}

export const chipCodeOf = ({ classification, variant }) => (variant === 'thumb'
  ? thumbClassificationOf(classification)
  : classificationOf(classification))

export const thumbClassificationOf = (value) => {
  const code = classificationOf(value)
  return THUMB_CODES.has(code) ? code : null
}

export const slideClassificationOf = (slide) => {
  const target = slide?.target || {}
  return slide?.classification
    ?? target.program?.classification
    ?? target.item?.classification
    ?? target.episode?.classification
    ?? target.recording?.classification
    ?? target.upcoming?.classification
    ?? null
}

const THUMB_CODES = new Set(['MA15+', 'R18+'])
