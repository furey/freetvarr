# Voice options

## Contents

- [Summary](#summary)
- [Test lines](#test-lines)
- [Measured results](#measured-results)
- [Provider options](#provider-options)
- [Fixes for any voice](#fixes-for-any-voice)
- [Files](#files)

## Summary

Listen first: `voice-options-comparison.mp3` (`4:12`, `3 MB`). A spoken label ("Option A", "Option B", and so on) comes before each option's four test lines.

**Recommendation:** switch to Option F, `en-AU-NeilNeural` (standard voice), with the SSML in [Fixes for any voice](#fixes-for-any-voice). Option G (`en-AU-DuncanNeural`) is the alternate if Neil's tone is wrong to your ear.

- Every sentence end from Neil falls in pitch. The current HD voice rises at the end of half the test lines, and SSML does not change that.
- Neil's pauses are exact: `~0.48 s` between sentences and `~0.22 s` at commas, every time.
- Neil gave the cleanest transcript of the standard voices.
- It costs under `$1` for the whole series, on the Azure key you already use.

The `records` fix (an IPA `<phoneme>`) works on every voice, the HD voice included. So the heteronym is fixed whichever voice you choose.

> [!NOTE]<br>
> The HD voice (`en-au-andrew:DragonHDOmniLatestNeural`) varies between renders. One newscast-style test ended "TV." with a fall, and the next render of the same text rose `+10` semitones. You cannot fix a random rise with markup.

## Test lines

| #   | Line                                                                                                                            | Problem it tests                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Leaving Fetch? You can keep recording free-to-air TV, and keep watching it on your TV.                                          | Question, then "TV."             |
| 2   | From then on, every new episode records by itself.                                                                              | `records` as a verb              |
| 3   | The next episode to watch, what records tonight, and what is on now.                                                            | `records` as a verb, list commas |
| 4   | If you have a Fetch Mini or Mighty Gen 3, and no Fetch subscription, Fetch now asks for a one-off levy to keep the box working. | Long sentence, `levy`            |

## Measured results

I checked each sample three ways:

- **Transcript:** Azure speech-to-text (`en-AU`) read each sample back.
- **Heteronym:** Azure pronunciation assessment (`en-US`, phoneme level) scored the first vowel of `records`. `ɛ` (REC-ords) means the noun; `ɪ` or `ə` (re-CORDS) means the verb.
- **Pitch and pauses:** Praat (via `parselmouth`) measured each pause and the pitch change at each phrase end. The pitch change is the median of the last `120 ms` minus the median of the `150–500 ms` before it, in semitones. Above `+2` is a rising, question-like end.

| Option | Voice and markup                                   | Line ends that rise                        | `records`    | Sentence pause | Comma pause                                  | Transcript errors                |
| ------ | -------------------------------------------------- | ------------------------------------------ | ------------ | -------------- | -------------------------------------------- | -------------------------------- |
| A      | Andrew HD, as now                                  | 2 of 4 ("TV." `+9.6`, "by itself." `+7.6`) | noun (wrong) | `0.46–0.52 s`  | `0.20–0.56 s`, some commas dropped           | none                             |
| B      | Andrew HD, `<p>`/`<s>`, IPA                        | 2 of 4 (`+7.9`, `+12.0`)                   | verb         | `0.43 s`       | `0.32–0.55 s`, some dropped                  | none                             |
| C      | Andrew HD, one sentence per request, `0.45 s` gaps | 2 of 4 (`+8.6`, `+11.8`)                   | verb         | `0.43 s` (set) | `0.32–0.55 s`, some dropped                  | none                             |
| D      | Andrew HD, `newscast` style                        | 1 of 4 ("TV." `+10.3`)                     | verb         | `0.43 s`       | `0.30–0.48 s`                                | none                             |
| E      | William, standard, SSML                            | 0 of 4                                     | verb         | `0.47 s`       | `0.44–0.76 s` (as long as sentences; choppy) | none                             |
| F      | Neil, standard, SSML                               | 0 of 4                                     | verb         | `0.49 s`       | `0.21–0.28 s`                                | none                             |
| G      | Duncan, standard, SSML                             | 0 of 4                                     | verb         | `0.48 s`       | `0.19–0.24 s`                                | "Mini Almighty"                  |
| H      | Ken, standard, SSML                                | 0 of 4                                     | verb         | `0.49 s`       | `0.18–0.22 s`                                | "Leaving Fitch", "Mini Almighty" |

Pitch and pause figures are proxies for listening, not a replacement for it. The raw figures are in `voice-ab/prosody.txt` and `voice-ab/stt.txt`.

## Provider options

Series size: `7` videos at `~3,000` characters each is `~21,000` characters. With three re-renders, plan for `~65,000` characters.

| Provider and voice                                                             | Quality notes                                                                                                                                                                          | Cost for the series                                                                                                                       | Account                                          |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Azure standard en-AU: Neil, Duncan, William, Ken, Darren, Tim                  | Real Australian accent. Full SSML: `<phoneme>`, `<sub>`, `<break>`, `prosody`, `mstts:silence`. No `express-as` styles for en-AU. Tested: falling ends, exact pauses.                  | `~$1` at `$15` per 1M characters; `$0` on the free F0 tier (`0.5M` characters a month)                                                    | Have it (`AZURE_SPEECH_KEY` in joeyreads `.env`) |
| Azure HD: `en-au-andrew:DragonHDOmniLatestNeural` (preview)                    | Warmest voice; you like the accent. Omni voices have no `prosody`, `<break>`, or `mstts:silence`. Tested: rising ends at random, uneven pauses.                                        | `~$1.50–2` at `$22–30` per 1M (unconfirmed)                                                                                               | Have it                                          |
| ElevenLabs Multilingual v2 or Eleven v3                                        | Strongest expressive quality in general. Australian male voices are in the voice library (not checked). v3 takes no SSML; `<phoneme>` works only on Flash v2 and Turbo v2. Not tested. | Starter `$6` a month (`30,000` credits, 1 credit per character) or Creator `$22` (`121,000`); the free plan does not allow commercial use | Not found                                        |
| OpenAI `gpt-4o-mini-tts`                                                       | `instructions` can ask for pace and falling ends. Forum reports say accent requests are unreliable, with a neutral American default. No SSML, so no IPA fix. Not tested.               | `$0.60` per 1M text tokens plus `$12` per 1M audio tokens; a few dollars at most                                                          | Not found                                        |
| Google Chirp 3 HD, `en-AU-Chirp3-HD-<name>` (16 male names, e.g. Charon, Orus) | SSML in preview: `<phoneme>`, `<sub>`, `<break>`, `prosody`. Australian accent strength not verified. Not tested.                                                                      | `~$2` at `~$30` per 1M (unverified); possibly inside the free tier                                                                        | Not found; Google Cloud billing needed           |

I checked for credentials only in the joeyreads `.env` (variable names only) and in environment variables. Azure is the only text-to-speech key there.

Sources:

- Azure prices: <https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/> (the page did not render figures for me; `$15` per 1M neural is from secondary sources, and HD is unconfirmed)
- Azure HD voice SSML limits: <https://learn.microsoft.com/en-us/azure/ai-services/speech-service/high-definition-voices>
- Azure en-AU voice list: <https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts>
- ElevenLabs plans: <https://elevenlabs.io/pricing>; SSML support: <https://elevenlabs.io/blog/ssml-tags-explained>; commercial use: <https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform>
- OpenAI prices: <https://developers.openai.com/api/docs/pricing>; accent reports: <https://community.openai.com/t/british-accent-and-pronuciation-in-gpt-4o-mini-tts/1150812>
- Google voices: <https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types>; Chirp 3 HD controls: <https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd>; prices: <https://cloud.google.com/text-to-speech/pricing> (figures did not render; unverified)

## Fixes for any voice

These go into `SSML_TEXT` and `voice/tts.mjs` when you choose a voice:

- `records` (verb): `<phoneme alphabet="ipa" ph="rɪˈkɔːdz">records</phoneme>`. The scorer heard the verb on all eight options. Do not use it for the noun in "your recordings" or "old records".
- `levy` (standard voices only): `<sub alias="levvy">levy</sub>`. Without it, William, Neil, and Duncan say "Levi".
- Sentences: wrap each sentence in `<s>` inside one `<p>`. End each statement with a full stop.
- Pauses (standard voices only): `<mstts:silence type="Sentenceboundary-exact" value="450ms"/>` and `<mstts:silence type="Comma-exact" value="180ms"/>`.
- Rate (standard voices only): `<prosody rate="-3%">`.

Example SSML for Option F, line 2:

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-AU">
  <voice name="en-AU-NeilNeural">
    <mstts:silence type="Sentenceboundary-exact" value="450ms"/>
    <mstts:silence type="Comma-exact" value="180ms"/>
    <prosody rate="-3%"><p><s>From then on, every new episode <phoneme alphabet="ipa" ph="rɪˈkɔːdz">records</phoneme> by itself.</s></p></prosody>
  </voice>
</speak>
```

## Files

All paths are under `video/` (the `voice/` and `voice-ab/` Azure trials are not kept):

- `voice-options-comparison.mp3`: all options, labelled, for phone listening
- `voice-ab/A1.wav` to `voice-ab/H4.wav`: each option's four lines (letter is the option, digit is the test line)
- `voice-ab/make-samples.mjs`: renders the samples and runs the transcript and heteronym checks
- `voice-ab/stress-check.mjs`: the `records` noun-or-verb scorer
- `voice-ab/prosody.py`: the pause and pitch measurements (run with `$FTV_VIDEO_PYTHON -I`)
- `voice-ab/stt.txt`, `voice-ab/prosody.txt`, `voice-ab/results.json`: raw results
