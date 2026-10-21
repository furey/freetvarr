export const GUIDE_SKELETON_ROWS = 12

export const guideSkeletonRows = ({ count = GUIDE_SKELETON_ROWS, zoom = 'm' } = {}) =>
  Array.from({ length: count }, (_, row) => cellsOf(blocksFor({ row, zoom })))

const SKELETON_GUIDE_BLOCKS = [[3, 2, 4, 2], [2, 5, 3], [4, 2, 2, 3], [3, 3, 5], [2, 4, 3, 2]]

const blocksAt = (i) => SKELETON_GUIDE_BLOCKS[i % SKELETON_GUIDE_BLOCKS.length]

const blocksFor = ({ row, zoom }) => {
  if (zoom === 's') return [...blocksAt(row), ...blocksAt(row + 1)]
  if (zoom === 'l') return blocksAt(row).slice(0, 2)
  return blocksAt(row)
}

const cellsOf = (blocks) => {
  const total = blocks.reduce((sum, grow) => sum + grow, 0)
  let start = 0
  return blocks.map((grow) => {
    const cell = { left: percentOf(start / total), width: percentOf(grow / total) }
    start += grow
    return cell
  })
}

const percentOf = (fraction) => `${Math.round(fraction * 10000) / 100}%`
