export const up = async (knex) => {
  await knex.schema.alterTable('shows', (t) => {
    t.string('kept_folder')
  })
}

export const down = async (knex) => {
  await keepingShowLinks(knex, () => knex.schema.alterTable('shows', (t) => {
    t.dropColumn('kept_folder')
  }))
}

const keepingShowLinks = async (knex, rebuildShows) => {
  await knex.raw('create temp table kept_show_links as select recording_id, show_id from recordings where show_id is not null')
  await rebuildShows()
  await knex.raw(`update recordings
    set show_id = (select show_id from kept_show_links where kept_show_links.recording_id = recordings.recording_id)
    where recording_id in (select recording_id from kept_show_links)`)
  await knex.raw('drop table kept_show_links')
}
