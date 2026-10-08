export const AD_SCAN_TITLE = "Scan this recording for ad breaks now (uses the show's ad removal mode;"
  + ' detect-only when the show is off).'

export const LIBRARY_FILE_GONE_TITLE = 'The library file is gone, so there is nothing to scan.'

export const canAdScan = ({ adRemovalEnabled, recording }) =>
  adRemovalEnabled && recording.status === 'done'

export const isAdScanBlocked = (recording) => recording.library_file_present === false

export const adScanTitle = (recording) => (isAdScanBlocked(recording)
  ? LIBRARY_FILE_GONE_TITLE
  : AD_SCAN_TITLE)
