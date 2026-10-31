import { CLIPS, MARKS } from './clips.js'
import { el, pendingImages, ramp } from './kit.js'

const video = new URLSearchParams(location.search).get('v')
const { TIMELINE } = await import(`../${video}/timeline.js`)
const { buildScenes } = await import(`../${video}/scenes.js`)
const stage = document.getElementById('stage')
const builders = buildScenes({ clips: CLIPS, marks: MARKS })
const CROSS = 0.5

const scenes = TIMELINE.scenes.map((scene) => {
  const root = el(stage, 'div', 'layer')
  root.style.display = 'none'
  const update = builders[scene.id](root, scene)
  return { ...scene, root, update }
})

const sceneOpacity = (scene, t) => {
  const local = t - scene.start
  const fadeIn = scene.start === 0 ? 1 : ramp(local, -CROSS / 2, CROSS, (p) => p)
  const fadeOut = 1 - ramp(local, scene.duration - CROSS / 2, CROSS, (p) => p)
  return Math.min(fadeIn, fadeOut)
}

window.renderAt = async (t) => {
  for (const scene of scenes) {
    const local = t - scene.start
    const visible = local >= -CROSS / 2 && local < scene.duration + CROSS / 2
    scene.root.style.display = visible ? 'block' : 'none'
    if (!visible) continue
    scene.root.style.opacity = '1'
    scene.update(Math.max(0, local))
    const own = Number(scene.root.style.opacity || 1)
    scene.root.style.opacity = String(own * sceneOpacity(scene, t))
  }
  await document.fonts.ready
  await pendingImages()
  return true
}

window.stageReady = document.fonts.ready.then(() => true)
window.TOTAL = TIMELINE.duration
