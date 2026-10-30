import { watch } from '/vendor/vue.esm-browser.prod.js'
import { syncStatus } from '/shared/sync-status.js'

const FAVICON_SIZE = 32
const FAVICON_BG = '#141c24'
const FAVICON_CHIP_BASE_Y = 13
const FAVICON_CHIP_WIDTH = 8
const FAVICON_CHIP_HEIGHT = 6
const FAVICON_BOB_AMPLITUDE = 4
const FAVICON_BOB_PERIOD_MS = 900
const FAVICON_FRAME_INTERVAL_MS = 90
const FAVICON_CHIPS = [
  { x: 3,  color: '#3ba4ff' },
  { x: 12, color: '#f28c28' },
  { x: 21, color: '#f5c542' },
]

const FAVICON_REC_DISC = { x: 16, y: 16, radius: 6.5, color: '#ff4d4f' }

let faviconCanvas = null
let faviconCtx = null
let faviconLink = null
let faviconTimer = null
let faviconStart = 0
let faviconRecording = false

const ensureFaviconCanvas = () => {
  if (faviconCanvas) return
  faviconCanvas = document.createElement('canvas')
  faviconCanvas.width = FAVICON_SIZE
  faviconCanvas.height = FAVICON_SIZE
  faviconCtx = faviconCanvas.getContext('2d')
  faviconLink = document.querySelector('link[rel="icon"][type="image/svg+xml"]')
  faviconLink.type = 'image/png'
}

const drawFaviconFrame = (now, { bob = true } = {}) => {
  if (faviconRecording) return drawFaviconRecording()
  const phase = ((now - faviconStart) / FAVICON_BOB_PERIOD_MS) * Math.PI * 2
  faviconCtx.fillStyle = FAVICON_BG
  faviconCtx.fillRect(0, 0, FAVICON_SIZE, FAVICON_SIZE)
  FAVICON_CHIPS.forEach((chip, index) => {
    const stagger = (index / FAVICON_CHIPS.length) * Math.PI * 2
    const offset = bob ? Math.sin(phase + stagger) * FAVICON_BOB_AMPLITUDE : 0
    faviconCtx.fillStyle = chip.color
    faviconCtx.fillRect(chip.x, FAVICON_CHIP_BASE_Y - offset, FAVICON_CHIP_WIDTH, FAVICON_CHIP_HEIGHT)
  })
  faviconLink.href = faviconCanvas.toDataURL('image/png')
}

const drawFaviconRecording = () => {
  faviconCtx.fillStyle = FAVICON_BG
  faviconCtx.fillRect(0, 0, FAVICON_SIZE, FAVICON_SIZE)
  faviconCtx.fillStyle = FAVICON_REC_DISC.color
  faviconCtx.beginPath()
  faviconCtx.arc(FAVICON_REC_DISC.x, FAVICON_REC_DISC.y, FAVICON_REC_DISC.radius, 0, Math.PI * 2)
  faviconCtx.fill()
  faviconLink.href = faviconCanvas.toDataURL('image/png')
}

const showFaviconAtRest = () => {
  if (!faviconRecording) {
    if (faviconLink) {
      faviconLink.type = 'image/svg+xml'
      faviconLink.href = '/favicon.svg'
    }
    return
  }
  ensureFaviconCanvas()
  drawFaviconFrame(0, { bob: false })
}

export const setFaviconRecording = (recording) => {
  faviconRecording = recording
  if (!faviconTimer) showFaviconAtRest()
}

const startFaviconAnimation = () => {
  ensureFaviconCanvas()
  if (faviconTimer) return
  faviconStart = performance.now()
  faviconTimer = setInterval(() => drawFaviconFrame(performance.now()), FAVICON_FRAME_INTERVAL_MS)
}

const stopFaviconAnimation = () => {
  if (faviconTimer) {
    clearInterval(faviconTimer)
    faviconTimer = null
  }
  showFaviconAtRest()
}

watch(() => syncStatus.value.activeSyncId, (curr) => {
  if (curr) startFaviconAnimation()
  else stopFaviconAnimation()
})
