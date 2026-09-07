# Video podcasts with Pinchflat and AudioAtlas

This feature adds streamed Listen/Watch playback to the updated AudioAtlas client. Pinchflat owns one original video with sound. ABS generates temporary audio-only HLS when listening and serves the original MP4 when watching. Device downloads and video playback in other clients are outside this release.

## Server setup

1. Back up the ABS database before upgrading. This branch uses database version 2.36.1; restoring the pre-upgrade database is required to return to an older binary.
2. Create a podcast in ABS for each selected Pinchflat source. Disable RSS automatic downloading for those target podcasts. Keep the target podcast's ordinary ABS directory separate from Pinchflat downloads.
3. Mount Pinchflat's downloads read-only into ABS at `/pinchflat`. Mount a separate completion inbox read/write into both containers at `/video-inbox`. ABS must be able to read the original files and write its metadata/streams directory. Keep shared media available for the entire playback session.
4. Save the following configuration as `/config/video-podcasts.json`, replacing IDs and paths with those from your installation. Set `VIDEO_PODCAST_CONFIG` to use another configuration file. Restart ABS after changes.

```json
{
  "enabled": true,
  "mediaRoot": "/pinchflat",
  "inbox": "/video-inbox",
  "concurrency": 2,
  "maxStreamBytes": 4294967296,
  "sources": [
    {
      "sourceId": "PINCHFLAT-SOURCE-UUID",
      "libraryItemId": "ABS-PODCAST-LIBRARY-ITEM-ID",
      "relativeDirectory": "Podcast name",
      "feedURL": "http://pinchflat:8945/sources/PINCHFLAT-SOURCE-UUID/feed.xml"
    }
  ]
}
```

`feedURL` is the private, administrator-configured Pinchflat feed used for reconciliation. It may contain feed authentication; protect the configuration accordingly. ABS reads feed metadata and local sidecars, not enclosure media. Pinchflat currently limits feeds to 2,000 downloaded entries. A warning at that limit means older files require explicit backfill. Missing feed entries never delete imports.

Configure Pinchflat for MP4, H.264 video, AAC audio, and the original audio language. Enable **Embed metadata**, **Download metadata**, and optionally **Download thumbnail**. Watch additionally requires 8-bit 4:2:0 pixel format. Codec preferences can fall back, so ABS probes each final file: incompatible video gets a Watch explanation while audio remains listenable if FFmpeg supports it. There is no server video conversion or permanent extracted audio copy.

## Completion hook and recovery

Copy `tools/pinchflat-video-lifecycle.py` into Pinchflat's scripts directory. Call it from the existing lifecycle script, preserving any existing handlers:

```sh
export PINCHFLAT_MEDIA_ROOT=/downloads
export ABS_VIDEO_INBOX=/video-inbox
python3 /config/extras/user-scripts/pinchflat-video-lifecycle.py "$1" "$2"
```

Use the actual Pinchflat paths for your installation. Its media root differs from ABS's `/pinchflat` mount; manifests store relative paths to bridge the two. The script handles completed downloads and deletions, writes only an atomic completion manifest, and does not change media. Pinchflat does not retry failed hooks; ABS retries queued imports and reconciles the configured source directories against feeds every five minutes. Feed recovery requires two stable observations of a downloaded file (normally five to ten minutes). Monitor hook failures and use backfill if a historical event cannot be recovered.

The importer checks the inbox every five seconds. It deduplicates by target podcast and YouTube ID. Import diagnostics are available to administrators at `GET /api/video-imports`. Retry delays grow to one hour; restarted jobs resume from durable records.

For backfill, create a manifest referring to a verified completed file:

```json
{
  "sourceId": "PINCHFLAT-SOURCE-UUID",
  "videoId": "YOUTUBE-VIDEO-ID",
  "relativePath": "Podcast name/Episode.mp4",
  "metadataPath": "Podcast name/Episode.info.json",
  "title": "Episode"
}
```

Set `ABS_SERVER_URL` and `ABS_API_TOKEN` in your environment, then run `python3 tools/import-video-podcast.py manifest.json`. Add `--restore` only to intentionally restore an episode excluded by deletion in ABS. Never put tokens in manifests.

## Playback and lifecycle

- Open the podcast in AudioAtlas, choose an episode, and select Listen or Watch. Mode changes may briefly buffer and preserve progress, speed, play/pause intent, and the sleep timer. Leaving the app or locking the phone changes Watch to Listen; returning does not automatically start video.
- Chapters come from the processed media, including adjusted markers after SponsorBlock cuts. Files without chapters remain playable.
- New video-sourced episodes are visible only to clients requesting `includeVideoEpisodes=1`; old clients and exported feeds retain their audio-only content. The authenticated `/api/capabilities` endpoint advertises `videoPodcastsV1`.
- ABS deletion removes its episode and records an exclusion. Pinchflat's original stays intact. Upstream file removal makes both modes unavailable while preserving progress. A replacement invalidates active streams; its completion hook, feed reconciliation or explicit backfill triggers reimport; AudioAtlas asks whether to restart or resume a changed revision.
- Audio segments are generated on demand with at most two FFmpeg jobs by default. The default aggregate segment budget is 4 GiB. Budget exhaustion returns a retryable preparation error. Output is removed when sessions close, after idle expiry, and during orphan cleanup on restart. Session URLs act as unguessable bearer capabilities, following existing ABS streaming behavior; protect access to them. Direct MP4 supports HTTP ranges and the existing X-Accel path mapping. An X-Accel response already delegated to the proxy cannot be interrupted by ABS; later requests still require a live session.
- To disable the feature, set `enabled` to false and restart ABS. Records and originals remain stored. Configure Pinchflat retention deliberately: ABS cannot preserve access after the original is removed.

## Verification

Run `npm test` with FFmpeg/ffprobe installed and `python3 -B -m unittest discover -s test/tools -v` for the lifecycle adapter. Media tests generate an isolated video with known chapters, request segments out of order, check audio-only tracks and presentation timestamps, and verify cleanup and resource limits.

AudioAtlas additionally requires `swift test` and Xcode build/UI tests on macOS, followed by physical iPhone/iPad playback checks. Verify range requests, unbuffered chapter seeks, network recovery, mode changes, background audio, interruptions, fullscreen rotation, and long sessions. Linux core checks do not validate AVFoundation, AVKit, SwiftData, or background execution.

### Current verification evidence

On this branch the server suite passes with generated FFmpeg media, including HTTP range requests, native HLS playlist/segment requests without sockets, source revision rejection, session revocation, import ordering, migration, independent episode progress/bookmarks and legacy serialization. Lifecycle adapter tests pass. AudioAtlas core tests pass in an isolated Linux harness; native iOS build and device acceptance remain pending on macOS/Xcode. No real Pinchflat installation or physical phone was available in this environment.
