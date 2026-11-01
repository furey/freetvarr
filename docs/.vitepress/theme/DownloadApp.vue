<script setup>
import { ref, computed, onMounted } from 'vue'

const releaseUrl = 'https://github.com/furey/fetch-my-recordings/releases/latest/download/'
const pageAddress = 'furey.github.io/freetvarr/guide/leaving-fetch'

const downloads = {
  mac: { label: 'Mac (any Mac)', file: 'Fetch-My-Recordings-Mac.dmg' },
  macApple: { label: 'Mac with an Apple chip (smaller)', file: 'Fetch-My-Recordings-Mac-Apple-Chip.dmg' },
  macIntel: { label: 'Mac with an Intel chip (smaller)', file: 'Fetch-My-Recordings-Mac-Intel.dmg' },
  windows: { label: 'Windows PC', file: 'Fetch-My-Recordings-Windows.exe' },
  linux: { label: 'Linux', file: 'Fetch-My-Recordings-Linux.AppImage' },
  linuxArm: { label: 'Linux on ARM (such as a Raspberry Pi)', file: 'Fetch-My-Recordings-Linux-ARM.AppImage' }
}

const buttonLabels = { mac: 'Download for Mac', windows: 'Download for Windows', linux: 'Download for Linux' }
const macChipDownloads = { apple: 'macApple', intel: 'macIntel' }
const macChipNames = { apple: 'an Apple chip', intel: 'an Intel chip' }

const addressParts = pageAddress.split(/(?=\/)/)

const downloadUrl = (key) => `${releaseUrl}${downloads[key].file}`

const system = ref('unknown')
const macChip = ref(null)

const buttonLabel = computed(() => buttonLabels[system.value] ?? null)
const primary = computed(() => {
  if (system.value !== 'mac') return buttonLabel.value ? system.value : null
  return macChipDownloads[macChip.value] ?? 'mac'
})
const macChipName = computed(() => macChipNames[macChip.value])
const isUnsupportedDevice = computed(() => system.value === 'device')
const otherKeys = computed(() => {
  const shownAbove = keysShownAbove()
  return Object.keys(downloads).filter((key) => !shownAbove.includes(key))
})
const listHeading = computed(() => (primary.value ? 'Other computers' : 'Choose your computer'))

const keysShownAbove = () => {
  if (system.value === 'linux') return ['linux', 'linuxArm']
  if (system.value === 'mac' && macChip.value) return ['mac', primary.value]
  return [primary.value]
}

onMounted(async () => {
  system.value = detectSystem(window.navigator)
  if (system.value === 'mac') macChip.value = await detectMacChip(window.navigator)
})

const detectSystem = (nav) => {
  const userAgent = (nav.userAgent || '').toLowerCase()
  const platform = (nav.userAgentData?.platform || nav.platform || '').toLowerCase()
  if (isPhoneTabletOrChromebook({ nav, userAgent, platform })) return 'device'
  if (platform.includes('mac') || userAgent.includes('macintosh')) return 'mac'
  if (platform.includes('win') || userAgent.includes('windows')) return 'windows'
  if (platform.includes('linux') || userAgent.includes('x11')) return 'linux'
  return 'unknown'
}

const isPhoneTabletOrChromebook = ({ nav, userAgent, platform }) => {
  if (nav.userAgentData?.mobile) return true
  if (/iphone|ipad|ipod|android|cros/.test(userAgent)) return true
  if (/ios|android|chrome os|chromeos/.test(platform)) return true
  return isIpadReportingAsMac({ nav, platform })
}

const isIpadReportingAsMac = ({ nav, platform }) => platform.includes('mac') && nav.maxTouchPoints > 1

const detectMacChip = async (nav) => (await chipFromClientHints(nav)) ?? chipFromGraphicsRenderer()

const chipFromClientHints = async (nav) => {
  try {
    const { architecture } = await nav.userAgentData.getHighEntropyValues(['architecture'])
    if (architecture === 'arm') return 'apple'
    if (architecture === 'x86') return 'intel'
    return null
  } catch {
    return null
  }
}

const chipFromGraphicsRenderer = () => {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    if (/\bapple m\d/i.test(renderer)) return 'apple'
    if (/\bintel/i.test(renderer)) return 'intel'
    return null
  } catch {
    return null
  }
}
</script>

