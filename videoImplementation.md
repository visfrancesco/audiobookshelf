# Video podcast implementation

Status: implemented on `feat/video-podcasts` in Audiobookshelf and `../AudioAtlas`. Server and isolated Swift core checks pass. Native iOS build, real Pinchflat integration, and physical-device playback acceptance remain pending; this is not a claim of validated seamless switching.

## Product decisions

| Requirement | First implementation |
| --- | --- |
| Acquisition | Pinchflat downloads YouTube video podcasts; no fork or second YouTube download. |
| Permanent media | One combined video/audio original owned by Pinchflat, mounted read-only into ABS. Metadata and artwork are separate. |
| Listen | ABS generates temporary audio-only HLS on demand. No video media is sent by this representation. |
| Watch | Direct MP4 with sound. Require H.264, 8-bit 4:2:0 video and AAC audio; unsupported output gets an explanation. No video conversion. |
| Switching | A brief pause/buffering is acceptable. Keep episode time, play/pause intent, speed, volume and the sleep deadline. |
| Lock/background | Request Listen, including when Watch is still opening. Returning stays in Listen. |
| Identity | One ABS podcast episode shared by both modes; use parent plus episode identity for client cache, progress and bookmarks. |
| Chapters | Use chapter titles and times embedded in the final processed media, including SponsorBlock-adjusted cuts. Missing chapters do not block playback. |
| Device downloads | Streaming only for podcast episodes. Existing audiobook downloads remain available. |
| Compatibility | AudioAtlas first. New video-sourced episodes are hidden from legacy clients and RSS; existing audio episodes remain available. |
| Deferred features | Gapless mode changes, separate synchronized rendition HLS, shared reusable audio cache, PiP, video AirPlay, captions and web video. |

An extension such as `.mp4` does not itself provide audio-only network delivery. AVQueuePlayer plays the selected representation and maintains the native timeline. Media Source Extensions are a browser API and are not used in AudioAtlas.

## Data and import

- `podcastEpisodes.videoSource` stores source/video identity, private relative path, revision, duration, container, selected audio stream, codecs, dimensions and availability. `audioFile` is null for these episodes; no nonexistent audio file is invented.
- `videoImports` stores a durable completion manifest, target item/episode, state, attempts, retry time and diagnostic. Target podcast plus YouTube ID is the deduplication key.
- The Python lifecycle adapter writes an atomic completion/deletion manifest into a shared inbox. The importer claims files atomically, serializes changes for each import and retries failed jobs after restart.
- Source mappings target existing ABS podcasts whose automatic RSS downloads are disabled. Target directories and the completion inbox must be separate from Pinchflat originals. Paths are resolved and checked against the configured root, including symlinks.
- Import only completed, stable media; verify the expected size when supplied, metadata video ID and a second file revision after probing. Probe work has a timeout and output bound.
- Optional feed reconciliation confirms downloaded enclosures and requires two stable local observations. Pinchflat's feed limit of 2,000 entries is reported; older downloads need explicit completed-file backfill. Feed absence alone never means deletion.
- Replacements preserve episode identity and progress, replace chapters, invalidate active sessions and record the previous revision. AudioAtlas asks whether to restart or resume. Files that change without a completion remain unavailable until a hook, reconciliation or backfill confirms the new revision.
- ABS deletion records an exclusion and removes only ABS-owned records/artifacts. Explicit restore is required to undo an exclusion. Pinchflat removal marks the episode unavailable without deleting its progress identity.
- The database migration is version 2.36.1. Normal ABS SQLite backups retain source descriptors and import/exclusion records. Back up originals, sidecars, configuration and artwork separately. Downgrading requires restoring the pre-upgrade database; an old binary cannot read video episodes as ordinary audio files.

Server implementation: `server/managers/VideoPodcastManager.js`, `server/models/VideoImport.js`, `server/models/PodcastEpisode.js`, `server/utils/videoPodcastUtils.js`, and `server/migrations/v2.36.1-video-podcasts.js`.

## Playback contract

