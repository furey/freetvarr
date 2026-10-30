export const up = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.timestamp('watched_at').nullable()
  })
  await knex('recordings')
    .whereNotNull('playback_position_s')
    .where('duration_s', '>', 0)
    .whereRaw('playback_position_s >= duration_s - 30')
    .update({ watched_at: knex.raw('coalesce(played_at, CURRENT_TIMESTAMP)') })
}

export const down = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.dropColumn('watched_at')
  })
}
