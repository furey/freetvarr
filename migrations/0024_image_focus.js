export const up = async (knex) => {
  await knex.schema.createTable('image_focus', (t) => {
    t.text('url_key').primary()
    t.string('source_hash').notNullable()
    t.integer('width').notNullable()
    t.float('x').notNullable()
    t.float('y').notNullable()
    t.text('keep_box').nullable()
    t.string('method').notNullable()
    t.integer('version').notNullable()
    t.bigInteger('updated_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('image_focus')
}
