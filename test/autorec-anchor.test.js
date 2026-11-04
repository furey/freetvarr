import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freetvarr-autorec-anchor-'))
process.env.DB_PATH = path.join(tmpDir, 'state.db')

const {
  AUTOREC_ANCHOR_DONE_KEY,
  anchorPlanOf,
  readAnchorFailures,
  runAutorecAnchorOnce,
} = await import('../src/autorec-anchor.js')
const { autorecMatchFieldsOf, autorecMatchesAiring } = await import('../src/autorec-match.js')
const { db, getSetting } = await import('../src/db.js')

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/tvh/${name}.json`, import.meta.url), 'utf8'))
const LIVE_RULES = fixture('live-autorec-grid')
const LIVE_TIMERS = fixture('live-grid-upcoming')

const quietLog = () => {
  const lines = []
  return { lines, log: (line) => lines.push(line), warn: (line) => lines.push(line) }
}

const fakeTvh = ({ autorecs = LIVE_RULES, upcoming = LIVE_TIMERS, failSave = () => false, ignoreSave = () => false } = {}) => {
  const saves = []
  let rules = autorecs.entries.map((rule) => ({ ...rule }))
  return {
    saves,
    read: async (route) => (route === 'dvr/autorec/grid' ? { entries: rules.map((rule) => ({ ...rule })) } : upcoming),
    write: async (route, form) => {
      const node = JSON.parse(form.node)
      if (failSave(node)) throw new Error('HTTP 500')
      saves.push({ route, node })
      if (!ignoreSave(node)) rules = rules.map((rule) => (rule.uuid === node.uuid ? { ...rule, ...node } : rule))
      return {}
    },
  }
}

before(() => db.migrate.latest())

beforeEach(() => db('settings').del())

after(async () => {
  await db.destroy()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('anchorPlanOf: the live rules gain anchored titles and the Big Brother Australia timers drop', () => {
  const plan = anchorPlanOf({ autorecs: LIVE_RULES.entries, upcoming: LIVE_TIMERS.entries })
  assert.deepEqual(plan.map((change) => [change.name, change.oldTitle, change.newTitle]), [
    ['Big Brother', 'Big Brother', '^Big Brother( ?[:(-].*)?$'],
    ['1 Euro House', '1 Euro House', '^1 Euro House( ?[:(-].*)?$'],
    ['Chefs Ahoy', 'Chefs Ahoy', '^Chefs Ahoy( ?[:(-].*)?$'],
    ['My Kitchen Rules', 'My Kitchen Rules', '^My Kitchen Rules( ?[:(-].*)?$'],
  ])
  const dropped = plan.flatMap((change) => change.droppedTimers.map((timer) => [change.name, timer.title, timer.channelName, timer.start]))
  assert.deepEqual(dropped, [
    ['Big Brother', 'Big Brother Australia', '10 HD', '2026-11-11T08:30:00.000Z'],
    ['Big Brother', 'Big Brother Australia', '10 HD', '2026-11-10T08:30:00.000Z'],
  ])
})

test('anchorPlanOf: every live timer the plan keeps still matches its anchored rule', () => {
  const plan = anchorPlanOf({ autorecs: LIVE_RULES.entries, upcoming: LIVE_TIMERS.entries })
  for (const change of plan) {
    const dropped = new Set(change.droppedTimers.map((timer) => timer.uuid))
    const rule = { channelId: '', enabled: true, match: autorecMatchFieldsOf({ title: change.newTitle }) }
    for (const timer of LIVE_TIMERS.entries.filter((entry) => entry.autorec === change.uuid)) {
      const programme = { title: timer.disp_title, start: timer.start * 1000, end: timer.stop * 1000 }
      assert.equal(autorecMatchesAiring({ autorec: rule, programme }), !dropped.has(timer.uuid), timer.disp_title)
    }
  }
})

test('anchorPlanOf: leaves user rules, regex rules, edited rules, and anchored rules alone', () => {
  const base = { comment: 'freetvarr', fulltext: false }
  const autorecs = [
    { ...base, uuid: 'user', name: 'Bluey', title: 'Bluey', comment: '' },
    { ...base, uuid: 'regex', name: 'Doctor Who', title: 'Doctor Who|Torchwood' },
    { ...base, uuid: 'edited', name: 'Hard Quiz', title: 'Hard Quiz Kids' },
    { ...base, uuid: 'anchored', name: 'The Chase', title: '^The Chase( ?[:(-].*)?$' },
    { ...base, uuid: 'fulltext', name: 'Gruen', title: 'Gruen', fulltext: true },
    { ...base, uuid: 'mergetext', name: 'Gogglebox', title: 'Gogglebox', mergetext: true },
    { ...base, uuid: 'escaped', name: 'Mr. Bean', title: 'Mr\\. Bean' },
  ]
  assert.deepEqual(anchorPlanOf({ autorecs }).map((change) => [change.uuid, change.newTitle]), [
    ['escaped', '^Mr\\. Bean( ?[:(-].*)?$'],
  ])
})

test('anchorPlanOf: a rule from before titles were escaped gets its name escaped and anchored', () => {
  const base = { comment: 'freetvarr', fulltext: false }
  const autorecs = [
    { ...base, uuid: 'old-bean', name: 'Mr. Bean', title: 'Mr. Bean' },
    { ...base, uuid: 'old-qa', name: 'Q+A', title: 'Q+A' },
    { ...base, uuid: 'old-kids', name: 'Hard Quiz (Kids)', title: 'Hard Quiz (Kids)' },
  ]
  const upcoming = [{ uuid: 't1', autorec: 'old-bean', disp_title: 'MrX Bean' }, { uuid: 't2', autorec: 'old-bean', disp_title: 'Mr. Bean' }]
  const plan = anchorPlanOf({ autorecs, upcoming })
  assert.deepEqual(plan.map((change) => [change.uuid, change.newTitle]), [
    ['old-bean', '^Mr\\. Bean( ?[:(-].*)?$'],
    ['old-qa', '^Q\\+A( ?[:(-].*)?$'],
    ['old-kids', '^Hard Quiz \\(Kids\\)( ?[:(-].*)?$'],
  ])
  assert.deepEqual(plan[0].droppedTimers.map((timer) => timer.uuid), ['t1'])
})

test('runAutorecAnchorOnce: a save TVHeadend answered but did not apply counts as failed', async () => {
  const tvh = fakeTvh({ ignoreSave: (node) => node.uuid === '494b07186c1ab2dd29f0a54fb2f70ec5' })
  const { log, warn } = quietLog()
  const result = await runAutorecAnchorOnce({ read: tvh.read, write: tvh.write, log: { log, warn } })
  assert.equal(result.changed, 3)
  assert.deepEqual(result.failed, [{ uuid: '494b07186c1ab2dd29f0a54fb2f70ec5', name: '1 Euro House' }])
  assert.equal(await getSetting(AUTOREC_ANCHOR_DONE_KEY), null)
})

test('runAutorecAnchorOnce: saves only the title, logs each dropped timer first, and runs once', async () => {
  const tvh = fakeTvh()
  const { lines, ...log } = quietLog()
  const result = await runAutorecAnchorOnce({ read: tvh.read, write: tvh.write, log: { ...log } })
  assert.deepEqual(result, { changed: 4, failed: [] })
  assert.deepEqual(tvh.saves.map(({ route, node }) => [route, Object.keys(node).sort()]), Array(4).fill(['idnode/save', ['title', 'uuid']]))
  assert.ok(await getSetting(AUTOREC_ANCHOR_DONE_KEY))
  const dropLines = lines.filter((line) => line.includes('stops matching'))
  assert.equal(dropLines.length, 2)
  assert.ok(lines.indexOf(dropLines[0]) < lines.findIndex((line) => line.includes('"1 Euro House" (')))
  assert.equal(await runAutorecAnchorOnce({ read: tvh.read, write: tvh.write, log }), null)
  assert.equal(tvh.saves.length, 4)
})

test('runAutorecAnchorOnce: logs each Freetvarr rule it leaves alone', async () => {
  const autorecs = { entries: [{ uuid: 'regex', name: 'Doctor Who', title: 'Doctor Who|Torchwood', comment: 'freetvarr' }, { uuid: 'user', name: 'Bluey', title: 'Bluey', comment: '' }] }
  const tvh = fakeTvh({ autorecs, upcoming: { entries: [] } })
  const { lines, ...log } = quietLog()
  assert.deepEqual(await runAutorecAnchorOnce({ read: tvh.read, write: tvh.write, log }), { changed: 0, failed: [] })
  assert.deepEqual(lines, ['[rules] series rule "Doctor Who" (regex) keeps its title "Doctor Who|Torchwood": it is a pattern or was changed in TVHeadend'])
  assert.deepEqual(tvh.saves, [])
})

test('runAutorecAnchorOnce: a failed save keeps the old rule, notes it for Health, and retries next start', async () => {
  const failing = fakeTvh({ failSave: (node) => node.uuid === '83b683ddddb106a932ea3d3204571810' })
  const { log, warn } = quietLog()
  const result = await runAutorecAnchorOnce({ read: failing.read, write: failing.write, log: { log, warn } })
  assert.equal(result.changed, 3)
  assert.deepEqual(result.failed, [{ uuid: '83b683ddddb106a932ea3d3204571810', name: 'Chefs Ahoy' }])
  assert.deepEqual(await readAnchorFailures(), result.failed)
  assert.equal(await getSetting(AUTOREC_ANCHOR_DONE_KEY), null)
  const anchoredRules = {
    entries: LIVE_RULES.entries.map((rule) => rule.name === 'Chefs Ahoy' ? rule : { ...rule, title: `^${rule.title}( ?[:(-].*)?$` }),
  }
  const retry = fakeTvh({ autorecs: anchoredRules })
  assert.deepEqual(await runAutorecAnchorOnce({ read: retry.read, write: retry.write, log: { log, warn } }), { changed: 1, failed: [] })
  assert.deepEqual(retry.saves.map(({ node }) => node.uuid), ['83b683ddddb106a932ea3d3204571810'])
  assert.deepEqual(await readAnchorFailures(), [])
})

test('runAutorecAnchorOnce: an unreachable TVHeadend changes nothing and leaves the flag unset', async () => {
  const read = async () => { throw new Error('connect ECONNREFUSED') }
  await assert.rejects(runAutorecAnchorOnce({ read, write: async () => assert.fail('no save'), log: quietLog() }), /ECONNREFUSED/)
  assert.equal(await getSetting(AUTOREC_ANCHOR_DONE_KEY), null)
})
