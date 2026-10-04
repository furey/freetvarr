export const up = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.integer('playback_position_s')
    t.timestamp('played_at')
    t.string('tvh_filename')
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.dropColumn('playback_position_s')
    t.dropColumn('played_at')
    t.dropColumn('tvh_filename')
  })
}
