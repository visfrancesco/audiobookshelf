#!/usr/bin/env python3
"""Exercise Laravel and Node together on an isolated review container."""
import http.cookiejar
import io
import os
import wave
import json
import sys
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser


class FormTokens(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.token = None
        self.assets = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta' and attrs.get('name') == 'csrf-token':
            self.token = attrs.get('content')
        if tag == 'script' and attrs.get('src'):
            self.assets.append(attrs['src'])
        if tag == 'link' and attrs.get('rel') == 'stylesheet':
            self.assets.append(attrs.get('href'))


class WebIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = sys.argv[1].rstrip('/')
        if urllib.parse.urlparse(cls.base).hostname not in ('127.0.0.1', 'localhost'):
            raise RuntimeError('This test only runs against an isolated local server')
        cls.cookies = http.cookiejar.CookieJar()
        cls.browser = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cls.cookies))
        cls.username = 'smoke'
        cls.password = 'isolated-smoke-password'
        status = cls.api('/status')
        if not status['isInit']:
            page, _ = cls.get('/sign-in')
            cls.post('/setup', {'_token': FormTokens(page).token, 'username': cls.username, 'password': cls.password, 'password_confirmation': cls.password})
        else:
            page, _ = cls.get('/sign-in')
            cls.post('/sign-in', {'_token': FormTokens(page).token, 'username': cls.username, 'password': cls.password})
        login = cls.api('/login', {'username': cls.username, 'password': cls.password})
        cls.access = login['user'].get('accessToken') or login['user']['token']
        libraries = cls.api('/api/libraries')['libraries']
        if not any(library['name'] == 'Web integration library' for library in libraries):
            page, _ = cls.get('/manage/libraries')
            cls.post('/manage/libraries/save', {'_token': FormTokens(page).token, 'name': 'Web integration library', 'mediaType': 'book', 'paths': os.environ.get('WEB_FIXTURE_MEDIA_ROOT', '/metadata/web-integration-books'), 'provider': 'google', 'icon': 'database'})
            libraries = cls.api('/api/libraries')['libraries']
        cls.library = next(library for library in libraries if library['name'] == 'Web integration library')

    @classmethod
    def api(cls, path, data=None):
        headers = {'Content-Type': 'application/json', 'X-Return-Tokens': 'true'}
        if getattr(cls, 'access', None):
            headers['Authorization'] = 'Bearer ' + cls.access
        request = urllib.request.Request(cls.base + path, data=json.dumps(data).encode() if data is not None else None, headers=headers)
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)

    @classmethod
    def get(cls, path):
        with cls.browser.open(cls.base + path, timeout=20) as response:
            return response.read().decode(), response

    @classmethod
    def post(cls, path, data):
        request = urllib.request.Request(cls.base + path, data=urllib.parse.urlencode(data).encode(), headers={'Content-Type': 'application/x-www-form-urlencoded'})
        with cls.browser.open(request, timeout=30) as response:
            return response.read().decode(), response

    def test_administration_and_library_pages_render_real_backend_responses(self):
        paths = ['/manage/' + section for section in ['libraries', 'users', 'settings', 'authentication', 'backups', 'sessions', 'feeds', 'api-keys', 'email', 'notifications', 'metadata', 'tags', 'logs']]
        paths += ['/documents', '/sources', '/jobs', '/upload', '/podcasts/add', '/account', '/account?tab=security', '/account?tab=devices', '/library/' + self.library['id']]
        for path in paths:
            with self.subTest(path=path):
                html, response = self.get(path)
                self.assertEqual(response.status, 200)
                self.assertIn('KnowledgeShelf', html)
                self.assertNotIn(self.access, html)
                self.assertIn('no-store', response.headers['Cache-Control'])
                self.assertFalse(response.geturl().endswith('/sign-in'))

    def test_document_preview_and_edit_work_without_a_paid_provider(self):
        html, _ = self.get('/documents')
        html, response = self.post('/documents', {'_token': FormTokens(html).token, 'title': 'Web narration preview', 'author': 'Integration test', 'libraryId': self.library['id'], 'libraryFolderId': self.library['folders'][0]['id'], 'text': 'Every word belongs in the narration. Nothing is summarized.'})
        path = urllib.parse.urlparse(response.geturl()).path
        self.assertRegex(path, r'^/documents/[a-f0-9-]{36}$')
        document_id = path.rsplit('/', 1)[-1]
        deadline = time.monotonic() + 20
        while self.api('/api/knowledge/documents/' + document_id)['state'] == 'extracting' and time.monotonic() < deadline:
            time.sleep(.2)
        html, _ = self.get(path)
        self.assertIn('Every word belongs in the narration.', html)
        self.assertIn('ElevenLabs is not configured', html)
        self.post(path, {'_token': FormTokens(html).token, 'title': 'Reviewed narration', 'author': 'Integration test', 'text': 'This is the reviewed full text.'})
        self.assertEqual(self.api('/api/knowledge/documents/' + document_id)['text'], 'This is the reviewed full text.')

    def test_assets_and_legacy_api_prefix_are_available(self):
        html, _ = self.get('/documents')
        assets = FormTokens(html).assets
        self.assertGreaterEqual(len(assets), 3)
        for asset in assets:
            parsed = urllib.parse.urlparse(asset)
            self.assertEqual(parsed.netloc, urllib.parse.urlparse(self.base).netloc)
            with self.browser.open(asset, timeout=10) as response:
                self.assertEqual(response.status, 200)
                self.assertNotIn('text/html', response.headers.get('Content-Type', ''))
        self.assertEqual(self.api('/audiobookshelf/status')['product'], 'KnowledgeShelf')
        _, response = self.get('/audiobookshelf/documents')
        self.assertEqual(urllib.parse.urlparse(response.geturl()).path, '/documents')

    def test_audio_upload_playback_and_progress_use_the_real_backend(self):
        page, _ = self.get('/upload')
        audio = io.BytesIO()
        with wave.open(audio, 'wb') as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(8000)
            output.writeframes(bytes(8000 * 2 * 10))
        boundary = 'knowledge-web-integration-boundary'
        fields = {'_token': FormTokens(page).token, 'title': 'Web playback fixture', 'libraryId': self.library['id'], 'libraryFolderId': self.library['folders'][0]['id']}
        body = bytearray()
        for name, value in fields.items():
            body.extend((f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n').encode())
        body.extend((f'--{boundary}\r\nContent-Disposition: form-data; name="files[]"; filename="lecture.wav"\r\nContent-Type: audio/wav\r\n\r\n').encode())
        body.extend(audio.getvalue())
        body.extend((f'\r\n--{boundary}--\r\n').encode())
        request = urllib.request.Request(self.base + '/upload-media', data=body, headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
        with self.browser.open(request, timeout=30) as response:
            self.assertEqual(response.status, 200)
        deadline = time.monotonic() + 30
        item = None
        while time.monotonic() < deadline:
            items = self.api('/api/libraries/' + self.library['id'] + '/items')['results']
            item = next((value for value in items if value['media']['metadata']['title'] == 'Web playback fixture'), None)
            if item:
                break
            time.sleep(.25)
        self.assertIsNotNone(item, 'Uploaded audio was not scanned')
        page, _ = self.get('/item/' + item['id'])
        token = FormTokens(page).token
        def player(path, data):
            request = urllib.request.Request(self.base + path, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': token})
            with self.browser.open(request, timeout=20) as response:
                return json.load(response)
        session = player('/player/start', {'itemId': item['id'], 'mode': 'audio', 'startTime': 2.5})
        self.assertEqual(session['currentTime'], 2.5)
        track = session['audioTracks'][0]
        self.assertIn('/public/session/', track['contentUrl'])
        request = urllib.request.Request(self.base + track['contentUrl'], headers={'Range': 'bytes=0-1023'})
        with self.browser.open(request, timeout=20) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(len(response.read()), 1024)
        player('/player/sync', {'sessionId': session['id'], 'currentTime': 4.25, 'duration': session['duration'], 'timeListened': 1.75})
        progress = self.api('/api/me/progress/' + item['id'])
        self.assertEqual(progress['currentTime'], 4.25)
        player('/player/sync', {'sessionId': session['id'], 'currentTime': 4.25, 'duration': session['duration'], 'timeListened': 0, 'close': True})

    def test_mutations_reject_missing_csrf_tokens(self):
        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.post('/manage/users/delete/not-a-user', {})
        self.assertEqual(raised.exception.code, 419)


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(WebIntegration)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(not result.wasSuccessful())
