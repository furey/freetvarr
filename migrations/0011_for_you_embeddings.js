export const up = async (knex) => {
  await knex.schema.createTable('text_embeddings', (t) => {
    t.string('text_hash').notNullable()
    t.string('model_id').notNullable()
    t.integer('dims').notNullable()
    t.binary('vector').notNullable()
    t.bigInteger('created_at').notNullable()
    t.primary(['text_hash', 'model_id'])
    t.index(['model_id', 'created_at'])
  })
  await knex.schema.createTable('title_genres', (t) => {
    t.string('title_key').primary()
    t.text('genres_json').notNullable()
    t.text('categories_json').notNullable()
    t.string('source')
    t.bigInteger('expires_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('title_genres')
  await knex.schema.dropTableIfExists('text_embeddings')
}
