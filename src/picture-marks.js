import sharp from 'sharp'

export const CARD_MAX_DETAIL = 0.22
export const LEARNED_CARD_MAX_DETAIL = 0.12
export const LOGO_MARK_LIKENESS = 0.8
export const LEARNED_MARK_FAMILIES = 2
export const LEARNED_MARK_BITS = 4
export const LEARNED_MARK_SHIFT_PX = 3

export const cornerMarksOf = async (body) => {
  const { data } = await sharp(body, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(WORK_WIDTH, WORK_HEIGHT, { fit: 'fill' })
    .flatten({ background: '#000' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const marks = Object.entries(WINDOWS).map(([corner, frame]) => cornerMarkOf({ data, corner, frame })).filter(Boolean)
  return { marks: marks.map(markTextOf).join(' '), detail: detailOf(data) }
}

export const logoMarkOf = async (body) => {
  const { data, info } = await sharp(body, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(LOGO_PX, LOGO_PX, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const mask = logoMaskOf({ data, width: info.width, height: info.height })
  const box = boundsOf({ mask, width: info.width, height: info.height })
  return box ? markTextOf({ corner: LOGO_CORNER, box, ...coverageOf({ mask, width: info.width, box }) }) : null
}

export const marksOf = (text) => String(text ?? '').split(' ').map(markOfText).filter(Boolean)

export const matchesLogo = ({ marks, logoMarks }) =>
  marks.some((mark) => logoMarks.some((logo) => likenessOf(mark, logo) >= LOGO_MARK_LIKENESS))

export const isSameMark = (a, b) => a.corner === b.corner
  && BOX_SIDES.every((side) => Math.abs(a.box[side] - b.box[side]) <= LEARNED_MARK_SHIFT_PX)
  && aspectsAgree({ a, b, tolerance: SAME_MARK_ASPECT })
  && bitDistanceOf(a.bits, b.bits) <= LEARNED_MARK_BITS

export const createMarkIndex = () => {
  const buckets = new Map()
  const marksBySource = new Map()

  const add = ({ source, marks, detail }) => {
    remove(source)
    if (!(detail < LEARNED_CARD_MAX_DETAIL)) return
    const kept = marks.filter(isLearnableMark)
    marksBySource.set(source, kept)
    for (const mark of kept) {
      const key = markBucketOf(mark)
      buckets.set(key, [...(buckets.get(key) ?? []), { source, mark }])
    }
  }

  const remove = (source) => {
    for (const mark of marksBySource.get(source) ?? []) {
      const key = markBucketOf(mark)
      const left = (buckets.get(key) ?? []).filter((entry) => entry.source !== source)
      if (left.length) buckets.set(key, left)
      else buckets.delete(key)
    }
    marksBySource.delete(source)
  }

  const sourcesSharing = (mark) => {
    const sources = new Set()
    for (const key of nearBucketsOf(mark)) {
      for (const entry of buckets.get(key) ?? []) if (isSameMark(mark, entry.mark)) sources.add(entry.source)
    }
    return sources
  }

  return { add, sourcesSharing }
}

export const isLearnableMark = (mark) => mark.bits.reduce((sum, bit) => sum + bit, 0) >= MIN_MARK_BITS

const nearBucketsOf = (mark) => [-1, 0, 1].flatMap((dx) => [-1, 0, 1]
  .map((dy) => bucketOf({ corner: mark.corner, x: bucketCell(mark.box.x0) + dx, y: bucketCell(mark.box.y0) + dy })))

const markBucketOf = (mark) => bucketOf({ corner: mark.corner, x: bucketCell(mark.box.x0), y: bucketCell(mark.box.y0) })

const cornerMarkOf = ({ data, corner, frame: [left, top, right, bottom] }) => {
  const x = Math.round(left * WORK_WIDTH)
  const y = Math.round(top * WORK_HEIGHT)
  const width = Math.round((right - left) * WORK_WIDTH)
  const height = Math.round((bottom - top) * WORK_HEIGHT)
  const grey = new Float32Array(width * height)
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) grey[row * width + column] = data[(y + row) * WORK_WIDTH + x + column]
  }
  const mask = foregroundOf({ grey, width, height })
  const box = markBoxOf({ mask, width, height, corner })
  return box ? { corner, box, ...coverageOf({ mask, width, box }) } : null
}

const foregroundOf = ({ grey, width, height, opaque = null }) => {
  const counts = (at) => !opaque || opaque[at]
  const outliers = residualMaskOf({ grey, width, height, fit: planeFitOf({ grey, width, height, use: counts }), use: counts })
  const fit = planeFitOf({ grey, width, height, use: (at) => counts(at) && !outliers[at] })
  return residualMaskOf({ grey, width, height, fit, use: counts })
}

const residualMaskOf = ({ grey, width, height, fit, use }) => {
  const mask = new Uint8Array(width * height)
  for (let at = 0; at < mask.length; at += 1) {
    mask[at] = use(at) && Math.abs(grey[at] - fit(at % width, Math.floor(at / width))) > FOREGROUND_STEP ? 1 : 0
  }
  return mask
}

const planeFitOf = ({ grey, width, height, use }) => {
  const sums = { n: 0, x: 0, y: 0, z: 0, xx: 0, yy: 0, xy: 0, xz: 0, yz: 0 }
  for (let at = 0; at < width * height; at += 1) {
    if (!use(at)) continue
    const x = at % width
    const y = Math.floor(at / width)
    const z = grey[at]
    sums.n += 1
    sums.x += x
    sums.y += y
    sums.z += z
    sums.xx += x * x
    sums.yy += y * y
    sums.xy += x * y
    sums.xz += x * z
    sums.yz += y * z
  }
  if (sums.n < 3) return () => 0
  const matrix = [[sums.xx, sums.xy, sums.x], [sums.xy, sums.yy, sums.y], [sums.x, sums.y, sums.n]]
  const target = [sums.xz, sums.yz, sums.z]
  const divisor = determinantOf(matrix)
  if (Math.abs(divisor) < 1e-9) return () => sums.z / sums.n
  const [a, b, c] = [0, 1, 2].map((column) => determinantOf(matrix.map((row, at) => row.map((value, k) => (k === column ? target[at] : value)))) / divisor)
  return (x, y) => a * x + b * y + c
}

const determinantOf = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])

const markBoxOf = ({ mask, width, height, corner }) => {
  const rows = Array.from({ length: height }, (_, y) => sumOf(mask, y * width, (y + 1) * width))
  const bands = runsOf({ profile: rows, minGap: BAND_GAP })
  if (!bands.length) return null
  const band = bandFor({ bands, corner })
  const columns = Array.from({ length: width }, (_, x) => {
    let total = 0
    for (let y = band.start; y <= band.end; y += 1) total += mask[y * width + x]
    return total
  })
  const clusters = runsOf({ profile: columns, minGap: CLUSTER_GAP })
  if (!clusters.length) return null
  const cluster = RIGHT_CORNERS.has(corner) ? clusters.at(-1) : clusters[0]
  return { x0: cluster.start, x1: cluster.end, y0: band.start, y1: band.end }
}

const bandFor = ({ bands, corner }) => {
  if (BOTTOM_CORNERS.has(corner)) return bands.at(-1)
  if (corner === MIDDLE_LEFT) return [...bands].sort((a, b) => (b.end - b.start) - (a.end - a.start))[0]
  return bands[0]
}

const runsOf = ({ profile, minGap }) => {
  const runs = []
  let open = null
  let gap = 0
  profile.forEach((value, at) => {
    if (value > 0) {
      if (open) open.end = at
      else {
        open = { start: at, end: at }
        runs.push(open)
      }
      gap = 0
      return
    }
    if (!open) return
    gap += 1
    if (gap >= minGap) open = null
  })
  return runs.filter((run) => run.end - run.start >= MIN_RUN)
}

const coverageOf = ({ mask, width, box }) => {
  const boxWidth = box.x1 - box.x0 + 1
  const boxHeight = box.y1 - box.y0 + 1
  const cells = []
  for (let cy = 0; cy < MARK_ROWS; cy += 1) {
    const top = box.y0 + Math.floor(cy * boxHeight / MARK_ROWS)
    const bottom = Math.max(top + 1, box.y0 + Math.floor((cy + 1) * boxHeight / MARK_ROWS))
    for (let cx = 0; cx < MARK_COLUMNS; cx += 1) {
      const left = box.x0 + Math.floor(cx * boxWidth / MARK_COLUMNS)
      const right = Math.max(left + 1, box.x0 + Math.floor((cx + 1) * boxWidth / MARK_COLUMNS))
      let on = 0
      for (let y = top; y < bottom; y += 1) on += sumOf(mask, y * width + left, y * width + right)
      cells.push(Math.round((on / ((bottom - top) * (right - left))) * LEVELS))
    }
  }
  return { cells, aspect: boxWidth / boxHeight }
}

const logoMaskOf = ({ data, width, height }) => {
  const size = width * height
  const opaque = new Uint8Array(size)
  for (let at = 0; at < size; at += 1) opaque[at] = data[at * 4 + 3] >= HALF_ALPHA ? 1 : 0
  if (sumOf(opaque, 0, size) / size < OPAQUE_LOGO_SHARE) return opaque
  const lowest = (at) => Math.min(data[at * 4], data[at * 4 + 1], data[at * 4 + 2])
  const edges = [0, width - 1, (height - 1) * width, size - 1, Math.floor(height / 2) * width, Math.floor(height / 2) * width + width - 1]
  const whiteGround = edges.filter((at) => opaque[at] && lowest(at) > WHITE_LEVEL).length >= WHITE_EDGES
  const glyphs = new Uint8Array(size)
  for (let at = 0; at < size; at += 1) glyphs[at] = opaque[at] && (lowest(at) > WHITE_LEVEL) !== whiteGround ? 1 : 0
  return glyphs
}

const boundsOf = ({ mask, width, height }) => {
  const box = { x0: width, y0: height, x1: -1, y1: -1 }
  for (let at = 0; at < mask.length; at += 1) {
    if (!mask[at]) continue
    const x = at % width
    const y = Math.floor(at / width)
    box.x0 = Math.min(box.x0, x)
    box.x1 = Math.max(box.x1, x)
    box.y0 = Math.min(box.y0, y)
    box.y1 = Math.max(box.y1, y)
  }
  return box.x1 < 0 ? null : box
}

const detailOf = (data) => {
  let busy = 0
  for (let y = 0; y < WORK_HEIGHT - 1; y += 1) {
    for (let x = 0; x < WORK_WIDTH - 1; x += 1) {
      const at = y * WORK_WIDTH + x
      if (Math.abs(data[at] - data[at + 1]) + Math.abs(data[at] - data[at + WORK_WIDTH]) > DETAIL_STEP) busy += 1
    }
  }
  return busy / ((WORK_WIDTH - 1) * (WORK_HEIGHT - 1))
}

const likenessOf = (a, b) => {
  if (!aspectsAgree({ a, b, tolerance: LOGO_ASPECT })) return 0
  const meanA = a.cells.reduce((sum, value) => sum + value, 0) / a.cells.length
  const meanB = b.cells.reduce((sum, value) => sum + value, 0) / b.cells.length
  let shared = 0
  let spreadA = 0
  let spreadB = 0
  a.cells.forEach((value, at) => {
    const da = value - meanA
    const db = b.cells[at] - meanB
    shared += da * db
    spreadA += da * da
    spreadB += db * db
  })
  return spreadA > 0 && spreadB > 0 ? shared / Math.sqrt(spreadA * spreadB) : 0
}

const aspectsAgree = ({ a, b, tolerance }) => {
  const ratio = a.aspect / b.aspect
  return ratio >= 1 / tolerance && ratio <= tolerance
}

const bitDistanceOf = (a, b) => {
  let distance = 0
  for (let at = 0; at < a.length; at += 1) distance += a[at] === b[at] ? 0 : 1
  return distance
}

const markTextOf = ({ corner, box, cells, aspect }) =>
  `${corner}:${box.x0},${box.y0},${box.x1},${box.y1}:${aspect.toFixed(3)}:${cells.map((cell) => cell.toString(16)).join('')}`

const markOfText = (text) => {
  const [corner, box, aspect, cells] = text.split(':')
  const [x0, y0, x1, y1] = String(box ?? '').split(',').map(Number)
  const values = [...String(cells ?? '')].map((cell) => parseInt(cell, 16))
  if (!corner || values.length !== MARK_ROWS * MARK_COLUMNS || values.some(Number.isNaN) || [x0, y0, x1, y1].some(Number.isNaN)) return null
  return { corner, box: { x0, y0, x1, y1 }, aspect: Number(aspect), cells: values, bits: values.map((value) => (value * 2 >= LEVELS ? 1 : 0)) }
}

const bucketCell = (px) => Math.floor(px / BUCKET_PX)

const bucketOf = ({ corner, x, y }) => `${corner}:${x}:${y}`

const sumOf = (values, from, to) => {
  let total = 0
  for (let at = from; at < to; at += 1) total += values[at]
  return total
}

const WORK_WIDTH = 320
const WORK_HEIGHT = 180
const WINDOWS = {
  tl: [0, 0, 0.42, 0.5],
  tr: [0.58, 0, 1, 0.5],
  bl: [0, 0.5, 0.42, 1],
  br: [0.58, 0.5, 1, 1],
  ml: [0, 0.25, 0.42, 0.75],
}
const RIGHT_CORNERS = new Set(['tr', 'br'])
const BOTTOM_CORNERS = new Set(['bl', 'br'])
const MIDDLE_LEFT = 'ml'
const LOGO_CORNER = 'logo'
const BOX_SIDES = ['x0', 'y0', 'x1', 'y1']
const MARK_COLUMNS = 16
const MARK_ROWS = 8
const LEVELS = 15
const FOREGROUND_STEP = 28
const DETAIL_STEP = 16
const BAND_GAP = 4
const CLUSTER_GAP = 8
const MIN_RUN = 3
const LOGO_PX = 200
const HALF_ALPHA = 128
const OPAQUE_LOGO_SHARE = 0.6
const WHITE_LEVEL = 215
const WHITE_EDGES = 3
const LOGO_ASPECT = 1.43
const SAME_MARK_ASPECT = 1.25
const BUCKET_PX = 8
const MIN_MARK_BITS = 12
const MAX_INPUT_PIXELS = 40_000_000
