---
title: Reference
description: >-
  The technical companion to the guide; how Freetvarr works under the hood, and
  why it works that way.
---

# Reference

The guide covers how to run Freetvarr and use each page. This section covers how it works underneath, and why.

- **[Technical deep dive](/deep-dive)**: architecture, the TVHeadend API surface, the import state machine, how a title becomes a show, one-off, or movie (and the folder moves that follow), the ad-removal pipeline, the live-progress registry, the Activity job registry, live TV with From the start and Multiview, library delete, the Plex watched sync and whole Plex library, Sonarr and Radarr, For you, search, the layout, the full environment reference, the Docker deployment model, the security model, and local development.

The deep dive is one long page with its own contents list. Start there for a specific mechanism (why an import ends as `partial`, how keep-segments are computed for a cut, how a series becomes an autorec rule).

For the source itself, see the [repository on GitHub](https://github.com/furey/freetvarr).
