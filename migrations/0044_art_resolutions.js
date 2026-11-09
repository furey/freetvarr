export const up = async (knex) => {
  await knex.schema.createTable('art_resolutions', (t) => {
    t.string('resolution_key').primary()
    t.string('title_key').notNullable().index()
    t.string('kind').notNullable()
    t.string('shape').notNullable()
    t.string('stage').notNullable()
    t.text('origin')
    t.string('transform').notNullable()
    t.string('fingerprint').notNullable()
    t.integer('miss_step').notNullable().defaultTo(0)
    t.bigInteger('resolved_at').notNullable()
    t.bigInteger('next_check_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('art_resolutions')
}
