import { computed } from '/vendor/vue.esm-browser.prod.js'

export const RowEndTile = {
  props: {
    href: { type: String, required: true },
    shape: { type: String, default: 'poster' },
    countText: { type: String, default: '' },
  },
  template: `
    <a :href="href" :class="['ui-row-end', 'is-' + shape]" :aria-label="ariaLabel">
      <span class="ui-row-end-art">
        <span class="ui-row-end-words">
          <span class="ui-row-end-label">See all</span>
          <span v-if="countText" class="ui-row-end-count">{{ countText }}</span>
        </span>
        <span class="ui-row-end-arrow" aria-hidden="true"><arrow-right-icon /></span>
      </span>
    </a>
  `,
  setup(props) {
    const ariaLabel = computed(() => ['See all', props.countText].filter(Boolean).join(', '))
    return { ariaLabel }
  },
}
