import { computed } from '/vendor/vue.esm-browser.prod.js'

export const ListSkeleton = {
  props: {
    rows: { type: Number, default: 5 },
    rowHeight: { type: String, default: null },
    logo: { type: Boolean, default: false },
    thumb: { type: Boolean, default: false },
    guide: { type: Boolean, default: false },
    guideZoom: { type: String, default: 'm' },
  },
  template: `
    <div class="skeleton-reveal" aria-hidden="true">
      <div v-for="(width, i) in widths" :key="i" class="skeleton-row" :style="rowHeight ? { height: rowHeight } : null">
        <span v-if="logo || guide" class="skeleton skeleton-logo"></span>
        <span v-if="thumb" class="skeleton skeleton-thumb"></span>
        <template v-if="guide">
          <span v-for="(grow, j) in guideBlocksFor(i)" :key="j" class="skeleton skeleton-block" :style="{ flexGrow: grow }"></span>
        </template>
        <span v-else class="skeleton skeleton-line" :style="{ width }"></span>
      </div>
    </div>
  `,
  setup(props) {
    const widths = computed(() => Array.from({ length: props.rows }, (_, i) => SKELETON_ROW_WIDTHS[i % SKELETON_ROW_WIDTHS.length]))
    const guideBlocksFor = (i) => guideSkeletonBlocks({ row: i, zoom: props.guideZoom })
    return { widths, guideBlocksFor }
  },
}

const SKELETON_ROW_WIDTHS = ['72%', '58%', '81%', '64%', '76%', '52%', '68%']
const SKELETON_GUIDE_BLOCKS = [[3, 2, 4, 2], [2, 5, 3], [4, 2, 2, 3], [3, 3, 5], [2, 4, 3, 2]]

const guideSkeletonBlocks = ({ row, zoom }) => {
  const blocksAt = (i) => SKELETON_GUIDE_BLOCKS[i % SKELETON_GUIDE_BLOCKS.length]
  if (zoom === 's') return [...blocksAt(row), ...blocksAt(row + 1)]
  if (zoom === 'l') return blocksAt(row).slice(0, 2)
  return blocksAt(row)
}
