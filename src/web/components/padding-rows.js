import { SHEET_LAG_STEPS, SHEET_LEAD_STEPS, canStep, minutesShort, stepValue } from '/programme-sheet.js'

export const PaddingRows = {
  props: {
    lead: { type: Number, required: true },
    lag: { type: Number, required: true },
    idPrefix: { type: String, required: true },
  },
  emits: ['update:lead', 'update:lag'],
  template: `
    <div class="ui-group-row">
      <span class="ui-group-row-main" :id="idPrefix + '-lead-label'">Start early</span>
      <span class="ui-stepper" role="group" :aria-labelledby="idPrefix + '-lead-label'">
        <button type="button" class="ui-stepper-button" aria-label="Start less early" :disabled="!canStep({ steps: leadSteps, value: lead, step: -1 })" @click="$emit('update:lead', stepValue({ steps: leadSteps, value: lead, step: -1 }))">−</button>
        <span class="ui-stepper-value" aria-live="polite">{{ minutesShort(lead) }}</span>
        <button type="button" class="ui-stepper-button" aria-label="Start earlier" :disabled="!canStep({ steps: leadSteps, value: lead, step: 1 })" @click="$emit('update:lead', stepValue({ steps: leadSteps, value: lead, step: 1 }))">+</button>
      </span>
    </div>
    <div class="ui-group-row">
      <span class="ui-group-row-main" :id="idPrefix + '-lag-label'">Finish late</span>
      <span class="ui-stepper" role="group" :aria-labelledby="idPrefix + '-lag-label'">
        <button type="button" class="ui-stepper-button" aria-label="Finish less late" :disabled="!canStep({ steps: lagSteps, value: lag, step: -1 })" @click="$emit('update:lag', stepValue({ steps: lagSteps, value: lag, step: -1 }))">−</button>
        <span class="ui-stepper-value" aria-live="polite">{{ minutesShort(lag) }}</span>
        <button type="button" class="ui-stepper-button" aria-label="Finish later" :disabled="!canStep({ steps: lagSteps, value: lag, step: 1 })" @click="$emit('update:lag', stepValue({ steps: lagSteps, value: lag, step: 1 }))">+</button>
      </span>
    </div>
  `,
  setup: () => ({ leadSteps: SHEET_LEAD_STEPS, lagSteps: SHEET_LAG_STEPS, canStep, stepValue, minutesShort }),
}
