export const up = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.string('library_state').nullable()
    t.text('library_replacement').nullable()
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.dropColumn('library_state')
    t.dropColumn('library_replacement')
  })
}
