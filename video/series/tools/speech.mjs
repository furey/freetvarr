export const ELEVEN = {
  voice: 'AsGY6GCuJNcXklospqtq',
  model: 'eleven_multilingual_v2',
  settings: { stability: 0.7, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed: 1 },
}

export const SPOKEN_TEXT = (line) => line
  .replace(/\{Freetvarr\}/g, 'Free TV R')
  .replace(/\{freetvarr\}/g, 'Free TV R')
  .replace(/HDHomeRun/g, 'H D Home Run')
  .replace(/TVHeadend/g, 'T V Head End')
  .replace(/Sonarr/g, 'Sonar')
  .replace(/Radarr/g, 'Radar')
  .replace(/Go live/g, 'Go lyve')

export const CAPTION_TEXT = (line) => line
  .replace(/\{Freetvarr\}/g, 'Freetvarr')
  .replace(/\{freetvarr\}/g, 'freetvarr')
  .replace(/fetch T V/g, 'fetchtv')
  .replace(/Node J S/g, 'Node.js')
  .replace(/S S H/g, 'SSH')
