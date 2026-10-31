import { synth } from './eleven.mjs'
const r = await synth({ voice: 'YCMlNeY0UBmxCWADNMyB', model: 'eleven_multilingual_v2', settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true }, text: 'From then on, every new episode records by itself.' })
console.log(r)
