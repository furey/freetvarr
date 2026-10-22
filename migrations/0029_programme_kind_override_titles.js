export const up = async (knex) => {
  await knex.schema.alterTable('programme_kind_overrides', (t) => {
    t.string('title')
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('programme_kind_overrides', (t) => {
    t.dropColumn('title')
  })
}
