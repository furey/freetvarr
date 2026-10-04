export const up = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.string('episode_title')
    t.string('channel_id')
    t.string('channel_name')
    t.bigInteger('aired_at')
    t.integer('duration_s')
    t.text('synopsis')
    t.string('image_url')
    t.string('image_path')
    t.timestamp('image_checked_at')
    t.string('library_choice').notNullable().defaultTo('auto')
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.dropColumn('episode_title')
    t.dropColumn('channel_id')
    t.dropColumn('channel_name')
    t.dropColumn('aired_at')
    t.dropColumn('duration_s')
    t.dropColumn('synopsis')
    t.dropColumn('image_url')
    t.dropColumn('image_path')
    t.dropColumn('image_checked_at')
    t.dropColumn('library_choice')
  })
}
