import { computed, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { guideNotice, hideGuideNotice, loadGuideNotice } from '/shared/guide-notice.js'

export const GUIDE_SETTINGS_HREF = '#/settings/guide'

export const guideNoticeTextOf = ({ added = 0 }) => (added
  ? `A merged guide with ${added} more ${added === 1 ? 'channel' : 'channels'} is ready for TVHeadend.`
  : 'A merged guide is ready for TVHeadend.')

export const GuideNotice = {
  template: `
    <div v-if="guideNotice.show" class="ui-banner guide-notice ui-page-banner" role="status">
      <a :href="href" class="guide-notice-link">
        <span class="ui-banner-text guide-notice-text">{{ text }}</span>
        <span class="ui-banner-action">Review</span>
      </a>
      <button type="button" class="health-alert-close" aria-label="Hide this notice" @click="hideGuideNotice"><close-glyph /></button>
    </div>
  `,
  setup() {
    onMounted(() => loadGuideNotice())
    const text = computed(() => guideNoticeTextOf(guideNotice.value))
    return { guideNotice, hideGuideNotice, href: GUIDE_SETTINGS_HREF, text }
  },
}
