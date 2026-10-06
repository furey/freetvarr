import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectDockerVm } from '../src/docker-host.js'

test('detectDockerVm names the VM from the kernel release', () => {
  assert.equal(detectDockerVm('7.0.14-orbstack-00380-ga7e0a2dc9535'), 'OrbStack')
  assert.equal(detectDockerVm('6.10.14-linuxkit'), 'Docker Desktop')
  assert.equal(detectDockerVm('5.15.167.4-microsoft-standard-WSL2'), 'Docker on Windows')
})

test('detectDockerVm finds no VM on a Linux host or outside Docker', () => {
  assert.equal(detectDockerVm('6.8.0-45-generic'), null)
  assert.equal(detectDockerVm('5.10.60+'), null)
  assert.equal(detectDockerVm('23.6.0'), null)
  assert.equal(detectDockerVm(''), null)
})
