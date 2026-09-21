export const up = async (knex) => {
  await knex.schema.createTable('settings', (t) => {
    t.string('key').primary()
    t.text('value')
  })

  await knex.schema.createTable('shows', (t) => {
    t.increments('id').primary()
    t.string('show_pattern').notNullable()
    t.string('dest_folder').notNullable()
    t.string('season_template').notNullable().defaultTo('Season {season}')
    t.boolean('enabled').notNullable().defaultTo(true)
    t.boolean('delete_after_import').notNullable().defaultTo(false)
    t.string('ad_removal').notNullable().defaultTo('off')
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('recordings', (t) => {
    t.string('recording_id').primary()
    t.integer('show_id').references('id').inTable('shows').onDelete('SET NULL')
    t.string('title').notNullable()
    t.integer('season')
    t.integer('episode')
    t.string('file_path')
    t.bigInteger('size')
    t.string('status').notNullable().defaultTo('pending')
    t.text('error')
    t.timestamp('imported_at')
    t.timestamp('deleted_from_tvh_at')
    t.timestamp('purged_at')
    t.string('ad_status')
    t.text('ad_breaks_json')
    t.timestamp('ad_processed_at')
  })

  await knex.schema.createTable('syncs', (t) => {
    t.increments('id').primary()
    t.timestamp('started_at').notNullable().defaultTo(knex.fn.now())
    t.timestamp('finished_at')
    t.string('status').notNullable().defaultTo('running')
    t.text('summary_json')
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('syncs')
  await knex.schema.dropTableIfExists('recordings')
  await knex.schema.dropTableIfExists('shows')
  await knex.schema.dropTableIfExists('settings')
}
