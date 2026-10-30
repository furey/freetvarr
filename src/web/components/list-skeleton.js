import { computed } from '/vendor/vue.esm-browser.prod.js'

export const ListSkeleton = {
  props: {
    rows: { type: Number, default: 5 },
  },
  template: `
    <div class="skeleton-reveal" aria-hidden="true">
      <div v-for="(width, i) in widths" :key="i" class="skeleton-row">
        <span class="skeleton skeleton-line" :style="{ width }"></span>
      </div>
    </div>
  `,
  setup(props) {
    const widths = computed(() => Array.from({ length: props.rows }, (_, i) => SKELETON_ROW_WIDTHS[i % SKELETON_ROW_WIDTHS.length]))
    return { widths }
  },
}

const SKELETON_ROW_WIDTHS = ['72%', '58%', '81%', '64%', '76%', '52%', '68%']
