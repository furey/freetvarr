export const diagnoseRecordingError = (error = '') => {
  const text = String(error)
  for (const rule of RULES) {
    const match = text.match(rule.pattern)
    if (match) return { error: text, ...rule.explain(match) }
  }
  return { error: text, ...FALLBACK }
}

const formatGb = (bytes) => `${(Number(bytes) / 1e9).toFixed(2)} GB`

const DOCTOR_STEP = 'Open Settings → System → Health and press Run checks. It checks every folder and connection Freetvarr needs.'

const RULES = [
  {
    pattern: /file not found at .+?; check the recordings mount/,
    explain: () => ({
      title: 'Recording file not found',
      meaning: 'TVHeadend lists this recording as finished, but Freetvarr found no file at the path below.',
      steps: [
        'If the programme ended in the last 10 minutes, wait. TVHeadend can still be writing the file, and the next sync tries again.',
        'Check that TVHeadend\'s recordings folder is mounted into the Freetvarr Docker container.',
        'In Settings → Recording, check that the Recordings folder is the path where Freetvarr sees that folder.',
        DOCTOR_STEP,
      ],
      doc: 'guide/troubleshooting#skipped-recordings',
    }),
  },
  {
    pattern: /outside the recordings mount/,
    explain: () => ({
      title: 'Recording path does not match',
      meaning: 'TVHeadend reported a file path that does not start with the TVHeadend recordings path in Settings, so Freetvarr cannot find the file.',
      steps: [
        'In Settings → Recording, press Check TVHeadend to compare the two recordings paths.',
        'Set TVHeadend recordings path to the folder TVHeadend saves recordings to, inside the TVHeadend Docker container.',
        'Set Recordings root to the same folder as Freetvarr sees it, inside the Freetvarr Docker container.',
      ],
      doc: 'guide/configuration#the-two-recordings-paths',
    }),
  },
  {
    pattern: /(one-off|movies) folder .+? not found/,
    explain: ([, kind]) => ({
      title: `${kind === 'movies' ? 'Movies' : 'One-off'} folder not found`,
      meaning: `Freetvarr files this recording in the ${kind} folder, but that folder (below) does not exist inside the Freetvarr Docker container.`,
      steps: [
        `Mount the host folder for ${kind} into the Freetvarr Docker container, then restart the container.`,
        `Or, in Settings → Recording, change the ${kind === 'movies' ? 'Movies' : 'One-off'} folder and press Test path.`,
        'The next sync imports the recording.',
      ],
      doc: 'guide/troubleshooting#test-path-failures',
    }),
  },
  {
    pattern: /short copy: on-disk (\d+) bytes vs TVHeadend (\d+) bytes/,
    explain: ([, actual, expected]) => ({
      title: 'Import came up short',
      meaning: `The imported file is ${formatGb(actual)}, but TVHeadend reported ${formatGb(expected)}.`,
      steps: [
        'Wait for the next sync. It imports the file again.',
        'Check that the disk with your media library has free space.',
        'If the recording stays PARTIAL, the TVHeadend file itself is short. In TVHeadend\'s web interface, check the entry\'s status for data errors, which usually come from a weak signal.',
      ],
      doc: 'guide/troubleshooting#partial-recordings',
    }),
  },
  {
    pattern: /TVHeadend reported: (.+)/,
    explain: ([, status]) => ({
      title: 'TVHeadend reported a problem',
      meaning: `TVHeadend finished the recording with the status "${status}". The file can have gaps or be cut short.`,
      steps: [
        'Play the recording to check it.',
        'In TVHeadend\'s web interface, open the finished recording to see its errors. Data errors usually come from a weak signal.',
        'Check the aerial and the signal strength for that channel.',
      ],
      doc: 'guide/troubleshooting#partial-recordings',
    }),
  },
  {
    pattern: /EACCES|EPERM|permission denied/i,
    explain: () => ({
      title: 'Permission denied',
      meaning: 'Freetvarr does not have permission to read or write a file or folder it needs.',
      steps: [
        'Set PUID and PGID to the owner of the host folders you mount.',
        'Use the same PUID and PGID for the Freetvarr and TVHeadend Docker containers, then restart both.',
        DOCTOR_STEP,
      ],
      doc: 'guide/troubleshooting#permission-errors',
    }),
  },
  {
    pattern: /ENOSPC|no space left/i,
    explain: () => ({
      title: 'Disk full',
      meaning: 'The disk ran out of space during the import.',
      steps: [
        'Free up space on the disk with your media library.',
        'The next sync imports the recording again.',
      ],
      doc: 'guide/troubleshooting',
    }),
  },
]

const FALLBACK = {
  title: 'Import error',
  meaning: 'Freetvarr could not import this recording.',
  steps: [
    DOCTOR_STEP,
    'Check the Freetvarr log for the full error: docker compose logs freetvarr',
    'The next sync tries again.',
  ],
  doc: 'guide/troubleshooting',
}
