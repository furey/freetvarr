export const dialogBlocksOf = (copy) => [
  { key: 'changes', heading: 'What changes', className: 'is-changed', icon: 'ads', lines: copy?.changes || [] },
  { key: 'deleted', heading: 'What gets deleted', className: 'is-deleted', icon: 'trash', lines: copy?.deleted || [] },
  { key: 'stays', heading: 'What stays', className: 'is-kept', icon: 'check', lines: copy?.stays || [] },
].filter((block) => block.lines.length)
