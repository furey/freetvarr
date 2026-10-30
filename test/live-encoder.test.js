import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectLiveEncoder, detectCaptionDecoder, vaapiFilters } from '../src/live-encoder.js'

const openable = async () => null
const passes = async () => null

test('detectLiveEncoder: auto picks low-power VAAPI when the test encode passes', async () => {
  const encoder = await detectLiveEncoder({ canOpen: openable, probe: passes })
  assert.equal(encoder.kind, 'vaapi')
  assert.equal(encoder.lowPower, true)
})

test('detectLiveEncoder: falls back to full-power VAAPI when low-power fails', async () => {
  const probe = async ({ lowPower }) => (lowPower ? 'no low-power entrypoint' : null)
  const encoder = await detectLiveEncoder({ canOpen: openable, probe })
  assert.deepEqual({ kind: encoder.kind, lowPower: encoder.lowPower }, { kind: 'vaapi', lowPower: false })
})

test('detectLiveEncoder: falls back to software when every test encode fails', async () => {
  const encoder = await detectLiveEncoder({ canOpen: openable, probe: async () => 'driver missing' })
  assert.equal(encoder.kind, 'software')
  assert.match(encoder.reason, /driver missing/)
})

test('detectLiveEncoder: falls back to software when the device cannot be opened', async () => {
  let probed = false
  const encoder = await detectLiveEncoder({
    canOpen: async () => 'not found; pass /dev/dri into the container',
    probe: async () => { probed = true },
  })
  assert.equal(encoder.kind, 'software')
  assert.match(encoder.reason, /pass \/dev\/dri/)
  assert.equal(probed, false)
})

test('detectLiveEncoder: copy and software modes skip the hardware check', async () => {
  const fail = async () => { throw new Error('must not run') }
  assert.equal((await detectLiveEncoder({ mode: 'copy', canOpen: fail, probe: fail })).kind, 'copy')
  assert.equal((await detectLiveEncoder({ mode: 'software', canOpen: fail, probe: fail })).kind, 'software')
})

test('detectLiveEncoder: an unknown mode falls back to software and names the valid modes', async () => {
  const encoder = await detectLiveEncoder({ mode: 'gpu' })
  assert.equal(encoder.kind, 'software')
  assert.match(encoder.reason, /auto, hardware, software, copy/)
})

test('detectCaptionDecoder: finds the libzvbi teletext decoder in the ffmpeg decoder list', async () => {
  const withDecoder = ' S..... libzvbi_teletextdec  Libzvbi DVB teletext decoder (codec dvb_teletext)\n'
  assert.equal(await detectCaptionDecoder({ listDecoders: async () => withDecoder }), true)
  assert.equal(await detectCaptionDecoder({ listDecoders: async () => ' S..... dvbsub  DVB subtitles\n' }), false)
  assert.equal(await detectCaptionDecoder({ listDecoders: async () => { throw new Error('no ffmpeg') } }), false)
})

const scaledSizeOf = ({ width, height, sar = 1, heightCap }) => {
  const scale = vaapiFilters({ heightCap, deinterlace: false }).split(',setsar')[0]
  const [, w, h] = scale.match(/^scale_vaapi=w=(.+):h=(.+)$/)
  const evaluate = (expression) => Function('ih', 'dar', 'min', 'trunc', `return ${expression.replaceAll('\\,', ',')}`)(
    height, (width * sar) / height, Math.min, Math.trunc)
  return `${evaluate(w)}x${evaluate(h)}`
}

test('vaapiFilters: the width follows the display aspect of the source, in even square pixels', () => {
  assert.equal(scaledSizeOf({ width: 3840, height: 2160, heightCap: 1080 }), '1920x1080')
  assert.equal(scaledSizeOf({ width: 1920, height: 1080, heightCap: 720 }), '1280x720')
  assert.equal(scaledSizeOf({ width: 1440, height: 1080, sar: 4 / 3, heightCap: 720 }), '1280x720')
  assert.equal(scaledSizeOf({ width: 720, height: 576, sar: 64 / 45, heightCap: 576 }), '1024x576')
  assert.equal(scaledSizeOf({ width: 1280, height: 720, heightCap: 1080 }), '1280x720')
})

test('vaapiFilters: the output is marked square-pixel after scaling', () => {
  assert.match(vaapiFilters({ heightCap: 720 }), /^deinterlace_vaapi=auto=1,scale_vaapi=[^,]+(\\,[^,]+)*,setsar=1$/)
  assert.ok(!vaapiFilters({ heightCap: 1080 }).includes('w=-2'))
})
