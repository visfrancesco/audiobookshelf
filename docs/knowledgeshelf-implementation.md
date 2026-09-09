# KnowledgeShelf implementation

## Delivery sequence

1. `feat/knowledgeshelf-backend`: preserve ABS APIs/data; introduce KnowledgeShelf identity, durable jobs, native yt-dlp sources/downloads, adoption of existing Pinchflat media, document extraction and ElevenLabs narration. Add API documentation, unit/integration tests and container CI. Validate this branch before starting the frontend.
2. `feat/knowledgeshelf-laravel-ui`: branch from the validated backend commit. Replace the web client with Laravel, prioritizing server-rendered pages, pagination, small assets and direct media delivery. Cover existing library/playback/administration workflows and the new Sources, Documents and Jobs workflows.

The repositories and production deployments are not renamed or changed as a side effect of development. The product/image identify as KnowledgeShelf while legacy API clients retain their compatibility contract. Existing GPL attribution and history remain.

## Backend acceptance

- Native YouTube single-video/channel/playlist sources, bounded downloads, metadata/chapters, audio or video mode, scheduling, retention, deduplication, cancellation and restart recovery.
- One permanent combined original for video; existing Listen/Watch delivery remains available without Pinchflat configuration.
- Import existing Pinchflat media without redownloading; retain existing episode IDs/progress where a mapping exists. Only delete files owned by KnowledgeShelf.
- Text/PDF/EPUB/DOCX/HTML/article extraction with preview and edit before generation. Preserve source text rather than summarizing it.
- ElevenLabs voice discovery, bounded narration chunks, durable checkpoints, cancellation, explicit handling of uncertain paid requests, final audio/chapters imported into the normal library.
- Authenticated/authorized APIs, source/path/URL validation, bounded resource use, secrets kept out of responses/logs.
- Existing server regression tests, new real-SQLite/FFmpeg and mocked-provider tests, API/container smoke checks and upgrade checks pass. No paid requests are made by tests.

## UI acceptance

- Laravel login/session handling against existing backend identity; no duplicated catalog database.
- Fast library browsing/search, item details, audio/video player, progress/bookmarks, chapters and playback controls.
- Sources/subscriptions, documents/text preview/voices/generation, jobs/retry/cancel and existing administrative workflows.
- Unit/feature tests, browser verification, production asset/container builds and CI.
- The backend branch remains independently reviewable; the UI branch includes its commits.

## Backend verification — 2026-09-09

- 401 server tests pass (371 existing tests plus 30 KnowledgeShelf tests), including real SQLite, FFmpeg, Poppler, migration/adoption, access control, regeneration and paid-request recovery.
- Two existing Python lifecycle tests pass.
- The production Docker image passes fresh startup, authenticated upload/extraction, API/schema/tool checks and persistent restart. Upgrade from the pinned upstream 2.36.0 image also passes.
- The packaged Node 20 Linux executable starts and passes authenticated document upload/extraction with system media tools.
- Live YouTube channel discovery succeeds. A live video download is blocked by YouTube's authentication challenge on this host; server-side cookie support is implemented and tested with private disposable copies. No ElevenLabs requests were made during validation.
