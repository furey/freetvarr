export const up = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.timestamp('tvh_remove_pending_at')
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.dropColumn('tvh_remove_pending_at')
  })
}
