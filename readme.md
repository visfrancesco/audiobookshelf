# KnowledgeShelf

A self-hosted library for audiobooks, video podcasts, and documents you want to hear. KnowledgeShelf builds on Audiobookshelf and keeps its libraries, listening history, API, and AudioAtlas compatibility.

- Follow YouTube channels or playlists with the built-in yt-dlp downloader. Choose audio downloads or one video original with Listen/Watch playback.
- Upload documents or save articles, review their full text, and create a narrated audiobook with ElevenLabs.
- Browse, listen, read, and administer your library through a Laravel interface. Navigation keeps the player open; streaming and ebook code loads on demand.
- Manage subscriptions, background jobs, RSS podcasts, collections, playlists, users, backups, and metadata in the same product.

## Run locally

```sh
docker compose up --build -d
```

Open `http://localhost:13378` and create the administrator account. Add libraries pointing to `/audiobooks` and `/podcasts`. The example Compose file persists those folders plus `/config` and `/metadata`.

The image runs Node, PHP-FPM, and Caddy together and exposes port 80. Media requests go directly to Node. Laravel uses the existing backend accounts and catalog; it does not maintain another catalog database. Its encrypted sessions and generated application key persist under `/config`.

Set `ELEVENLABS_API_KEY` on the container to enable narration. YouTube downloads and existing media playback work without it. See the [backend setup and API guide](docs/knowledgeshelf-backend.md) for limits, cookies, retention, and Pinchflat adoption.

The Docker image is the complete application. Packaged standalone Node binaries provide the backend API. `vfh-infra` can deploy the versioned image from the existing release workflow; this repository does not change live infrastructure automatically.

## Development and validation

Requirements: Node 22, PHP 8.5, Composer, FFmpeg, Poppler, and Python. Backend and Laravel dependencies have separate lock files.

```sh
npm ci
npm run web:install
npm run web:build
npm test
cd web
php artisan test
npm test
```

For local Laravel development, copy `web/.env.example` to `web/.env`, run `php artisan key:generate` from `web`, and configure `KNOWLEDGESHELF_BACKEND_URL`. Use the combined Docker image when testing playback and public media routes, because its gateway serves both applications on the same origin.

CI checks server regressions, Laravel permissions/forms/API contracts, player logic, asset size budgets, production builds, and complete container startup/upgrade. Cypress exercises persistent playback, document previews, mobile navigation, and public shares in the built image. The container integration suite exercises login, library creation, document review, audio upload, direct range streaming, and progress persistence without paid provider calls.

The implementation is split into `feat/knowledgeshelf-backend` and the dependent `feat/knowledgeshelf-laravel-ui` branch. See the [implementation record](docs/knowledgeshelf-implementation.md).

## Attribution

KnowledgeShelf is a fork of [Audiobookshelf](https://github.com/advplyr/audiobookshelf), created by advplyr and its contributors. Existing source history and attribution are preserved. The project is distributed under [GPL-3.0](LICENSE).

Laravel, Livewire, yt-dlp, FFmpeg, Readability, epub.js, HLS.js, and other dependencies retain their respective licenses. ElevenLabs is an optional external narration provider.
