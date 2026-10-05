FROM node:24-bookworm-slim

LABEL org.opencontainers.image.source=https://github.com/furey/freetvarr

WORKDIR /app

# Debian (not Alpine) because comskip has no Alpine package. wget must be
# explicit here (busybox provided it on Alpine); tini gives us a proper PID 1
# for SIGTERM; tzdata makes the full IANA zone database (e.g. Australia/Sydney)
# available so Node, cron, and any future child process honour the TZ env var
# consistently; comskip + ffmpeg power the optional ad-removal feature.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini tzdata wget comskip ffmpeg \
 && rm -rf /var/lib/apt/lists/*

# VAAPI drivers for optional hardware transcoding of live TV (Intel Quick Sync
# via iHD, AMD via Mesa). Debian's free Intel driver lacks the video
# processing entrypoint that deinterlace_vaapi and scale_vaapi need, so the
# non-free iHD driver comes from non-free on amd64 only. Without /dev/dri in
# the container these are unused and live TV transcodes in software instead.
RUN sed -i 's/^Components: main$/Components: main non-free non-free-firmware/' /etc/apt/sources.list.d/debian.sources \
 && apt-get update \
 && apt-get install -y --no-install-recommends mesa-va-drivers \
 && if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
      apt-get install -y --no-install-recommends intel-media-va-driver-non-free; \
    fi \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
# node:24-bookworm-slim bundles npm 10.x but package.json requires >=11.10.0
# (engine-strict). We inline the install steps instead of `npm run setup` to
# skip `npm audit signatures` at build time — it re-queries the registry and
# enforces min-release-age=3, which blocks freshly-published deps. Run `npm
# audit signatures` (or `npm run setup`) on the host after the lockfile's
# newest dep ages past the threshold; the lockfile's integrity hashes still
# verify package contents during `npm ci`.
RUN npm install -g npm@11.15.0 \
 && npm ci --ignore-scripts \
 && npm run rebuild:natives

COPY . .

# Force production mode so a bare `docker run` (without the compose env) never
# serves Express development-mode stack traces. Compose sets the same value;
# this is the safe default when it doesn't.
ENV NODE_ENV=production

# /config is bind-mounted at runtime. Create it so the container can boot even
# if the host directory is empty on first run.
RUN mkdir -p /config

EXPOSE 3733

# Healthcheck hits the in-process /healthz endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:${PORT:-3733}/healthz || exit 1

# tini handles signals and reaps the migrate child; entrypoint runs migrations
# before exec'ing the server.
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker-entrypoint.sh"]
