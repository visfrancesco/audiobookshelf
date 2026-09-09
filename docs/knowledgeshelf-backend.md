# KnowledgeShelf backend

KnowledgeShelf 2.37.0 builds on Audiobookshelf's catalog, authentication, playback and progress APIs. The backend branch keeps the existing web client while providing the API for the subsequent Laravel UI. AudioAtlas keeps using the same ABS endpoints. `/status.app` stays `audiobookshelf`; `/status.product` and `/api/capabilities.product` identify KnowledgeShelf.

## Running

Build with `docker build -t knowledgeshelf:local .`. Keep the existing `/config`, `/metadata` and library mounts. Back up **both config and metadata** before upgrading. Migration `v2.37.0-knowledgeshelf.js` adds four tables without rewriting existing libraries or episode IDs. Downgrade by restoring the pre-upgrade backup, not by running an older binary against the upgraded database.

The image contains Node 22, FFmpeg/FFprobe, Poppler's `pdftotext`, Python, yt-dlp and its bundled EJS challenge solver. Downloader dependencies are pinned in `tools/requirements-knowledge.txt`. The server runs one persistent SQLite queue and one expensive job at a time; run one backend instance per config volume. No additional download/generation service or catalog database is needed.

Optional server configuration:

| Variable | Purpose |
| --- | --- |
| `ELEVENLABS_API_KEY` | Enables ElevenLabs voices and narration. Supply through deployment secrets; never a browser setting. |
| `YTDLP_COOKIES_FILE` | Absolute path to a Netscape-format YouTube cookie file when YouTube requires login. A private temporary copy is used, so the mounted original may be read-only. |
| `YTDLP_PATH` | Override the yt-dlp executable for a non-container installation. |
| `FFMPEG_PATH`, `FFPROBE_PATH`, `PDFTOTEXT_PATH` | Override media/document tools outside Docker. |

YouTube may require cookies or reject a hosting network. A bundled downloader cannot guarantee access to every video. Runtime errors identify authentication requirements; download jobs can be retried after fixing configuration. Automated tests never call ElevenLabs or depend on YouTube availability.

## API conventions

All endpoints below are under `/api/knowledge` and use existing ABS bearer authentication. Sources, adoption and asset operations require an administrator and access to the destination library. Documents require upload permission; documents and their jobs are visible only to their owner or an administrator with library access. List endpoints accept `limit` (1–100, default 30) and `offset`; they return `total` plus `sources`, `documents`, `jobs` or `assets`. Disk paths, provider keys and speech checkpoints are excluded from public document/job/asset responses. Errors are `{ "error": "...", "code": "..." }` with an appropriate HTTP status.

| Method/path | Behavior |
| --- | --- |
| `GET /status` | Product/capability flags, accepted document formats and upload limit. |
| `GET /voices` | Available ElevenLabs voice IDs/names/labels, cached for one hour. |
| `GET, POST /sources` | List or create YouTube sources. |
| `GET, PATCH, DELETE /sources/:id` | Read, change polling/retention/name, or remove a source. Removal keeps imported library media. If downloads are stopping, retry removal after cancellation finishes. |
| `POST /sources/:id/check` | Queue a bounded discovery check. Explicit checks also work for paused sources. |
| `GET /sources/:id/assets` | Imported episodes and their availability/ownership. |
| `POST /assets/:id/refresh` | Reprobe/reimport a restored or changed original, preserving an existing episode ID; explicitly restores a deleted episode if necessary. |
| `POST /pinchflat/preview`, `/pinchflat/adopt` | Preview/adopt an existing video mapping without downloading media. |
| `GET, POST /documents` | List or import text, a file or an article URL. |
| `GET, PATCH, DELETE /documents/:id` | Preview/edit or delete source document and caches. Generated library audiobooks remain. Resolve/cancel jobs before deleting. |
| `POST /documents/:id/generate` | Generate from an explicitly reviewed content hash and selected voice. |
| `GET /jobs`, `/jobs/:id` | Progress, state, safe errors, completed chunk count and result IDs. Lists optionally filter by `state`. |
| `POST /jobs/:id/cancel`, `/jobs/:id/retry` | Cancel/retry work; uncertain paid requests need explicit acknowledgment. |

### YouTube sources

Create a source with this JSON:

```json
{
  "name": "My channel",
  "url": "https://www.youtube.com/@channel/videos",
  "mode": "video",
  "libraryId": "podcast-library-id",
  "libraryFolderId": "folder-id",
  "enabled": true,
  "intervalMinutes": 360,
  "maxItems": 20,
  "retentionDays": 0,
  "startDate": "2026-09-01"
}
```

