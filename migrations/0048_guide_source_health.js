export const up = async (knex) => {
  await knex.schema.createTable('guide_source_health', (t) => {
    t.increments('id').primary()
    t.bigInteger('built_at').notNullable().index()
    t.string('source').notNullable()
    t.string('channel').notNullable()
    t.float('covered_hours').notNullable()
    t.float('horizon_hours').notNullable()
    t.float('described_share')
    t.float('agreement')
    t.integer('fetch_attempts').notNullable()
    t.integer('fetch_failures').notNullable()
    t.boolean('below').notNullable()
    t.boolean('degraded').notNullable()
    t.boolean('led').notNullable()
    t.index(['source', 'channel', 'built_at'])
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('guide_source_health')
}
