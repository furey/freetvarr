export const TvIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5.5 1.5 8 4l2.5-2.5"/>
      <rect x="1.5" y="4" width="13" height="10" rx="1.5"/>
      <path d="M6.75 7.25v3.5l2.9-1.75z" fill="currentColor"/>
    </svg>
  `,
}

export const RecordIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6"/>
      <circle cx="8" cy="8" r="2.75" fill="currentColor" stroke="none"/>
    </svg>
  `,
}

export const SeriesRecordIcon = {
  props: { set: { type: Boolean, default: false } },
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M7.875 3.887A4.75 4.75 0 1 0 7.875 12.113"/>
      <circle cx="10.25" cy="8" r="4.75"/>
      <path v-if="set" d="M8.4 8.1l1.3 1.3 2.4-2.6"/>
      <circle v-else cx="10.25" cy="8" r="2.25" fill="currentColor" stroke="none"/>
    </svg>
  `,
}

export const StopIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1"/>
    </svg>
  `,
}

export const GoLiveIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3.5 3.5v9l7-4.5z"/>
      <rect x="11" y="3.5" width="1.75" height="9" rx="0.5"/>
    </svg>
  `,
}

export const MusicNotesIcon = {
  template: `
    <svg viewBox="0 0 24 16" fill="currentColor" aria-hidden="true">
      <g class="hold-music-note">
        <ellipse cx="3.6" cy="12.6" rx="2.4" ry="1.8"/>
        <rect x="5.2" y="3" width="1.2" height="9.6"/>
        <path d="M5.2 3h1.2l3.4 2.6-1 1.1-2.4-1.8z"/>
      </g>
      <g class="hold-music-note">
        <ellipse cx="13.6" cy="11.6" rx="2.2" ry="1.7"/>
        <ellipse cx="20.6" cy="10.2" rx="2.2" ry="1.7"/>
        <rect x="15" y="2.6" width="1.1" height="9"/>
        <rect x="22" y="1.2" width="1.1" height="9"/>
        <path d="M15 2.6 23.1 1.2v2L15 4.6z"/>
      </g>
    </svg>
  `,
}

export const SpeakerIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="currentColor"/>
      <path d="M10.5 5.75a3.2 3.2 0 0 1 0 4.5M12.5 3.75a6 6 0 0 1 0 8.5"/>
    </svg>
  `,
}

export const SpeakerMutedIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="currentColor"/>
      <path d="M10.5 6l4 4M14.5 6l-4 4"/>
    </svg>
  `,
}

export const CrossIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8"/>
    </svg>
  `,
}

export const RefreshIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12.7 10.21A5 5 0 1 1 8.5 3.53"/>
      <path d="M6.75 1.25 9.25 3.5 6.75 5.75"/>
    </svg>
  `,
}

export const SlidersIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 3.5h7M12 3.5h2M2 8h2M7 8h7M2 12.5h4.5M9.5 12.5H14"/>
      <circle cx="10.5" cy="3.5" r="1.5"/>
      <circle cx="5.5" cy="8" r="1.5"/>
      <circle cx="8" cy="12.5" r="1.5"/>
    </svg>
  `,
}

export const FilterIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2.25 3h11.5l-4.5 5.25v4.5l-2.5 1.25V8.25z"/>
    </svg>
  `,
}

export const ImageIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5"/>
      <circle cx="5.75" cy="6.5" r="1.25"/>
      <path d="M14 10.5 10.5 7 4 13"/>
    </svg>
  `,
}

export const ArrowLeftIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M13.5 8h-11M6.5 4l-4 4 4 4"/>
    </svg>
  `,
}

export const ArrowRightIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2.5 8h11M9.5 4l4 4-4 4"/>
    </svg>
  `,
}

export const ChevronRightIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 3.5l4.5 4.5L6 12.5"/>
    </svg>
  `,
}

export const CalendarIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/>
      <path d="M2.5 6.75h11M5.5 2v3M10.5 2v3"/>
    </svg>
  `,
}

export const ArrowUpIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 13.5v-11M4 6.5l4-4 4 4"/>
    </svg>
  `,
}

export const ArrowDownIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 2.5v11M4 9.5l4 4 4-4"/>
    </svg>
  `,
}

export const PlayIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5.5 3.75v8.5L12.75 8z"/>
    </svg>
  `,
}

export const PauseIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="4" y="3.5" width="2.75" height="9" rx="0.5"/>
      <rect x="9.25" y="3.5" width="2.75" height="9" rx="0.5"/>
    </svg>
  `,
}

export const FullscreenIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2.75 6V2.75H6M10 2.75h3.25V6M13.25 10v3.25H10M6 13.25H2.75V10"/>
    </svg>
  `,
}

export const ExitFullscreenIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 2.75V6H2.75M13.25 6H10V2.75M10 13.25V10h3.25M2.75 10H6v3.25"/>
    </svg>
  `,
}

