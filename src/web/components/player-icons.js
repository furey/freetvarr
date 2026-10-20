import { SpeakerIcon, SpeakerMutedIcon } from '/components/icons.js'

const icon = (paths) => ({
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${paths}
    </svg>
  `,
})

export const PictureInPictureIcon = icon('<rect x="1.75" y="3" width="12.5" height="10" rx="1.5"/><rect x="8" y="8" width="4.5" height="3.25" rx="0.6" fill="currentColor" stroke="none"/>')

export const MinimiseIcon = PictureInPictureIcon

export const PopOutIcon = icon('<path d="M13.25 9.5v2.25a1.5 1.5 0 0 1-1.5 1.5h-8.5a1.5 1.5 0 0 1-1.5-1.5v-6.5a1.5 1.5 0 0 1 1.5-1.5H6.5"/><path d="M9.25 2.25h4.5v4.5M13.75 2.25 8.25 7.75"/>')

export const ExitPictureInPictureIcon = icon('<rect x="1.75" y="3" width="12.5" height="10" rx="1.5"/><rect x="8.25" y="8" width="4.25" height="3.25" rx="0.6"/><path d="M7.25 7.25 4.5 4.5M4.5 7.25V4.5h2.75"/>')

export const ExpandArrowsIcon = icon('<path d="M9.5 2.75h3.75V6.5M13.25 2.75 8.75 7.25M6.5 13.25H2.75V9.5M2.75 13.25l4.5-4.5"/>')

export const WatchAlongsideIcon = icon('<rect x="1.25" y="2.5" width="13.5" height="9" rx="1.5"/><path d="M8 2.5v9M5.5 14h5"/>')

export const SwapIcon = icon('<path d="M3 5.5h10M10.5 3 13 5.5 10.5 8M13 10.5H3M5.5 8 3 10.5 5.5 13"/>')

export const SwapVerticalIcon = icon('<path d="M5.5 13V3M3 5.5 5.5 3 8 5.5M10.5 3v10M8 10.5l2.5 2.5 2.5-2.5"/>')

export const SplitLayoutIcon = icon('<rect x="1.75" y="3" width="5.5" height="10" rx="1.2"/><rect x="8.75" y="3" width="5.5" height="10" rx="1.2"/>')

export const InsetLayoutIcon = icon('<rect x="1.75" y="3" width="12.5" height="10" rx="1.5"/><rect x="8" y="8" width="4.5" height="3.25" rx="0.6" fill="currentColor" stroke="none"/>')

export const GridLayoutIcon = icon('<rect x="1.75" y="2.75" width="5.5" height="4.5" rx="1"/><rect x="8.75" y="2.75" width="5.5" height="4.5" rx="1"/><rect x="1.75" y="8.75" width="5.5" height="4.5" rx="1"/><rect x="8.75" y="8.75" width="5.5" height="4.5" rx="1"/>')

export const StripLayoutIcon = icon('<rect x="1.75" y="3" width="8.5" height="10" rx="1.2"/><rect x="11.5" y="3" width="2.75" height="2.5" rx=".5" fill="currentColor" stroke="none"/><rect x="11.5" y="6.75" width="2.75" height="2.5" rx=".5" fill="currentColor" stroke="none"/><rect x="11.5" y="10.5" width="2.75" height="2.5" rx=".5" fill="currentColor" stroke="none"/>')

export const RewindToStartIcon = icon('<path d="M2.75 8a5.25 5.25 0 1 0 1.6-3.8"/><path d="M2.75 2.75v2.5h2.5"/>')

export const ClockIcon = icon('<circle cx="8" cy="8" r="5.75"/><path d="M8 4.75V8l2.25 1.5"/>')

export const ResizeArrowsIcon = icon('<path d="M2.5 8h11M5 5.5 2.5 8 5 10.5M11 5.5l2.5 2.5-2.5 2.5"/>')

export const CornerGripIcon = {
  props: {
    corner: { type: String, default: 'top-left' },
  },
  setup: () => ({ turnOf }),
  template: `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path :transform="turnOf(corner)" d="M4.5 11.5V7.25a2.75 2.75 0 0 1 2.75-2.75h4.25"/>
    </svg>
  `,
}

export const MoreDotsIcon = {
  template: `
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/>
    </svg>
  `,
}

export const PhoneRotateIcon = icon('<rect x="4.5" y="1.75" width="7" height="12.5" rx="1.5"/><path d="M2 9.5a3 3 0 0 0 2.5 3"/>')

export const PLAYER_ICON_COMPONENTS = {
  'pip-icon': PictureInPictureIcon,
  'pop-out-icon': PopOutIcon,
  'minimise-icon': MinimiseIcon,
  'watch-alongside-icon': WatchAlongsideIcon,
  'swap-icon': SwapIcon,
  'swap-vertical-icon': SwapVerticalIcon,
  'split-layout-icon': SplitLayoutIcon,
  'inset-layout-icon': InsetLayoutIcon,
  'grid-layout-icon': GridLayoutIcon,
  'strip-layout-icon': StripLayoutIcon,
  'rewind-to-start-icon': RewindToStartIcon,
  'clock-icon': ClockIcon,
  'exit-pip-icon': ExitPictureInPictureIcon,
  'expand-arrows-icon': ExpandArrowsIcon,
  'speaker-icon': SpeakerIcon,
  'speaker-muted-icon': SpeakerMutedIcon,
  'more-dots-icon': MoreDotsIcon,
  'phone-rotate-icon': PhoneRotateIcon,
  'resize-arrows-icon': ResizeArrowsIcon,
  'corner-grip-icon': CornerGripIcon,
}


const BRACKET_TURNS = { 'top-left': 0, 'top-right': 90, 'bottom-right': 180, 'bottom-left': 270 }

const turnOf = (corner) => `rotate(${BRACKET_TURNS[corner] ?? 0} 8 8)`