<template>
  <section class="download-app" aria-label="Download Fetch My Recordings">
    <div v-if="primary" class="download-app__primary">
      <a class="download-app__button" :href="downloadUrl(primary)">{{ buttonLabel }}</a>
      <p class="download-app__note">
        <template v-if="macChipName">For Macs with {{ macChipName }}. </template>
        <template v-else-if="primary === 'mac'">Works on any Mac. </template>
        Free. The file, <code>{{ downloads[primary].file }}</code>, goes to your Downloads folder.
      </p>
      <p v-if="macChipName" class="download-app__note">
        Not sure? <a :href="downloadUrl('mac')">Download the version for any Mac</a>.
      </p>
      <p v-else-if="primary === 'mac'" class="download-app__note">
        Smaller versions for each kind of Mac are in the list below. To see which one you have, choose
        Apple menu → About This Mac. A <strong>Chip</strong> line (Apple M1, M2, and so on) means an Apple chip;
        a <strong>Processor</strong> line means an Intel chip.
      </p>
      <p v-if="primary === 'linux'" class="download-app__note">
        On a Raspberry Pi or other ARM computer,
        <a :href="downloadUrl('linuxArm')">download the ARM version</a> instead.
      </p>
    </div>

    <p v-if="isUnsupportedDevice" class="download-app__device">
      The app runs on a Mac, a Windows PC, or a Linux computer. To download it, open this page on that computer:
      <code class="download-app__address">
        <template v-for="(part, index) in addressParts" :key="index"><wbr v-if="index" />{{ part }}</template>
      </code>
    </p>

    <div class="download-app__others">
      <p class="download-app__heading">{{ listHeading }}</p>
      <ul class="download-app__list">
        <li v-for="key in otherKeys" :key="key">
          <a class="download-app__row" :href="downloadUrl(key)">
            <span class="download-app__label">{{ downloads[key].label }}</span>
            <span class="download-app__file">{{ downloads[key].file }}</span>
          </a>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.download-app {
  margin: 24px 0;
}

.download-app__primary {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 24px;
}

.vp-doc .download-app__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  padding: 12px 28px;
  border-radius: 12px;
  background: var(--ftv-primary);
  color: var(--ftv-on-primary);
  font-size: 18px;
  font-weight: 700;
  line-height: 24px;
  text-align: center;
  text-decoration: none;
  text-wrap: balance;
  transition: background-color var(--ftv-motion) var(--ftv-ease), transform var(--ftv-motion) var(--ftv-ease);
}

.vp-doc .download-app__button:hover {
  background: var(--ftv-primary-hi);
  color: var(--ftv-on-primary);
}

.vp-doc .download-app__button:active {
  transform: scale(0.97);
  transition-duration: 70ms;
}

.vp-doc .download-app__note,
.vp-doc .download-app__device {
  max-width: 560px;
  margin: 0;
  color: var(--ftv-text-2);
  font-size: 15px;
  line-height: 22px;
  text-wrap: pretty;
}

.vp-doc .download-app__device {
  margin-bottom: 24px;
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--ftv-surface-1);
  color: var(--ftv-text-1);
  font-size: 16px;
  line-height: 24px;
}

.vp-doc .download-app__address {
  display: block;
  width: fit-content;
  margin-top: 8px;
  font-size: 15px;
}

.vp-doc .download-app__note code {
  white-space: nowrap;
}

.vp-doc .download-app__heading {
  margin: 0 0 8px;
  color: var(--ftv-text-2);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  text-wrap: balance;
}

.vp-doc .download-app__list {
  margin: 0;
  padding: 0;
  border: 1px solid var(--ftv-hairline);
  border-radius: 12px;
  list-style: none;
  overflow: hidden;
}

.vp-doc .download-app__list li {
  margin: 0;
}

.vp-doc .download-app__list li + li {
  border-top: 1px solid var(--ftv-hairline);
}

.vp-doc .download-app__row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 2px 16px;
  padding: 12px 16px;
  color: var(--ftv-text-1);
  text-decoration: none;
  transition: background-color var(--ftv-motion) var(--ftv-ease);
}

.vp-doc .download-app__row:hover {
  background: var(--ftv-surface-1);
}

.vp-doc .download-app__row:hover .download-app__label {
  color: var(--ftv-primary-text);
}

.download-app__label {
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  text-wrap: balance;
  transition: color var(--ftv-motion) var(--ftv-ease);
}

.download-app__file {
  color: var(--ftv-text-3);
  font-family: "Geist Mono", var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .download-app__primary {
    align-items: stretch;
  }

  .vp-doc .download-app__row {
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .vp-doc .download-app__button,
  .vp-doc .download-app__row,
  .download-app__label {
    transition: none;
  }

  .vp-doc .download-app__button:active {
    transform: none;
  }
}
</style>
