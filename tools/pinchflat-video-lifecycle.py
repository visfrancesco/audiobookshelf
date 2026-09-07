#!/usr/bin/env python3
"""Invoke from Pinchflat's lifecycle script; never moves or modifies media."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile


def completion_manifest(event, payload, media_root):
    if event not in ('media_downloaded', 'media_deleted'):
        return None
    source = payload.get('source', {})
    source_id = source.get('uuid')
    video_id = payload.get('media_id')
    if not source_id or not video_id:
        raise ValueError('Lifecycle event is missing source UUID or YouTube video ID')
    root = Path(media_root).resolve()

    def relative(value):
        if not value:
            return None
        return str(Path(value).resolve().relative_to(root))

    manifest = {'sourceId': source_id, 'videoId': video_id, 'kind': 'deleted' if event == 'media_deleted' else 'completed'}
    if event == 'media_downloaded':
        manifest.update(relativePath=relative(payload.get('media_filepath')),
                        metadataPath=relative(payload.get('metadata_filepath')),
                        thumbnailPath=relative(payload.get('thumbnail_filepath')),
                        expectedSize=payload.get('media_size_bytes'), title=payload.get('title'),
                        completedAt=payload.get('media_redownloaded_at') or payload.get('media_downloaded_at'))
        if not manifest['relativePath'] or not manifest['completedAt']:
            raise ValueError('Media download is not complete')
    return manifest


def main():
    manifest = completion_manifest(sys.argv[1], json.loads(sys.argv[2]), os.environ.get('PINCHFLAT_MEDIA_ROOT', '/downloads'))
    if manifest is None:
        return
    inbox = Path(os.environ['ABS_VIDEO_INBOX'])
    inbox.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(f"{manifest['sourceId']}:{manifest['videoId']}".encode()).hexdigest()
    with tempfile.NamedTemporaryFile(mode='w', dir=inbox, prefix=key, suffix='.partial', delete=False) as output:
        json.dump(manifest, output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(output.name, inbox / (key + '.json'))
    directory = os.open(inbox, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


if __name__ == '__main__':
    main()
