export const up = async (knex) => {
  await knex.schema.createTable('plex_watch_state', (t) => {
    t.string('recording_id').primary()
    t.string('rating_key').notNullable()
    t.boolean('plex_watched').notNullable().defaultTo(false)
    t.integer('plex_offset_s').notNullable().defaultTo(0)
    t.boolean('ft_watched').notNullable().defaultTo(false)
    t.integer('ft_position_s').notNullable().defaultTo(0)
    t.bigInteger('synced_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('plex_watch_state')
}
