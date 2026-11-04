# Security

## Reporting

Open a private security advisory at <https://github.com/furey/freetvarr/security/advisories/new>.

## Threat model

Freetvarr is an authless service for a **trusted home LAN**. It has no login: anyone who can reach the port can read configuration and change settings. CSRF, rate limiting, a strict CSP, and `noindex` headers are in place, and cross-origin browser attacks are blocked (no CORS, `SameSite=Strict` cookie, mandatory custom header), but the following are accepted consequences of the design, not defects. Do not expose Freetvarr to the internet.

- **`GET /api/settings` returns configuration to any LAN client.** The Plex token is never returned (it collapses to a `*_set` boolean), but the TVHeadend host, TVHeadend username, Plex URL, and media/config paths are. The TVHeadend password is stored in plain text in the SQLite settings table and, like the Plex token, is never returned by the API; on a trusted LAN this is acceptable.
- **Stored secrets are bound to their URLs.** Freetvarr sends the stored TVHeadend password, Plex token, and Sonarr or Radarr key only to a URL with the origin (scheme, host, and port) they were saved with. A Plex token read from `Preferences.xml` goes only to a Plex on this machine until it is saved with a URL. Changing an address without the secret in the same request deletes the stored secret, so the next request asks for it again. The Sonarr and Radarr keys read from `config.xml` go only to an address on this machine at the `config.xml` port.
- **`plex_url` is a server-side request vector.** `POST /api/plex-sections` and `/api/plex-refresh` fetch a caller-supplied URL, so a LAN client can use Freetvarr as a bounded HTTP status oracle against other hosts. These requests carry no stored token unless the URL passes the binding rule above. Blocking private ranges isn't viable because Plex itself lives on a private LAN address.
- **No DNS-rebinding / `Host`-header defense.** A trusted-LAN, plain-HTTP service accessed by IP can't meaningfully allowlist `Host`. This is the same class as HSTS being disabled: re-add both when fronting Freetvarr with TLS and a stable hostname.
