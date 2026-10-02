import fs from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { execFile } from 'child_process'

export const LIVE_TRANSCODE_MODES = ['auto', 'hardware', 'software', 'copy']
export const DEFAULT_VAAPI_DEVICE = '/dev/dri/renderD128'
export const VAAPI_HEIGHT_CAP = 720

export const detectLiveEncoder = async ({
  mode = 'auto',
  device = DEFAULT_VAAPI_DEVICE,
  canOpen = canOpenDevice,
  probe = probeVaapi,
} = {}) => {
  if (!LIVE_TRANSCODE_MODES.includes(mode)) {
    return software(`LIVE_TV_TRANSCODE="${mode}" is not one of ${LIVE_TRANSCODE_MODES.join(', ')}`)
  }
  if (mode === 'copy') return { kind: 'copy', reason: 'LIVE_TV_TRANSCODE=copy' }
  if (mode === 'software') return software('LIVE_TV_TRANSCODE=software')
  const openError = await canOpen(device)
  if (openError) return software(`${device} is not usable (${openError})`)
  for (const lowPower of [true, false]) {
    const error = await probe({ device, lowPower })
    if (!error) {
      return { kind: 'vaapi', device, lowPower, reason: `VAAPI test encode passed on ${device}` }
    }
    if (!lowPower) return software(`VAAPI test encode failed on ${device}: ${error}`)
  }
  return software('VAAPI unavailable')
}

export const describeLiveEncoder = (encoder) => {
  if (encoder.kind === 'vaapi') {
    return `hardware (VAAPI${encoder.lowPower ? ', low-power' : ''}): ${encoder.reason}`
  }
  return `${encoder.kind}: ${encoder.reason}`
}

export const vaapiProbeArgs = ({ device, lowPower }) => [
  '-hide_banner', '-loglevel', 'error',
  '-init_hw_device', `vaapi=va:${device}`,
  '-filter_hw_device', 'va',
  '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=25:duration=0.2',
  '-vf', `format=nv12,hwupload,${vaapiFilters()}`,
  ...vaapiEncoderArgs({ lowPower }),
  '-frames:v', '2',
  '-f', 'null', '-',
]

export const vaapiFilters = () =>
  `deinterlace_vaapi=auto=1,scale_vaapi=w=-2:h=min(ih\\,${VAAPI_HEIGHT_CAP})`

export const vaapiEncoderArgs = ({ lowPower }) => [
  '-c:v', 'h264_vaapi',
  ...(lowPower ? ['-low_power', '1'] : []),
  '-qp', '24',
]

const software = (reason) => ({ kind: 'software', reason })

const canOpenDevice = async (device) => {
  try {
    await fs.access(device, fsConstants.R_OK | fsConstants.W_OK)
    return null
  } catch (err) {
    if (err.code === 'ENOENT') return 'not found; pass /dev/dri into the container'
    if (err.code === 'EACCES') {
      return `permission denied for uid ${process.getuid?.()}; add the group that owns it to the container`
    }
    return err.code || err.message
  }
}

const probeVaapi = ({ device, lowPower }) => new Promise((resolve) => {
  execFile('ffmpeg', vaapiProbeArgs({ device, lowPower }), { timeout: PROBE_TIMEOUT_MS }, (err, stdout, stderr) => {
    if (!err) return resolve(null)
    resolve(lastLine(stderr) || err.message)
  })
})

const lastLine = (text) => String(text || '').trim().split('\n').pop()

const PROBE_TIMEOUT_MS = 20_000
