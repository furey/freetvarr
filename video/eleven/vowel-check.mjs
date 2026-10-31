import { readFile } from 'node:fs/promises'
import { azure } from '../voice/azure-env.mjs'
const WORDS = { live: { long: ['aɪ', 'a'], short: ['ɪ', 'i'], at: 1 }, records: { long: ['ɛ', 'æ'], short: ['ɪ', 'ə', 'i'], at: 1 } }
const score = (nbest, set) => Math.max(0, ...nbest.filter((n) => set.includes(n.Phoneme)).map((n) => n.Score))
const check = async ({ wav16, reference, word }) => {
  const { key, region } = azure()
  const pa = Buffer.from(JSON.stringify({ ReferenceText: reference, GradingSystem: 'HundredMark', Granularity: 'Phoneme', Dimension: 'Comprehensive', PhonemeAlphabet: 'IPA', NBestPhonemeCount: 5 })).toString('base64')
  const res = await fetch(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`, {
    method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', 'Pronunciation-Assessment': pa }, body: await readFile(wav16),
  })
  const j = await res.json()
  const w = j.NBest?.[0]?.Words?.find((x) => x.Word.toLowerCase() === word)
  if (!w) return 'not found'
  const nb = w.Phonemes[WORDS[word].at]?.NBestPhonemes || []
  return `${word}: ${nb.map((n) => `${n.Phoneme}${n.Score}`).join(' ')} | first ${w.Phonemes.map((p) => p.Phoneme).join('')}`
}
const vo = JSON.parse(await readFile(process.argv[2], 'utf8'))
for (const l of vo) {
  for (const word of Object.keys(WORDS)) {
    if (!new RegExp(`\\b${word}\\b`, 'i').test(l.text)) continue
    const ref = l.text.replace(/[.,?]/g, '')
    console.log(l.id, await check({ wav16: l.file.replace('.wav', '-16k.wav'), reference: ref, word }))
  }
}
