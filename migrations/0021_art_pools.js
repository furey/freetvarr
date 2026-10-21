export const up = async (knex) => {
  await knex.schema.createTable('art_pools', (t) => {
    t.string('pool_key').primary()
    t.text('value_json').notNullable()
    t.bigInteger('expires_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('art_pools')
}
