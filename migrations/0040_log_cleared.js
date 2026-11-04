export const up = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.timestamp('log_cleared_at')
  })
  await knex('recordings')
    .whereNotNull('purged_at')
    .whereNull('library_deleted_at')
    .whereNotNull('deleted_from_tvh_at')
    .whereIn('status', ['done', 'partial'])
    .update({ log_cleared_at: knex.ref('purged_at'), purged_at: null })
}

export const down = async (knex) => {
  await knex('recordings')
    .whereNotNull('log_cleared_at')
    .whereNull('purged_at')
    .update({ purged_at: knex.ref('log_cleared_at') })
  await knex.schema.alterTable('recordings', (t) => {
    t.dropColumn('log_cleared_at')
  })
}
