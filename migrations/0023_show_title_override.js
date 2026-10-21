export const up = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.string('show_title_override').nullable()
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.dropColumn('show_title_override')
  })
}
