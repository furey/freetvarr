export const up = async (knex) => {
  await knex.schema.alterTable('art_resolutions', (t) => {
    t.string('stamp')
    t.string('show_key')
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('art_resolutions', (t) => {
    t.dropColumn('stamp')
    t.dropColumn('show_key')
  })
}
