export const up = async (knex) => {
  await knex.schema.alterTable('shows', (t) => {
    t.string('origin').notNullable().defaultTo('user')
  })
  const seriesKeys = await seriesRequestKeys(knex)
  const autoIds = (await knex('shows').where({ identity_state: 'none' }).select('id', 'show_pattern'))
    .filter((show) => !seriesKeys.has(keyOf(show.show_pattern)))
    .map((show) => show.id)
  if (autoIds.length) await knex('shows').whereIn('id', autoIds).update({ origin: 'auto' })
  await knex.schema.alterTable('series_evidence', (t) => {
    t.string('database_ids')
    t.bigInteger('database_ids_at')
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('series_evidence', (t) => {
    t.dropColumn('database_ids')
    t.dropColumn('database_ids_at')
  })
  await keepingShowLinks(knex, () => knex.schema.alterTable('shows', (t) => {
    t.dropColumn('origin')
  }))
}

const seriesRequestKeys = async (knex) => {
  const [events, watched] = await Promise.all([
    knex('user_events').where({ kind: 'record_request' }).where('meta_json', 'like', '%"type":"series"%').select('series_key', 'title'),
    knex('watchlist').whereNotNull('series_link_id').select('title'),
  ])
  return new Set([
    ...events.flatMap((event) => [event.series_key, keyOf(event.title)]),
    ...watched.map((row) => keyOf(row.title)),
  ].filter(Boolean))
}

const keyOf = (title) => String(title ?? '')
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || null

const keepingShowLinks = async (knex, rebuildShows) => {
  await knex.raw('create temp table kept_show_links as select recording_id, show_id from recordings where show_id is not null and show_id in (select id from shows)')
  await rebuildShows()
  await knex.raw(`update recordings
    set show_id = (select show_id from kept_show_links where kept_show_links.recording_id = recordings.recording_id)
    where recording_id in (select recording_id from kept_show_links)`)
  await knex.raw('drop table kept_show_links')
}
