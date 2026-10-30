export const SeriesDrawer = {
  props: {
    series: { type: Object, required: true },
    folders: { type: Array, default: () => [] },
    mediaRoot: { type: String, default: '' },
    adRemovalEnabled: Boolean,
    importUnmatched: { type: Boolean, default: true },
    busy: Boolean,
  },
  emits: ['saved', 'close', 'assign', 'pause', 'cancel-series'],
  template: `
    <div class="series-drawer" @keydown.esc="$emit('close')">
      <div class="series-drawer-tvh">
        <p class="series-drawer-state">
          <span class="settings-row-title">Series recording</span>
          <span class="settings-row-meta">{{ series.recording ? 'TVHeadend records new episodes.' : 'Paused: TVHeadend records no new episodes.' }}</span>
        </p>
        <div class="card-actions">
          <button type="button" class="ui-button ui-button-sm" @click="$emit('pause')" :disabled="busy">
            <template v-if="series.recording"><pause-icon /> Pause</template><template v-else><play-icon /> Resume</template>
          </button>
          <button type="button" class="ui-button ui-button-sm ui-button-destructive" @click="$emit('cancel-series')" :disabled="busy">Cancel series</button>
        </div>
      </div>
      <series-folder-editor v-if="series.folder" :folder="series.folder" :folders="folders"
        :media-root="mediaRoot" :ad-removal-enabled="adRemovalEnabled" is-series :import-unmatched="importUnmatched"
        @saved="$emit('saved')" @cancel="$emit('close')" />
      <div v-else class="series-drawer-unassigned">
        <p v-if="series.savesTo?.kind === 'newFolder'" class="settings-row-body">This series has no folder in your TV library yet. The next import makes a new folder for it: <code>{{ series.savesTo.path }}</code>.</p>
        <p v-else-if="series.savesTo?.kind === 'oneOff'" class="settings-row-body">This series is in One-offs, so its episodes save to the one-off folder: <code>{{ series.savesTo.path }}</code>.</p>
        <p v-else class="settings-row-body">This series has no folder in your TV library, so its episodes wait in the <a href="#/settings/system/log">Recording log</a>.</p>
        <p class="settings-hint">To choose the folder in your TV library yourself, press <strong>Assign folder</strong>. You can then set the season folders, ad removal, and whether Freetvarr removes the TVHeadend copy after import.</p>
        <div class="card-actions">
          <button type="button" class="ui-button ui-button-primary" @click="$emit('assign')" :disabled="busy"><plus-icon /> Assign folder</button>
        </div>
      </div>
    </div>
  `,
}
