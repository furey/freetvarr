export const up = async (knex) => {
  await knex.schema.createTable('programme_kind_overrides', (t) => {
    t.string('show_key').primary()
    t.string('kind').notNullable()
    t.bigInteger('updated_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('programme_kind_overrides')
}
