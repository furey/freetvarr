import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const JPEG_QUALITY = 90
const CONCAT_FILE = 'frames.ffconcat'

export const startScreencast = async ({ page, dir }) => {
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const cdp = await page.context().newCDPSession(page)
  const frames = []
  const writes = []
  const startedAt = Date.now()
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
    const file = `${String(frames.length).padStart(6, '0')}.jpg`
    frames.push({ file, at: frameTime({ metadata, startedAt }) })
    writes.push(writeFile(join(dir, file), Buffer.from(data, 'base64')))
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: JPEG_QUALITY, everyNthFrame: 1 })
  const stop = async () => {
    const stoppedAt = Date.now() - startedAt
    await cdp.send('Page.stopScreencast').catch(() => {})
    await Promise.all(writes)
    await writeFile(join(dir, CONCAT_FILE), concatList({ frames, stoppedAt }))
    console.log(`SCREENCAST frames=${frames.length} seconds=${(stoppedAt / 1000).toFixed(1)}`)
  }
  return { startedAt, stop }
}

const frameTime = ({ metadata, startedAt }) => {
  const swappedAt = metadata.timestamp ? metadata.timestamp * 1000 : Date.now()
  return Math.max(0, swappedAt - startedAt)
}

const concatList = ({ frames, stoppedAt }) => {
  if (!frames.length) return 'ffconcat version 1.0\n'
  const entries = frames.map(({ file }, i) => {
    const endsAt = i + 1 < frames.length ? frames[i + 1].at : stoppedAt
    const startsAt = i === 0 ? 0 : frames[i].at
    return `file ${file}\nduration ${(Math.max(1, endsAt - startsAt) / 1000).toFixed(4)}`
  })
  return ['ffconcat version 1.0', ...entries, `file ${frames.at(-1).file}`, ''].join('\n')
}
