# ElevenLabs options

## Contents

- [Summary](#summary)
- [Voices](#voices)
- [Model and settings](#model-and-settings)
- [Wording change](#wording-change)
- [Music](#music)
- [Credits](#credits)
- [Files](#files)

## Summary

Listen: `elevenlabs-options-comparison.mp3` (`3:22`, `3.1 MB`). Each voice says its own label ("Option one. Stephen.") and then the four test lines. Music A, B, and C follow, each a `30 s` mix under Option 4.

**My pick:** Option 4, Josh, on Multilingual v2 with the "steady" settings. Every sentence end falls (`-3.0` to `-4.8` semitones), "Leaving Fetch?" rises as a question, and the transcript is exact. Option 2 (Brandon) is the alternate: the strongest falls of all, but with a slightly noisier voice recording.

**Music pick:** Music C (Coffee or Tea). It has the least high-frequency energy of the three, so it stays out of the way of speech.

## Voices

All four are from the shared voice library, Australian, male, with a `730`-day notice period (the voice stays usable for two years if the owner removes it) and no premium rate.

| Option | Voice                          | ID                     | Sentence ends (semitones)             | Comma ends       | Transcript                                  |
| ------ | ------------------------------ | ---------------------- | ------------------------------------- | ---------------- | ------------------------------------------- |
| 1      | Stephen J N, calm              | `kdW6CDutGqpjwCpviBac` | `+0.9`, `-1.2`, `-2.3`, `-1.9` (flat) | `+2.6` to `+6.3` | exact; question kept                        |
| 2      | Brandon, professional and warm | `AsGY6GCuJNcXklospqtq` | `-10.0`, `-5.8`, `-7.7`, `-5.0`       | all fall         | exact; question kept                        |
| 3      | Jack, relaxed explainer        | `OLOI4oonuvD0YxxCCZy0` | `-4.7`, `-1.7`, n/a, `-3.6`           | `+1.4` to `+7.2` | exact; "Leaving Fetch," read as a statement |
| 4      | Josh, warm conversational      | `YCMlNeY0UBmxCWADNMyB` | `-4.5`, `-4.8`, `-3.0`, `-3.5`        | `-0.9` to `+0.8` | exact; question kept                        |

Sentence ends use the Praat check from `voice-ab/prosody.py` (above `+2` is a rising end). Transcripts are from ElevenLabs Speech to Text (`scribe_v1`). Every voice says "Gen 3" as "Gen Three" and "levy" correctly, with no markup.

## Model and settings

I compared four settings on Josh with lines 1 and 2 (`eleven/settings/S1`–`S4`):

| Set                | Model           | Stability | Similarity | Style | Result                                            |
| ------------------ | --------------- | --------- | ---------- | ----- | ------------------------------------------------- |
| S1 balanced        | Multilingual v2 | `0.5`     | `0.75`     | `0`   | read "Leaving Fetch?" as a statement              |
| S2 loose           | Multilingual v2 | `0.35`    | `0.75`     | `0.2` | question kept; short `0.21 s` sentence gap        |
| S3 steady (chosen) | Multilingual v2 | `0.7`     | `0.8`      | `0`   | question kept; falling end; `0.61 s` sentence gap |
| S4                 | Eleven v3       | `0.5`     | `0.75`     | n/a   | `20%` slower, a rise mid-sentence, noisier        |

All runs use speaker boost on and speed `1`.

## Wording change

"Records" as a verb in line 2 ("every new episode records by itself") was correct on every voice and model. The Azure phoneme scorer gave the verb vowel `100`, the noun vowel `0`.

Line 3 ("what records tonight") came out as the noun on all four voices. The phrase reads both ways, so I changed the wording to "what is set to record tonight". The comparison uses the new wording. The script line in `overview/script.mjs` needs the same change.

## Music

All three are from Mixkit, under the Mixkit Stock Music Free License: use in YouTube videos (monetised included) is allowed, and no attribution is needed. Content ID claims can still happen on any stock track; keep the source URL to dispute one.

| Mix | Track         | Artist           | Genre       | Source                                         |
| --- | ------------- | ---------------- | ----------- | ---------------------------------------------- |
| A   | Curiosity     | Diego Nava       | Chillout    | <https://assets.mixkit.co/music/480/480.mp3>   |
| B   | Close Up      | Michael Ramir C. | Corporate   | <https://assets.mixkit.co/music/1167/1167.mp3> |
| C   | Coffee or Tea | Michael Ramir C. | Electronica | <https://assets.mixkit.co/music/1168/1168.mp3> |

Licence: <https://mixkit.co/license/#musicFree>.

Mix recipe (`eleven/mix.py`, settings in `eleven/mix.json`):

- Both the speech and the music are set to `-16 LUFS` first.
- Under speech, the music sits `22 dB` down. Between sections (gaps over `1.5 s`), it rises to `11 dB` down.
- The duck starts `300 ms` before speech and releases over `800 ms` after it.
- The music fades in over `1.5 s` and out over `3 s`.
- Each mix is `-14.1 LUFS` after a limiter at `-1 dBFS`.

## Credits

`34` requests sent `2,227` characters. The API billed `889` credits (from the `character-cost` header), of the `30,000` a month. Speech to Text checks used about `6` minutes of audio from the separate transcription allowance. Every synthesis is cached in `eleven/cache/` by a hash of voice, model, settings, text, and format, so a re-run costs nothing.

## Files

All paths are under `video/`:

- `elevenlabs-options-comparison.mp3`: labelled voices, then the music mixes
- `eleven/eleven.mjs`: the cached text-to-speech and speech-to-text client
- `eleven/out/`: each option's lines (`O<option>-<line>.wav`) and the music mixes (`music-A.wav` to `music-C.wav`)
- `eleven/ledger.jsonl`: one row for each paid request
- `eleven/shared.json`: the full list of Australian male library voices
