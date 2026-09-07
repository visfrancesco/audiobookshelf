import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / 'tools' / 'pinchflat-video-lifecycle.py'
spec = importlib.util.spec_from_file_location('lifecycle', SCRIPT)
lifecycle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lifecycle)


class VideoLifecycleTests(unittest.TestCase):
    def test_completion_uses_relative_paths_and_only_expected_fields(self):
        payload = {'source': {'uuid': 'source', 'secret': 'not-exported'}, 'media_id': 'video',
                   'media_filepath': '/downloads/show/episode.mp4', 'metadata_filepath': '/downloads/show/episode.info.json',
                   'media_downloaded_at': '2026-09-07T00:00:00Z', 'media_size_bytes': 10}
        manifest = lifecycle.completion_manifest('media_downloaded', payload, '/downloads')
        self.assertEqual(manifest['relativePath'], 'show/episode.mp4')
        self.assertEqual(manifest['expectedSize'], 10)
        self.assertNotIn('secret', json.dumps(manifest))
        self.assertIsNone(lifecycle.completion_manifest('source_created', {}, '/downloads'))
        with self.assertRaises(ValueError):
            lifecycle.completion_manifest('media_downloaded', {**payload, 'media_downloaded_at': None}, '/downloads')
        with self.assertRaises(ValueError):
            lifecycle.completion_manifest('media_downloaded', {**payload, 'media_filepath': '/outside/video.mp4'}, '/downloads')

    def test_repeated_hooks_atomically_replace_manifest_and_keep_original(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            media = root / 'episode.mp4'
            media.write_bytes(b'original')
            payload = {'source': {'uuid': 'source'}, 'media_id': 'video', 'media_filepath': str(media),
                       'media_downloaded_at': '2026-09-07T00:00:00Z'}
            environment = {**os.environ, 'PINCHFLAT_MEDIA_ROOT': directory, 'ABS_VIDEO_INBOX': str(root / 'inbox')}
            for event in ['media_downloaded', 'media_downloaded', 'media_deleted']:
                subprocess.run([sys.executable, str(SCRIPT), event, json.dumps(payload)], env=environment, check=True)
            files = list((root / 'inbox').iterdir())
            self.assertEqual(len(files), 1)
            self.assertEqual(json.loads(files[0].read_text())['kind'], 'deleted')
            self.assertEqual(media.read_bytes(), b'original')


if __name__ == '__main__':
    unittest.main()
