export const countryForTimeZone = (timeZone = '') => {
  const zone = String(timeZone)
  const prefix = PREFIX_COUNTRIES.find(([p]) => zone.startsWith(p))
  if (prefix) return prefix[1]
  return ZONE_COUNTRIES.get(zone) || ''
}

const PREFIX_COUNTRIES = [
  ['Australia/', 'au'],
  ['America/Indiana/', 'us'],
  ['America/Kentucky/', 'us'],
  ['America/North_Dakota/', 'us'],
  ['America/Argentina/', 'ar'],
]

const COUNTRY_ZONES = {
  ad: ['Europe/Andorra'],
  at: ['Europe/Vienna'],
  ax: ['Europe/Mariehamn'],
  be: ['Europe/Brussels'],
  bg: ['Europe/Sofia'],
  br: [
    'America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza', 'America/Recife', 'America/Bahia',
    'America/Belem',
  ],
  ca: [
    'America/Toronto', 'America/Montreal', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg',
    'America/Halifax', 'America/St_Johns', 'America/Regina', 'America/Moncton', 'America/Whitehorse',
  ],
  ch: ['Europe/Zurich'],
  co: ['America/Bogota'],
  cz: ['Europe/Prague'],
  de: ['Europe/Berlin', 'Europe/Busingen'],
  dk: ['Europe/Copenhagen'],
  ee: ['Europe/Tallinn'],
  es: ['Europe/Madrid', 'Atlantic/Canary', 'Africa/Ceuta'],
  fi: ['Europe/Helsinki'],
  fr: ['Europe/Paris'],
  gr: ['Europe/Athens'],
  hk: ['Asia/Hong_Kong'],
  hr: ['Europe/Zagreb'],
  hu: ['Europe/Budapest'],
  id: ['Asia/Jakarta', 'Asia/Pontianak', 'Asia/Makassar', 'Asia/Jayapura'],
  ie: ['Europe/Dublin'],
  il: ['Asia/Jerusalem', 'Asia/Tel_Aviv'],
  ir: ['Asia/Tehran'],
  is: ['Atlantic/Reykjavik'],
  it: ['Europe/Rome'],
  ke: ['Africa/Nairobi'],
  li: ['Europe/Vaduz'],
  lt: ['Europe/Vilnius'],
  lu: ['Europe/Luxembourg'],
  lv: ['Europe/Riga'],
  mk: ['Europe/Skopje'],
  nl: ['Europe/Amsterdam'],
  no: ['Europe/Oslo'],
  nz: ['Pacific/Auckland', 'Pacific/Chatham'],
  pl: ['Europe/Warsaw'],
  pt: ['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores'],
  ro: ['Europe/Bucharest'],
  ru: [
    'Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Europe/Volgograd', 'Asia/Yekaterinburg',
    'Asia/Omsk', 'Asia/Novosibirsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Vladivostok',
  ],
  se: ['Europe/Stockholm'],
  si: ['Europe/Ljubljana'],
  sk: ['Europe/Bratislava'],
  tw: ['Asia/Taipei'],
  ua: ['Europe/Kyiv', 'Europe/Kiev'],
  ug: ['Africa/Kampala'],
  uk: ['Europe/London', 'Europe/Belfast'],
  us: [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix',
    'America/Anchorage', 'America/Juneau', 'America/Detroit', 'America/Boise', 'America/Adak',
    'Pacific/Honolulu',
  ],
  vn: ['Asia/Ho_Chi_Minh', 'Asia/Saigon'],
  za: ['Africa/Johannesburg'],
}

const ZONE_COUNTRIES = new Map(Object.entries(COUNTRY_ZONES)
  .flatMap(([country, zones]) => zones.map((zone) => [zone, country])))
