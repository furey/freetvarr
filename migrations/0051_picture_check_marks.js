export const up = async (knex) => {
  await knex.schema.alterTable('picture_checks', (t) => {
    t.text('marks')
    t.float('detail')
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('picture_checks', (t) => {
    t.dropColumn('marks')
    t.dropColumn('detail')
  })
}