export const StartOverIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3.5 3v10M12.5 3.5 6 8l6.5 4.5z"/>
    </svg>
  `,
}

export const AirplayIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4.5 11.5H3a1.25 1.25 0 0 1-1.25-1.25v-6.5A1.25 1.25 0 0 1 3 2.5h10a1.25 1.25 0 0 1 1.25 1.25v6.5A1.25 1.25 0 0 1 13 11.5h-1.5"/>
      <path d="M8 9.5l3.25 4h-6.5z" fill="currentColor"/>
    </svg>
  `,
}

export const PlusIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 3v10M3 8h10"/>
    </svg>
  `,
}

export const MinusIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 8h10"/>
    </svg>
  `,
}

export const UnlinkIcon = {
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="m5.17 11.75-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      <path d="M8 2v3M2 8h3M16 19v3M19 16h3"/>
    </svg>
  `,
}

export const CheckIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 8.5l3.25 3.25L13 5"/>
    </svg>
  `,
}

export const PencilIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2.5 13.5l.75-3.25 7.5-7.5 2.5 2.5-7.5 7.5zM9.5 4l2.5 2.5"/>
    </svg>
  `,
}

export const StarIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.25l2.03 4.3 4.72.58-3.47 3.25.9 4.67L8 11.75l-4.18 2.3.9-4.67L1.25 6.13l4.72-.58z"/>
    </svg>
  `,
}

export const StepMarkIcon = {
  props: { state: { type: String, default: 'pending' } },
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path v-if="state === 'done'" d="M3 8.5l3.25 3.25L13 5"/>
      <circle v-else-if="state === 'active'" cx="8" cy="8" r="4" fill="currentColor" stroke="none"/>
      <path v-else-if="state === 'failed'" d="M4 4l8 8M12 4l-8 8"/>
      <path v-else-if="state === 'warn'" d="M8 3v6.25M8 12.75v.25"/>
      <path v-else-if="state === 'skipped'" d="M4 8h8"/>
      <circle v-else cx="8" cy="8" r="3.75"/>
    </svg>
  `,
}

export const SortArrow = {
  props: { dir: { type: String, default: null } },
  template: `
    <arrow-down-icon v-if="dir === 'desc'" class="sort-arrow" />
    <arrow-up-icon v-else-if="dir === 'asc'" class="sort-arrow" />
  `,
}

export const SignalBarsIcon = {
  template: `
    <svg viewBox="0 0 10 4" class="signal-bars" fill="currentColor" aria-hidden="true">
      <rect x="0" y="0" width="4" height="4"/>
      <rect x="5.5" y="0" width="4" height="4"/>
    </svg>
  `,
}

export const EyeIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/>
      <circle cx="8" cy="8" r="2"/>
    </svg>
  `,
}

export const EyeOffIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/>
      <circle cx="8" cy="8" r="2"/>
      <path d="M2.5 13.5l11-11"/>
    </svg>
  `,
}

export const SearchIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25"/>
      <path d="M10.25 10.25l3.25 3.25"/>
    </svg>
  `,
}

export const PulseIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M1.5 8.5h2.75L6 4l3.5 8.5 1.75-4h3.25"/>
    </svg>
  `,
}

export const BoltIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 1.75 3.5 9.25H8l-1 5 5.5-7.5H8z"/>
    </svg>
  `,
}

export const DownloadIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 2.5V10M4.75 7 8 10.25 11.25 7M3 13.5h10"/>
    </svg>
  `,
}

export const TrashIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 5h10M6.5 5V3h3v2M4.5 5l.7 8.5h5.6L11.5 5M6.5 7.5v4M9.5 7.5v4"/>
    </svg>
  `,
}

export const AdScanIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="4" cy="4.5" r="1.75"/>
      <circle cx="4" cy="11.5" r="1.75"/>
      <path d="M5.5 5.75 13 12M5.5 10.25 13 4"/>
    </svg>
  `,
}

export const ExternalLinkIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/>
    </svg>
  `,
}

export const CopyIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1"/>
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>
    </svg>
  `,
}

export const InfoIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25"/>
      <path d="M8 7.25v4"/>
      <circle cx="8" cy="4.9" r="0.85" fill="currentColor" stroke="none"/>
    </svg>
  `,
}

export const CaptionsIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
      <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.5"/>
      <path d="M6.94 6.66a1.9 1.9 0 1 0 0 2.68"/>
      <path d="M11.74 6.66a1.9 1.9 0 1 0 0 2.68"/>
    </svg>
  `,
}

export const MoreIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.25" cy="8" r="1.25"/>
      <circle cx="8" cy="8" r="1.25"/>
      <circle cx="12.75" cy="8" r="1.25"/>
    </svg>
  `,
}
