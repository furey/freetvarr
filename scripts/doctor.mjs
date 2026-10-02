import { runDoctor } from '../src/doctor.js'
import { db } from '../src/db.js'

const main = async () => {
  const report = await runDoctor({ deps: { schedulerExpression: () => undefined } })
  console.log(formatTable(report.checks))
  console.log(`\n${formatSummary(report)}`)
  await db.destroy()
  process.exit(report.summary.fail ? 1 : 0)
}

const formatTable = (checks) => {
  const idWidth = Math.max(...checks.map((c) => c.id.length))
  return checks.flatMap((c) => [
    `${c.status.toUpperCase().padEnd(4)}  ${c.id.padEnd(idWidth)}  ${c.detail}`,
    ...(c.fix && c.status !== 'pass' ? [`${' '.repeat(idWidth + 8)}${c.fix}`] : []),
  ]).join('\n')
}

const formatSummary = ({ summary, durationMs }) =>
  `${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail, ${summary.skip} skip in ${(durationMs / 1000).toFixed(1)} s`

await main()
