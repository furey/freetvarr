import { db } from './db.js'
import { detailOf } from './activity.js'

export const createJobRunStore = ({ database = db } = {}) => ({
  save: (run, { replaceKind = false } = {}) => database.transaction(async (trx) => {
    if (replaceKind) await trx('job_runs').where({ kind: run.kind }).del()
    await trx('job_runs')
      .insert({ id: run.id, kind: run.kind, finished_at: run.finishedAt, run_json: JSON.stringify(detailOf(run)) })
      .onConflict('id').merge()
  }),
  load: async ({ since }) => (await database('job_runs').where('finished_at', '>=', since).orderBy('finished_at'))
    .map(runFromRow)
    .filter(Boolean),
  prune: ({ before }) => database('job_runs').where('finished_at', '<', before).del(),
})

const runFromRow = (row) => {
  try {
    return { ...JSON.parse(row.run_json), finishedAt: Number(row.finished_at) }
  } catch {
    return null
  }
}
