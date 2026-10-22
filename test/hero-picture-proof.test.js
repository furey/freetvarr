import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'

import { PROOF_FAIL_TTL_MS, PROOF_PASS_TTL_MS, createHeroPictureProof, pictureWidthOf } from '../src/hero-picture-proof.js'

const picture = (width) => ({ body: Buffer.from(`w${width}`), contentType: 'image/webp', width })

const proofWith = ({ answers, clock = { ms: 0 } }) => {
  const asked = []
  const noted = []
  const proof = createHeroPictureProof({
    resolve: async (url) => {
      asked.push(url)
      const answer = answers[url.split('?')[0]]
      return typeof answer === 'function' ? answer(url) : answer
    },
    measure: async (image) => image.width,
    noteServed: (served) => noted.push(served.url),
    now: () => clock.ms,
    yieldTurn: async () => {},
  })
  return { proof, asked, noted, clock }
}

test('a picture 640 px or wider at the 1920 request passes, warms 768 and 1280, and feeds image focus', async () => {
  const { proof, asked, noted } = proofWith({ answers: { '/api/epg/image/1': { image: picture(1280), pending: false } } })
  const verdict = await proof.proofHeroPicture('/api/epg/image/1?w=768')
  assert.equal(verdict.status, 'pass')
  assert.equal(verdict.width, 1280)
  assert.match(verdict.contentKey, /^[0-9a-f]{16}$/)
  assert.deepEqual(asked, ['/api/epg/image/1?w=1920', '/api/epg/image/1?w=768', '/api/epg/image/1?w=1280'])
  assert.deepEqual(noted, ['/api/epg/image/1?w=1920'])
})

test('a picture narrower than 640 px fails, and so does a missing or unreadable one', async () => {
  const { proof } = proofWith({
    answers: {
      '/small': { image: picture(639), pending: false },
      '/missing': { image: null, pending: false },
      '/text': { image: { body: Buffer.from('x'), contentType: 'text/html', width: 1920 }, pending: false },
      '/throws': () => { throw new Error('boom') },
    },
  })
  assert.deepEqual(await proof.proofHeroPicture('/small?w=768'), { status: 'too-small', width: 639 })
  assert.equal((await proof.proofHeroPicture('/missing?w=768')).status, 'missing')
  assert.equal((await proof.proofHeroPicture('/text?w=768')).status, 'unreadable')
  assert.equal((await proof.proofHeroPicture('/throws?w=768')).status, 'missing')
  assert.equal((await proof.proofHeroPicture(null)).status, 'missing')
})

test('a lookup still in flight is pending and is asked again next time', async () => {
  let pending = true
  const { proof, asked } = proofWith({
    answers: { '/later': () => (pending ? { image: null, pending: true } : { image: picture(1920), pending: false }) },
  })
  assert.equal((await proof.proofHeroPicture('/later?w=768')).status, 'pending')
  pending = false
  assert.equal((await proof.proofHeroPicture('/later?w=768')).status, 'pass')
  assert.equal(asked.filter((url) => url.endsWith('w=1920')).length, 2)
})

test('a pass is kept for six hours and a fail for thirty minutes, keyed by url without the width', async () => {
  const answers = { '/a': { image: picture(1920), pending: false }, '/b': { image: null, pending: false } }
  const { proof, asked, clock } = proofWith({ answers })
  await proof.proofHeroPicture('/a?w=768&c=1')
  await proof.proofHeroPicture('/b?w=768')
  const askedBefore = asked.length
  clock.ms = PROOF_FAIL_TTL_MS - 1
  await proof.proofHeroPicture('/a?c=1&w=384')
  await proof.proofHeroPicture('/b?w=768')
  assert.equal(asked.length, askedBefore)
  clock.ms = PROOF_FAIL_TTL_MS
  await proof.proofHeroPicture('/b?w=768')
  assert.equal(asked.length, askedBefore + 1)
  await proof.proofHeroPicture('/a?w=768&c=2')
  assert.ok(asked.includes('/a?c=2&w=1920'))
  const askedAfterNewStamp = asked.length
  clock.ms = PROOF_PASS_TTL_MS
  await proof.proofHeroPicture('/a?w=768&c=1')
  assert.ok(asked.length > askedAfterNewStamp)
})

test('pictureWidthOf reads the decoded width with sharp', async () => {
  const body = await sharp({ create: { width: 700, height: 394, channels: 3, background: '#123456' } }).webp().toBuffer()
  assert.equal(await pictureWidthOf({ body, contentType: 'image/webp' }), 700)
})