| API | Behavior |
| --- | --- |
| `GET /api/capabilities` | Authenticated discovery of `videoPodcastsV1`; false until configured. |
| `GET /api/items/:id?expanded=1&includeVideoEpisodes=1` | Includes imported episodes for opted-in clients with normal item access checks. |
| `POST /api/items/:id/play/:episodeId?includeVideoEpisodes=1` | Accepts `mode: audio\|video` and optional nonnegative `startTime`; validates the source before replacing the current session. |
| Playback response `media` | Explicit mode, delivery, content URL and MIME type. Watch does not masquerade as an audio track. |
| `GET /public/session/:id/video` | Live-session MP4 delivery with HTTP range and existing X-Accel support. |
| `GET /hls/:id/output.m3u8` and segments | Native HLS without sockets, generated for requested positions; source revision and live session are checked. |
| `PATCH /api/me/progress/:item/:episode` | Independent episode position and completion. |
| Bookmark APIs | Optional `episodeId` separates bookmarks at the same time in different episodes. Existing book payloads remain compatible. |
| `GET /api/video-imports`, `POST /api/video-imports` | Administrator diagnostics and backfill/restore submission. |

Temporary audio is per session: six-second MPEG-TS segments, AAC copy when suitable, otherwise bounded AAC conversion. Defaults are two concurrent FFmpeg jobs and a 4 GiB aggregate segment budget. Closing a session cancels its jobs and removes output. Idle video-podcast sessions expire after 30 minutes, checked in the import cycle; orphan output is removed on restart. MP4 responses delegated through X-Accel are controlled by the proxy once handed off.

AudioAtlas serializes playback-opening requests so a delayed Watch request cannot close a newer Listen session. It releases the preceding player items before opening the new representation, preserves paused intent and timer state, and keeps pending progress writes ordered. A failed switch can reopen the previous representation in the foreground; background failure never falls back to fetching video.

Client implementation: `Domain/PodcastEpisode.swift`, `Infrastructure/AudiobookshelfAPI.swift`, `Services/MutationJournal.swift`, `Services/PlayerController.swift`, `App/AppModel.swift`, and the episode/Now Playing/video views in `../AudioAtlas/AudioAtlas`.

## Setup and validation

Follow [the setup and recovery guide](docs/video-podcasts.md). It includes mounts, source mappings, Pinchflat profile requirements, lifecycle installation and the backfill command. The feature is disabled by default.

| Check | Evidence/status |
| --- | --- |
| Server regression suite | 367 passing with FFmpeg/ffprobe installed. |
| Import lifecycle | Actual SQLite import, deduplication, exclusion, upstream deletion, metadata rejection, ordered concurrent completion, independent progress/bookmarks and idempotent migration. |
| Media and HTTP | Generated video with known chapters; out-of-order audio-only segments and absolute timestamps; range responses; native HLS requests; storage bounds; cleanup; revoked and changed-source rejection. |
| Hook adapter | Two Python tests covering completion validation, safe relative paths, repeated atomic writes and preservation of originals. |
| AudioAtlas core | 74 passing tests in an isolated Linux harness, including episode DTOs, backward decoding, API contracts, Continue Listening and journal isolation. Platform adapters are replaced only in that harness. |
| Swift syntax | App and test source syntax parsed with Swift 6.2.1. This does not type-check/build Apple-framework code. |
| Native regression | Added a PlayerController handoff test for position, pause, speed, volume and sleep deadline; execution requires Xcode. |
| Real-device acceptance | Pending: iPhone/iPad MP4 and HLS playback, Listen network traffic, unbuffered seeks, mode-switch tolerance, fullscreen rotation, lock/background, interruptions, sleep expiry, long sessions and network recovery. |
| Real Pinchflat acceptance | Pending against the installed version: completion/deletion payloads, mounted paths, actual codecs, thumbnail/metadata output, feed recovery and SponsorBlock-adjusted chapters. |

Run `npm test` and `python3 -B -m unittest discover -s test/tools -v` here. In AudioAtlas, run `swift test` on macOS and the Xcode build/native tests described in its README before device acceptance.
