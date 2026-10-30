import { ref, watch, onMounted, onUnmounted } from '/vendor/vue.esm-browser.prod.js'
import { diagramMarkup } from '/system-diagram.js'
import { prefersReducedMotion } from '/shared/utils.js'

export const SystemDiagram = {
  props: {
    focus: { type: Object, default: () => ({ ids: [], current: '', edges: [] }) },
    interactive: Boolean,
  },
  emits: ['select'],
  template: `<div ref="host" class="sd-host" v-html="markup" @click="onClick" @keydown="onKeydown"></div>`,
  setup(props, { emit, expose }) {
    const host = ref(null)
    const markup = diagramMarkup({ interactive: props.interactive })
    let travelToken = 0
    const svg = () => host.value?.querySelector('svg')
    const render = () => applyFocus({ svg: svg(), focus: props.focus })
    const pieceOf = (event) => event.target.closest?.('[data-piece]')?.dataset.piece || ''
    const onClick = (event) => {
      const piece = props.interactive && pieceOf(event)
      if (piece) emit('select', piece)
    }
    const onKeydown = (event) => {
      if (!props.interactive || !SELECT_KEYS.includes(event.key)) return
      const piece = pieceOf(event)
      if (!piece) return
      event.preventDefault()
      emit('select', piece)
    }
    const travel = (edgeId) => {
      const token = ++travelToken
      return travelDot({ svg: svg(), edgeId, isCurrent: () => token === travelToken })
    }
    watch(() => props.focus, render, { deep: true, flush: 'post' })
    onMounted(render)
    onUnmounted(() => { travelToken += 1 })
    expose({ travel })
    return { host, markup, onClick, onKeydown }
  },
}

const SELECT_KEYS = ['Enter', ' ']
const TRAVEL_MS = 800
const FADE_SHARE = 0.08

const applyFocus = ({ svg, focus }) => {
  if (!svg) return
  const ids = focus?.ids ?? []
  const edges = focus?.edges ?? []
  svg.classList.toggle('is-focused', ids.length > 0)
  svg.querySelectorAll('.sd-node').forEach((node) => {
    node.classList.toggle('is-on', ids.includes(node.dataset.piece))
    node.classList.toggle('is-current', node.dataset.piece === focus?.current)
    if (node.hasAttribute('tabindex')) node.setAttribute('aria-pressed', String(node.dataset.piece === focus?.current))
  })
  svg.querySelectorAll('[data-edge]').forEach((path) => path.classList.toggle('is-on', edges.includes(path.dataset.edge)))
  svg.querySelectorAll('[data-edge-arrow]').forEach((arrow) => arrow.classList.toggle('is-on', edges.includes(arrow.dataset.edgeArrow)))
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

const dotOpacityAt = (t) => {
  if (t < FADE_SHARE) return t / FADE_SHARE
  if (t > 1 - FADE_SHARE) return (1 - t) / FADE_SHARE
  return 1
}

const travelDot = ({ svg, edgeId, isCurrent }) => new Promise((resolve) => {
  const path = svg?.querySelector(`[data-edge="${edgeId}"]`)
  const dot = svg?.querySelector('.sd-dot')
  if (!path || !dot || prefersReducedMotion() || document.visibilityState !== 'visible') return resolve()
  const length = path.getTotalLength()
  const start = performance.now()
  const frame = (now) => {
    if (!isCurrent()) {
      dot.style.opacity = 0
      return resolve()
    }
    const t = Math.min(1, (now - start) / TRAVEL_MS)
    const point = path.getPointAtLength(length * easeInOut(t))
    dot.setAttribute('cx', point.x)
    dot.setAttribute('cy', point.y)
    dot.style.opacity = dotOpacityAt(t)
    if (t < 1) return requestAnimationFrame(frame)
    dot.style.opacity = 0
    resolve()
  }
  requestAnimationFrame(frame)
})
