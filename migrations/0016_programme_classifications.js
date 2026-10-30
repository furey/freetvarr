export const up = async (knex) => {
  await knex.schema.createTable('programme_classifications', (t) => {
    t.string('title_key').notNullable()
    t.bigInteger('start_ms').notNullable()
    t.string('label').notNullable()
    t.primary(['title_key', 'start_ms'])
    t.index(['start_ms'])
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('programme_classifications')
}
