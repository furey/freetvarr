import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
const dir = new URL('./frames/', import.meta.url).pathname
const clips = {}
const marks = {}
for (const name of readdirSync(dir)) {
  const files = readdirSync(`${dir}${name}`).filter((f) => f.endsWith('.jpg'))
  clips[name] = files.length
  marks[name] = existsSync(`${dir}${name}/marks.json`) ? JSON.parse(readFileSync(`${dir}${name}/marks.json`, 'utf8')) : {}
}
writeFileSync(new URL('./clips.js', import.meta.url), `export const CLIPS = ${JSON.stringify(clips)}\nexport const MARKS = ${JSON.stringify(marks)}\n`)
console.log(Object.keys(clips).join(' '))
