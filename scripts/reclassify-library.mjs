import path from 'node:path'

const main = async () => {
  const { dbPath, dryRun } = argsOf(process.argv.slice(2))
  if (!dbPath || !dryRun) return usage()
  process.env.DB_PATH = path.resolve(dbPath)
  const { db } = await import('../src/db.js')
  const { loadReclassifyInputs, planReclassification } = await import('../src/library-reclassify.js')
  try {
    const inputs = await loadReclassifyInputs({ loadSeries: async () => ({ series: [] }) })
    const plan = planReclassification(inputs)
    printPlan({ plan, roots: inputs.roots })
  } finally {
    await db.destroy()
  }
}

const argsOf = (args) => {
  const at = args.indexOf('--db')
  return { dbPath: at >= 0 ? args[at + 1] ?? null : null, dryRun: args.includes('--dry-run') }
}

const printPlan = ({ plan, roots }) => {
  console.log(`TV library: ${roots.mediaRoot}`)
  console.log(`One-offs:   ${roots.oneOffRoot}`)
  console.log(`Movies:     ${roots.moviesRoot || '(not set)'}`)
  console.log(`${plan.length} recording(s) would move. Nothing was changed.\n`)
  for (const move of plan) {
    const target = move.toShows ? `Shows (${move.showId == null ? 'new folder rule' : `folder rule ${move.showId}`})` : 'One-offs'
    console.log(`${move.title} → ${target}`)
    console.log(`  from ${move.from}`)
    console.log(`  to   ${move.to}`)
  }
}

const usage = () => {
  console.error('Usage: node scripts/reclassify-library.mjs --db <path to a copy of state.db> --dry-run')
  console.error('Prints which recordings would move between the TV and one-off folders. It reads the database only.')
  process.exitCode = 2
}

await main()
