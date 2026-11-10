import { test } from 'node:test'
import assert from 'node:assert/strict'

import { richTextParts } from '../src/web/rich-text.js'

const codes = (text) => richTextParts(text).filter((part) => part.code).map((part) => part.text)

test('rich text: addresses, hostnames with ports, IPs, paths, and config files become code', () => {
  assert.deepEqual(codes('TVHeadend reads http://192.168.1.10:3733/guide/xmltv.xml again.'), ['http://192.168.1.10:3733/guide/xmltv.xml'])
  assert.deepEqual(codes('Open nas:9981, or 192.168.1.10:9981.'), ['nas:9981', '192.168.1.10:9981'])
  assert.deepEqual(codes('Your files in /media/tv stay; see /config/comskip.ini.'), ['/media/tv', '/config/comskip.ini'])
  assert.deepEqual(codes('Set PUID in .env, then check docker-compose.yml and Preferences.xml.'), ['.env', 'docker-compose.yml', 'Preferences.xml'])
  assert.deepEqual(codes('www.fetchtv.com.au: 13 failed; img-store-prod.switch.tv answered.'), ['www.fetchtv.com.au', 'img-store-prod.switch.tv'])
})

test('rich text: source names, times, and fractions stay plain, and the text is unchanged', () => {
  const text = 'Freeview and i.mjh.nz at 9:30, TV/radio, 50/50, SETTINGS → GUIDE, version 2.21.0, 10.18.0, and incompetech.com.'
  assert.deepEqual(codes(text), [])
  assert.equal(richTextParts(text).map((part) => part.text).join(''), text)
  const mixed = 'Paste https://epg.pw/xmltv/epg_AU.xml.gz (third-party).'
  assert.equal(richTextParts(mixed).map((part) => part.text).join(''), mixed)
  assert.deepEqual(codes(mixed), ['https://epg.pw/xmltv/epg_AU.xml.gz'])
})

test('rich text: labelled numbers stay plain, and long text is not parsed', () => {
  assert.deepEqual(codes('TVHeadend said Status:500, then answered on nas:9981.'), ['nas:9981'])
  const text = 'a.'.repeat(5000)
  const started = Date.now()
  assert.deepEqual(richTextParts(text), [{ code: false, text }])
  assert.ok(Date.now() - started < 50)
})
