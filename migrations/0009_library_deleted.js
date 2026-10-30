export const up = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.timestamp('library_deleted_at').nullable()
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.dropColumn('library_deleted_at')
  })
}
