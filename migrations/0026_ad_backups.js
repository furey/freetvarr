export const up = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.timestamp('ad_cut_at')
    t.timestamp('ad_backup_saved_at')
    t.boolean('ad_backup_uncut')
  })
  await knex('recordings')
    .where({ ad_status: 'cut' })
    .whereNotNull('ad_processed_at')
    .update({
      ad_cut_at: knex.ref('ad_processed_at'),
      ad_backup_saved_at: knex.ref('ad_processed_at'),
      ad_backup_uncut: true,
    })
}

export const down = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.dropColumn('ad_cut_at')
    t.dropColumn('ad_backup_saved_at')
    t.dropColumn('ad_backup_uncut')
  })
}
