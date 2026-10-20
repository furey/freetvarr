export const up = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.string('classification').nullable()
    t.integer('year').nullable()
  })
  await backfillClassifications(knex)
}

export const down = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.dropColumn('classification')
    t.dropColumn('year')
  })
}

const backfillClassifications = async (knex) => {
  const recordings = await knex('recordings').whereNotNull('aired_at').select('recording_id', 'title', 'aired_at')
  if (!recordings.length) return
  const labels = new Map((await knex('programme_classifications').select('title_key', 'start_ms', 'label'))
    .map((row) => [`${row.title_key}|${Number(row.start_ms)}`, row.label]))
  const idsByLabel = new Map()
  for (const row of recordings) {
    const label = labels.get(`${titleKeyOf(row.title)}|${Number(row.aired_at)}`)
    if (!label) continue
    idsByLabel.set(label, [...(idsByLabel.get(label) || []), row.recording_id])
  }
  for (const [label, ids] of idsByLabel) {
    for (let i = 0; i < ids.length; i += BATCH) {
      await knex('recordings').whereIn('recording_id', ids.slice(i, i + BATCH)).update({ classification: label })
    }
  }
}

const titleKeyOf = (title) => String(title ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

const BATCH = 500
