import { staleBuild } from '/shared/api.js'

export const StaleBuildBanner = {
  template: `
    <div v-if="staleBuild" class="stale-build" role="status">
      <div class="max-w-6xl mx-auto px-4 md:px-6 py-2 flex items-center gap-3">
        <span class="panel-title hidden sm:inline shrink-0">Update</span>
        <span class="stale-build-text">A new version of Freetvarr is ready.</span>
        <button type="button" class="btn btn-sm btn-primary shrink-0" @click="reloadPage"><refresh-icon /> APPLY &amp; RELOAD</button>
      </div>
    </div>
  `,
  setup() {
    const reloadPage = () => window.location.reload()
    return { staleBuild, reloadPage }
  },
}
