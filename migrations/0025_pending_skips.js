export const up = async (knex) => {
  await knex.schema.createTable('pending_skips', (t) => {
    t.string('program_id').primary()
    t.string('channel_id').notNullable()
    t.string('title').notNullable()
    t.bigInteger('start_ms').notNullable()
    t.bigInteger('end_ms').notNullable()
    t.bigInteger('created_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('pending_skips')
}
