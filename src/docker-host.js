import os from 'os'

export const detectDockerVm = (kernelRelease = os.release()) => {
  const release = String(kernelRelease || '').toLowerCase()
  return DOCKER_VMS.find(({ marker }) => release.includes(marker))?.name || null
}

const DOCKER_VMS = [
  { marker: 'orbstack', name: 'OrbStack' },
  { marker: 'linuxkit', name: 'Docker Desktop' },
  { marker: 'microsoft', name: 'Docker on Windows' },
]
