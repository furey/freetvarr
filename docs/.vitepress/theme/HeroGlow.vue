<script setup>
import { useData } from 'vitepress'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { MIST_FRAG, MIST_VERT } from './mist-shader.js'

const { isDark } = useData()
const mounted = ref(false)
const started = ref(false)
const fallback = ref(false)
const live = computed(() => started.value && isDark.value)
const canvas = ref(null)
const origin = ref({ x: '75%', y: '45%' })
let stop = () => {}

onMounted(() => {
  mounted.value = true
  const start = () => { stop = startGlow() }
  window.requestIdleCallback ? requestIdleCallback(start, { timeout: 800 }) : setTimeout(start, 200)
})

onUnmounted(() => stop())

const hexToVec = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const GLOW_TOKENS = ['--ftv-primary', '--ftv-wordmark-blue', '--ftv-wordmark-orange', '--ftv-wordmark-yellow']
const COLOUR_HOLD_MS = 7000
const COLOUR_FADE_MS = 5000
const COLOUR_JITTER = 0.25
const GLOW_STRENGTH = 0.6

const glowColours = () => GLOW_TOKENS.map((name) => hexToVec(token(name)))

const pickOther = (count, previous) => {
  const choice = Math.floor(Math.random() * (count - 1))
  return choice >= previous ? choice + 1 : choice
}

const mixVec = (a, b, amount) => a.map((value, i) => value + (b[i] - value) * amount)

const ease = (x) => x * x * (3 - 2 * x)

const jitter = (ms) => ms * (1 + (Math.random() * 2 - 1) * COLOUR_JITTER)

const highlight = (colour) => mixVec(colour, [1, 1, 1], 0.35)

const buildProgram = (gl) => {
  const program = gl.createProgram()
  for (const [type, src] of [[gl.VERTEX_SHADER, MIST_VERT], [gl.FRAGMENT_SHADER, MIST_FRAG]]) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    gl.attachShader(program, shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  return program
}

const renderScale = (width, height) =>
  Math.min(devicePixelRatio * 0.5, Math.sqrt((width < 640 ? 120000 : 180000) / (width * height)))

const startGlow = () => {
  const el = canvas.value
  const hero = el?.closest('.VPHero')
  const gl = el?.getContext('webgl', { antialias: false, depth: false, powerPreference: 'low-power' })
  const program = gl && buildProgram(gl)
  if (!hero?.querySelector('.image-container')) return () => {}
  if (!program) {
    fallback.value = true
    return () => {}
  }
  const at = (name) => gl.getUniformLocation(program, name)
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const frameGap = 1000 / (innerWidth < 640 ? 30 : 60)
  let visible = true
  let frame = 0
  let last = 0
  let elapsed = 0
  let narrow = false

  const measure = () => {
    const box = hero.getBoundingClientRect()
    const telly = hero.querySelector('.image-container')?.getBoundingClientRect()
    const scale = renderScale(box.width, box.height)
    narrow = box.width < 960
    el.width = Math.round(box.width * scale)
    el.height = Math.round(box.height * scale)
    const x = telly.left - box.left + telly.width * (narrow ? 0.5 : 0.62)
    const y = telly.top - box.top + telly.height * 0.5
    origin.value = { x: `${x}px`, y: `${y}px` }
    gl.viewport(0, 0, el.width, el.height)
    gl.uniform2f(at('o'), x * scale, el.height - y * scale)
    gl.uniform1f(at('b'), el.height * 0.3)
    gl.uniform1f(at('s'), telly.width * (narrow ? 1.3 : 1.6) * 0.8 * scale)
    gl.uniform2fv(at('f'), narrow ? [0, 1.1] : [0.75, 0.12])
  }

  let colours = glowColours()
  let fromIndex = Math.floor(Math.random() * colours.length)
  let toIndex = pickOther(colours.length, fromIndex)
  let colourStart = 0
  let holdMs = jitter(COLOUR_HOLD_MS)
  let fadeMs = jitter(COLOUR_FADE_MS)

  const advanceColour = () => {
    if (elapsed - colourStart < holdMs + fadeMs) return
    fromIndex = toIndex
    toIndex = pickOther(colours.length, fromIndex)
    colourStart = elapsed
    holdMs = jitter(COLOUR_HOLD_MS)
    fadeMs = jitter(COLOUR_FADE_MS)
  }

  const currentColour = () => {
    advanceColour()
    const fade = Math.min(Math.max((elapsed - colourStart - holdMs) / fadeMs, 0), 1)
    return mixVec(colours[fromIndex], colours[toIndex], ease(fade))
  }

  const applyPalette = () => {
    colours = glowColours()
    gl.uniform1f(at('k'), GLOW_STRENGTH * (narrow ? 0.6 : 1))
  }

  const draw = () => {
    const colour = currentColour()
    gl.uniform3fv(at('c1'), colour)
    gl.uniform3fv(at('c2'), highlight(colour))
    gl.uniform1f(at('t'), elapsed / 1000 * 3.5 + 40)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const tick = (now) => {
    frame = requestAnimationFrame(tick)
    const gap = now - last
    if (gap < frameGap - 2) return
    elapsed += Math.min(gap, 100)
    last = now
    draw()
  }

  const shouldRun = () => isDark.value && visible && !document.hidden && !reducedMotion

  const sync = () => {
    cancelAnimationFrame(frame)
    if (!shouldRun()) return
    last = performance.now()
    frame = requestAnimationFrame(tick)
  }

  const redraw = () => { measure(); applyPalette(); draw() }

  const resizer = new ResizeObserver(redraw)
  const watcher = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() })
  const stopTheme = watch(isDark, () => { applyPalette(); draw(); sync() })
  const loseContext = () => { started.value = false; fallback.value = true; cancelAnimationFrame(frame) }

  resizer.observe(hero)
  watcher.observe(hero)
  document.addEventListener('visibilitychange', sync)
  el.addEventListener('webglcontextlost', loseContext)
  redraw()
  requestAnimationFrame(() => { started.value = true })
  sync()

  return () => {
    cancelAnimationFrame(frame)
    resizer.disconnect()
    watcher.disconnect()
    stopTheme()
    document.removeEventListener('visibilitychange', sync)
  }
}
</script>

<template>
  <Teleport v-if="mounted" to=".VPHero">
    <div class="hero-glow" :class="{ live, fallback }" :style="{ '--glow-x': origin.x, '--glow-y': origin.y }" aria-hidden="true">
      <canvas ref="canvas" />
    </div>
  </Teleport>
</template>

<style>
.VPHero.VPHero {
  position: relative;
  isolation: isolate;
}

.VPHero > .container {
  position: relative;
  z-index: 1;
}

.hero-glow {
  --glow-tint: rgba(26, 135, 230, 0.3);
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.dark .hero-glow { --glow-tint: rgba(92, 225, 198, 0.24); }

.hero-glow::before,
.hero-glow canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 3.5s ease-in-out;
}

.hero-glow::before {
  content: '';
  background: radial-gradient(55% 60% at var(--glow-x) var(--glow-y), var(--glow-tint), transparent 70%);
}

.dark .hero-glow.fallback::before,
.hero-glow.live canvas { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .hero-glow::before,
  .hero-glow canvas { transition: none; }
}
</style>
