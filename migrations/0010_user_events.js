export const up = async (knex) => {
  await knex.schema.createTable('user_events', (t) => {
    t.increments('id').primary()
    t.bigInteger('ts').notNullable()
    t.string('kind').notNullable()
    t.string('series_key')
    t.string('title')
    t.bigInteger('programme_start')
    t.string('channel_id')
    t.string('recording_id')
    t.integer('duration_s')
    t.integer('position_s')
    t.integer('programme_len_s')
    t.string('source')
    t.text('meta_json')
    t.index(['series_key', 'ts'])
    t.index(['kind', 'ts'])
    t.index(['ts'])
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('user_events')
}
