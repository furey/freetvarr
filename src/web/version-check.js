const RELEASE_TAG = /^v?(\d+)\.(\d+)\.(\d+)$/

export const parseReleaseVersion = (tag) => {
  const match = RELEASE_TAG.exec(String(tag ?? '').trim())
  return match ? match.slice(1).map(Number) : null
}

export const compareVersions = (a, b) => {
  const left = parseReleaseVersion(a)
  const right = parseReleaseVersion(b)
  if (!left || !right) return 0
  const difference = left.map((part, index) => part - right[index]).find((delta) => delta !== 0)
  return Math.sign(difference ?? 0)
}

export const latestReleaseTag = (tags = []) =>
  tags
    .filter((tag) => parseReleaseVersion(tag))
    .reduce((latest, tag) => (!latest || compareVersions(tag, latest) > 0 ? tag : latest), null)

export const isNewerRelease = ({ current, latest }) =>
  Boolean(parseReleaseVersion(current) && parseReleaseVersion(latest)) && compareVersions(latest, current) > 0

const INSTALL_CHANGES_HEADING = /^#{1,6}\s*what changes for existing installs\b/im

export const UPDATING_GUIDE_URL = 'https://furey.github.io/freetvarr/guide/updating'
export const VERSION_NOTES_URL = `${UPDATING_GUIDE_URL}#version-notes`
export const WATCHTOWER_GUIDE_URL = `${UPDATING_GUIDE_URL}#update-automatically-with-watchtower`

export const changesExistingInstalls = (releaseBody) => INSTALL_CHANGES_HEADING.test(String(releaseBody ?? ''))

export const updateStepsOf = (current) => [
  {
    label: '1. Back up',
    command: `docker compose stop freetvarr && cp -a config/freetvarr config/freetvarr-${current}`,
  },
  { label: '2. Download', command: 'docker compose pull' },
  { label: '3. Restart', command: 'docker compose up -d' },
]
