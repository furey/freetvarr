export const up = async (knex) => {
  await knex.schema.createTable('series_evidence', (t) => {
    t.string('show_key').primary()
    t.text('facts_json').notNullable()
    t.bigInteger('updated_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('series_evidence')
}
