const strokeIcon = (paths) => ({
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>
  `,
})

export const HomeNavIcon = strokeIcon('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>')

export const LiveNavIcon = strokeIcon('<rect x="2" y="6" width="20" height="14" rx="2"/><path d="m7 2 5 4 5-4"/>')

export const GuideNavIcon = strokeIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>')

export const ForYouNavIcon = strokeIcon('<path d="M11 3.5 12.9 9l5.6 2-5.6 2L11 18.5 9.1 13l-5.6-2 5.6-2z"/><path d="M18.5 3v4M16.5 5h4"/>')

export const RecordingsNavIcon = strokeIcon('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/>')

export const SettingsNavIcon = strokeIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')

export const SearchGlyph = strokeIcon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>')

export const ChevronGlyph = strokeIcon('<path d="m9 18 6-6-6-6"/>')

export const BackGlyph = strokeIcon('<path d="m15 18-6-6 6-6"/>')

export const WarningGlyph = strokeIcon('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>')

export const CloseGlyph = strokeIcon('<path d="M18 6 6 18M6 6l12 12"/>')

export const PlayGlyph = {
  template: `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>
  `,
}

export const MoreGlyph = {
  template: `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
  `,
}
