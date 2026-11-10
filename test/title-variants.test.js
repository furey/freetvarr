import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-title-variants-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')
process.env.TZ = 'Australia/Sydney'

const {
  guideTitleIndexOf,
  isCandidateVariant,
  isVariantTitle,
  loadTitleVariants,
  loadVariantCandidates,
  variantTitlesOf,
  nextVariantsOf,
  saveTitleVariants,
  variantsForTitle,
} = await import('../src/title-variants.js')
const { db } = await import('../src/db.js')

before(() => db.migrate.latest())

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('isVariantTitle: a region, encore, or year word after the series title, either way round', () => {
  const variant = (title, candidate) => isVariantTitle({ title, candidate })
  assert.equal(variant('Big Brother', 'Big Brother Australia'), true)
  assert.equal(variant('Big Brother Australia', 'Big Brother'), true)
  assert.equal(variant('Hard Quiz', 'Hard Quiz NZ'), true)
  assert.equal(variant('Hard Quiz', 'hard quiz new zealand'), true)
  assert.equal(variant('Hard Quiz', 'Hard Quiz Aotearoa'), true)
  assert.equal(variant('Hard Quiz', 'Hard Quiz AUS'), true)
  assert.equal(variant('Hard Quiz', 'Hard Quiz AU'), true)
  assert.equal(variant('Gruen', 'Gruen Encore'), true)
  assert.equal(variant('Survivor', 'Survivor 2026'), true)
  assert.equal(variant('Hard Quiz', 'Hard Quiz Kids'), false)
  assert.equal(variant('Survivor', 'Australian Survivor'), false)
  assert.equal(variant('Big Brother', 'Big Brother: Australia'), false)
  assert.equal(variant('Big Brother', 'Big Brother'), false)
  assert.equal(variant('Survivor', 'Survivor 1066'), false)
})

test('nextVariantsOf: adds once, ignoring case, and removes', () => {
  assert.deepEqual(nextVariantsOf({ current: ['A NZ'], variant: 'a nz', enabled: true }), ['a nz'])
  assert.deepEqual(nextVariantsOf({ current: ['A NZ', 'A AU'], variant: 'a nz', enabled: false }), ['A AU'])
})

test('saveTitleVariants: the chosen titles round-trip by series name and survive a reload', async () => {
  await saveTitleVariants({ title: 'Big Brother', variants: ['Big Brother Australia'] })
  await saveTitleVariants({ title: 'The Chase', variants: [] })
  assert.deepEqual(await variantsForTitle('big brother'), ['Big Brother Australia'])
  assert.deepEqual([...(await loadTitleVariants())], [['big-brother', ['Big Brother Australia']]])
  await saveTitleVariants({ title: 'Big Brother', variants: [] })
  assert.deepEqual(await variantsForTitle('Big Brother'), [])
})

test('isVariantTitle: the region words come from the install country', () => {
  const variant = (country, candidate) => isVariantTitle({ title: 'Big Brother', candidate, country })
  assert.equal(variant('au', 'Big Brother NZ'), true)
  assert.equal(variant('nz', 'Big Brother Australia'), true)
  assert.equal(variant('nz', 'Big Brother Aotearoa'), true)
  assert.equal(variant('uk', 'Big Brother UK'), true)
  assert.equal(variant('uk', 'Big Brother Britain'), true)
  assert.equal(variant('uk', 'Big Brother Australia'), false)
  assert.equal(variant('us', 'Big Brother USA'), true)
  assert.equal(variant('us', 'Big Brother America'), true)
  assert.equal(variant('us', 'Big Brother UK'), false)
  assert.equal(variant('ca', 'Big Brother Canada'), true)
  assert.equal(variant('ie', 'Big Brother Ireland'), true)
  assert.equal(variant('de', 'Big Brother Germany'), true)
  assert.equal(variant('de', 'Big Brother DE'), true)
  assert.equal(variant('', 'Big Brother Australia'), false)
  assert.equal(variant('', 'Big Brother UK'), false)
  for (const country of ['au', 'uk', 'us', 'de', '']) {
    assert.equal(variant(country, 'Big Brother Encore'), true, country)
    assert.equal(variant(country, 'Big Brother 2026'), true, country)
  }
})

test('isVariantTitle: a UK install offers no switch for its own edition, which the rule already records', () => {
  assert.equal(isVariantTitle({ title: 'Say Yes To The Dress', candidate: 'Say Yes To The Dress: UK', country: 'uk' }), false)
  assert.equal(isVariantTitle({ title: 'Say Yes To The Dress', candidate: 'Say Yes To The Dress UK', country: 'uk' }), true)
})

test('isVariantTitle: a country code counts only in capitals, a country name in any case', () => {
  const variant = (country, title, candidate) => isVariantTitle({ title, candidate, country })
  assert.equal(variant('us', 'Fool', 'Fool Us'), false)
  assert.equal(variant('us', 'Fool Us', 'Fool'), false)
  assert.equal(variant('us', 'Fool', 'Fool US'), true)
  assert.equal(variant('us', 'Fool', 'fool america'), true)
  assert.equal(variant('it', 'Fix', 'Fix It'), false)
  assert.equal(variant('it', 'Fix', 'Fix IT'), true)
  assert.equal(variant('it', 'Fix', 'Fix italy'), true)
  assert.equal(variant('no', 'Say', 'Say No'), false)
  assert.equal(variant('au', 'Hard Quiz', 'Hard Quiz Au'), false)
  assert.equal(variant('au', 'Hard Quiz', 'Hard Quiz AU'), true)
  assert.equal(variant('au', 'Hard Quiz', 'hard quiz aotearoa'), true)
})

test('variant candidates: a Freeview title never seen in mjh that agrees with the series title is offered; other candidates and titles are not', async () => {
  await db('title_aliases').insert([
    { source: 'freeview-au', source_title: 'Gogglebox Celebrity Edition', title: null, kind: 'variant-candidate', first_seen_at: 1, last_seen_at: 1 },
    { source: 'freeview-au', source_title: 'Hard Quiz', title: null, kind: 'variant-candidate', first_seen_at: 1, last_seen_at: 1 },
    { source: 'freeview-au', source_title: 'Gogglebox Unseen', title: 'Gogglebox', kind: 'alias', first_seen_at: 1, last_seen_at: 1 },
  ])
  const candidates = await loadVariantCandidates()
  assert.deepEqual([...candidates].sort(), ['gogglebox celebrity edition', 'hard quiz'])
  assert.equal(isCandidateVariant({ title: 'Gogglebox', candidate: 'Gogglebox Celebrity Edition', candidates }), true)
  assert.equal(isCandidateVariant({ title: 'Gogglebox', candidate: 'Hard Quiz', candidates }), false)
  assert.equal(isCandidateVariant({ title: 'Gogglebox', candidate: 'Gogglebox Unseen', candidates }), false)
  const nowMs = Date.parse('2026-11-10T00:00:00Z')
  const airings = ['Gogglebox Celebrity Edition', 'Gogglebox Unseen', 'Hard Quiz'].map((title) => ({ title, end: nowMs + 3_600_000 }))
  const titleIndex = guideTitleIndexOf({ airings, nowMs })
  assert.deepEqual(variantTitlesOf({ title: 'Gogglebox', titleIndex, candidates }).map((v) => v.title), ['Gogglebox Celebrity Edition'])
  assert.deepEqual(variantTitlesOf({ title: 'Gogglebox', titleIndex }), [])
})