The destination must be a podcast library. KnowledgeShelf creates the podcast directory/item automatically. URLs may identify a single video, playlist or channel; only HTTPS YouTube URLs are accepted. The initial and subsequent checks inspect at most `maxItems` (1–100). This deliberately does not crawl an entire channel's history. `startDate` is an optional inclusive publication date. Pausing cancels queued/running source jobs. Re-enabling resumes discovery; cancelled downloads remain stopped until explicitly retried. Changing URL, mode or destination requires a new source.

Video mode prefers MP4/H.264/AAC at up to 1080p and keeps one combined original under `/metadata/knowledge/media`. Watch compatibility is verified by FFprobe; other codecs retain audio listening and report why Watch is unavailable. Listen uses the existing temporary AAC HLS stream. Clients request `includeVideoEpisodes=1` to receive video episodes. Audio mode stores M4A in the podcast's library directory and appears in ordinary ABS clients. Titles, descriptions, publication dates, thumbnails and YouTube chapters are retained.

Downloads have a four-hour timeout, a 4 GiB file limit and a 12-hour duration filter. Deduplication uses source plus YouTube video ID. Deleting an episode excludes it from subsequent discovery. Retention is measured from import time, deletes only unchanged originals owned by KnowledgeShelf, and keeps episode/progress identity. A missing/replaced original becomes unavailable; use asset refresh after restoring it. Adoption never transfers file ownership.

### Adopting Pinchflat

Keep the legacy `video-podcasts.json` configuration and original media mount during adoption. Send `{ "sourceId": "existing-mapping-id", "name": "Channel", "url": "https://www.youtube.com/@channel" }` to preview, then the same body to adopt. Only ready video imports from that mapping are adopted. Existing episode IDs, progress and original files remain; legacy import records are excluded so reconciliation cannot overwrite the adopted episodes. The new source starts paused. Enable it when ready to download future episodes natively.

This migration handles the existing ABS video import integration. It does not infer mappings for arbitrary folders or import Pinchflat's database, and it does not move/delete external files. Keep the original media mount after removing the Pinchflat service. Existing audio-only Pinchflat libraries continue to work as ordinary ABS media; creating new native sources does not silently relabel those files.

### Document narration

Create with `title`, optional `author`, `libraryId`, `libraryFolderId`, and exactly one of `text`, `url`, or a multipart `file` field. The destination must be a book library. TXT/Markdown/HTML/PDF/EPUB/DOCX uploads are supported. Files are limited to 20 MiB, HTML/articles to 2 MiB, expanded archives to 50 MiB/2,000 entries and extracted text to one million characters. PDF extraction requires embedded text; scanned documents need OCR before upload. HTML extraction removes navigation/scripts and uses Readability; review extraction because document layout can still affect reading order. EPUB uses spine order. Narration reads the preview text, with no summarization or rewriting.

Wait for extraction, fetch `/documents/:id`, edit text if needed, then generate:

```json
{
  "contentHash": "hash-from-the-current-preview",
  "voiceId": "voice-id-from-voices",
  "modelId": "eleven_multilingual_v2",
  "maxCharacters": 100000
}
```

`maxCharacters` is a character budget, not a currency quote; provider plans determine billing. The default is 100,000, maximum one million. Supported models are `eleven_multilingual_v2`, `eleven_turbo_v2_5` and `eleven_flash_v2_5`. The same text/title/author/voice/model request returns its existing job; generating with different settings creates a new job and replaces that document's audiobook while retaining its library item ID.

Speech is split at sentence/paragraph boundaries into at most 4,000 characters. Each successful response is saved before the next request. MP3 padding is decoded out before chapter timing; FFmpeg produces a chaptered M4B and the normal ABS scanner imports it. EPUB sections become chapters; unstructured documents receive a document chapter. Paid chunks stay in `/metadata/knowledge/jobs` until document deletion so retries can reuse them.

Jobs transition through `queued`, `running`, `retry`, `completed`, `cancelling`, `cancelled`, `failed` or `needs_review`. Known rate-limit rejections use bounded exponential retry. Interrupted/ambiguous speech requests remain `needs_review` across restart. Check provider usage, then send `{ "acknowledgeUncertain": true }` to retry if you accept that the interrupted request may be charged again. Cancellation cannot undo a request already received by ElevenLabs. No automatic retry is made in that uncertain state.

## Validation

`npm test` runs existing regressions and KnowledgeShelf tests. `npm run test:knowledge` focuses on the new backend. Tests use real SQLite, FFmpeg and local documents, with mocked paid/download provider calls. The unit pipeline installs Poppler and verifies the pinned downloader. The container pipeline checks fresh startup, authentication, capabilities, new tables, tool availability, persistent restart and upgrade from the existing ABS base image. Publishing remains on the current repository's versioned release workflow so infrastructure can adopt the product image independently.

Reference contracts: [yt-dlp](https://github.com/yt-dlp/yt-dlp), [JavaScript solver requirements](https://github.com/yt-dlp/yt-dlp/wiki/EJS), [ElevenLabs speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [Readability](https://github.com/mozilla/readability).
