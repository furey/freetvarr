export const SeriesDrawer = {
  props: {
    series: { type: Object, required: true },
    folders: { type: Array, default: () => [] },
    mediaRoot: { type: String, default: '' },
    adRemovalEnabled: Boolean,
    importUnmatched: { type: Boolean, default: true },
    busy: Boolean,
  },
  emits: ['saved', 'deleted', 'close', 'assign', 'pause', 'cancel-series'],
  template: `
    <div class="series-drawer" @keydown.esc="$emit('close')">
      <div class="series-drawer-tvh">
        <p class="series-drawer-state">
          <span class="field-label">Series recording</span>
          <span>{{ series.recording ? 'TVHeadend records new episodes' : 'Paused: TVHeadend records no new episodes' }}</span>
        </p>
        <div class="card-actions">
          <button type="button" class="btn btn-sm" @click="$emit('pause')" :disabled="busy">
            <template v-if="series.recording"><pause-icon /> PAUSE</template><template v-else><play-icon /> RESUME</template>
          </button>
          <button type="button" class="btn btn-sm btn-danger" @click="$emit('cancel-series')" :disabled="busy">CANCEL SERIES</button>
        </div>
      </div>
      <series-folder-editor v-if="series.folder" :folder="series.folder" :folders="folders"
        :media-root="mediaRoot" :ad-removal-enabled="adRemovalEnabled" is-series :import-unmatched="importUnmatched"
        @saved="$emit('saved')" @deleted="$emit('deleted')" @cancel="$emit('close')" />
      <div v-else class="series-drawer-unassigned">
        <p v-if="series.savesTo?.path" class="text-sm text-ink">This series has no folder in your TV library, so its episodes save to the one-off folder: <code>{{ series.savesTo.path }}</code>.</p>
        <p v-else class="text-sm text-ink">This series has no folder in your TV library, so its episodes wait in <a href="#/settings/system/log">RECORDINGS</a>.</p>
        <p class="text-sm text-ink-dim">To save its episodes in their own folder in your TV library, press <strong>ASSIGN FOLDER</strong>. You can then set the season folders, ad removal, and whether Freetvarr removes the TVHeadend copy after import.</p>
        <div class="card-actions">
          <button type="button" class="btn btn-primary" @click="$emit('assign')" :disabled="busy"><plus-icon /> ASSIGN FOLDER</button>
        </div>
      </div>
    </div>
  `,
}
