export const up = async (knex) => {
  await knex('user_events').whereIn('kind', OLD_THEME_KINDS).delete()
  await knex('settings').where({ key: OLD_THEMES_OFF }).delete()
  await knex.schema.createTable('programme_category_overrides', (t) => {
    t.string('show_key').primary()
    t.string('format')
    t.text('topics_json').notNullable().defaultTo('[]')
    t.bigInteger('updated_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('programme_category_overrides')
}

const OLD_THEME_KINDS = ['theme_muted', 'theme_unmuted', 'theme_boosted', 'theme_unboosted']
const OLD_THEMES_OFF = 'for_you_themes_off'
