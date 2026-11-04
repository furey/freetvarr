# Security

## Reporting

Open a private security advisory at <https://github.com/furey/freetvarr/security/advisories/new>.

## Threat model

Freetvarr is an authless service for a **trusted home LAN**. It has no login: anyone who can reach the port can read configuration and change settings. CSRF, rate limiting, a strict CSP, `noindex` headers, and a `Host` check (report-only until `3.0.0`) are in place, and cross-origin browser attacks are blocked (no CORS, `SameSite=Strict` cookie, mandatory custom header), but the following are accepted consequences of the design, not defects. Do not expose Freetvarr to the internet.

- **`GET /api/settings` returns configuration to any LAN client.** The Plex token is never returned (it collapses to a `*_set` boolean), but the TVHeadend host, TVHeadend username, Plex URL, and media/config paths are. The TVHeadend password is stored in plain text in the SQLite settings table and, like the Plex token, is never returned by the API; on a trusted LAN this is acceptable.
- **Stored secrets are bound to their URLs.** Freetvarr sends the stored TVHeadend password, Plex token, and Sonarr or Radarr key only to a URL with the origin (scheme, host, and port) they were saved with. A Plex token read from `Preferences.xml` goes only to a Plex on this machine until it is saved with a URL. Changing an address without the secret in the same request deletes the stored secret, so the next request asks for it again. The Sonarr and Radarr keys read from `config.xml` go only to an address on this machine at the `config.xml` port.
- **`plex_url` is a server-side request vector.** `POST /api/plex-sections` and `/api/plex-refresh` fetch a caller-supplied URL, so a LAN client can use Freetvarr as a bounded HTTP status oracle against other hosts. These requests carry no stored token unless the URL passes the binding rule above. Blocking private ranges isn't viable because Plex itself lives on a private LAN address.
- **The `Host` check trusts local names.** Freetvarr answers to IP addresses, `localhost`, one-word names, the machine name, names under `.local`, `.localhost`, `.lan`, `.home`, `.home.arpa`, `.internal`, `.localdomain`, and `.corp`, and the names in Settings → SYSTEM → Setup → **Allowed hostnames** or `FREETVARR_ALLOWED_HOSTS`. Freetvarr logs names it does not know and Health lists them; from `3.0.0` it refuses them with `403`, which blocks DNS rebinding from a public website. Until then, a public website can still reach Freetvarr through DNS rebinding. The check does not stop a device on the LAN that can already reach the port. `GET /healthz` and `GET /guide/xmltv.xml` skip the check; they return no settings. Setting the list to `*` turns the check off, and Health warns.
- **HSTS is off.** Freetvarr serves plain HTTP. Turn on HSTS at a TLS proxy in front of Freetvarr, not in Freetvarr.
