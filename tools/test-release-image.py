#!/usr/bin/env python3
"""Smoke-test a built image with an isolated, persistent config and metadata volume."""
import json
import argparse
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from knowledge_smoke import documents


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()


def main(image, upgrade_from=None):
    name = 'abs-release-check-' + uuid.uuid4().hex[:12]
    volumes = [name + '-config', name + '-metadata']
    try:
        for volume in volumes:
            docker('volume', 'create', volume)
        def start(selected):
            docker('run', '-d', '--name', name, '-p', '127.0.0.1::80',
                   '-v', volumes[0] + ':/config', '-v', volumes[1] + ':/metadata', selected)

        def address():
            port = json.loads(docker('inspect', name))[0]['NetworkSettings']['Ports']['80/tcp'][0]['HostPort']
            return 'http://127.0.0.1:' + port

        def status():
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                try:
                    with urllib.request.urlopen(base + '/status', timeout=3) as response:
                        value = json.load(response)
                    assert value['app'] == 'audiobookshelf', value
                    return value
                except (urllib.error.URLError, TimeoutError, ConnectionError):
                    time.sleep(1)
            raise RuntimeError('Container did not become ready')

        if upgrade_from:
            start(upgrade_from)
            base = address()
            assert status()['serverVersion'] == '2.36.0'
            docker('stop', name)
            docker('rm', name)
        start(image)
        base = address()
        first = status()
        expected = docker('exec', name, 'node', '-p', 'require("/app/package.json").version')
        assert first['serverVersion'] == expected, first
        assert first['product'] == 'KnowledgeShelf', first
        with urllib.request.urlopen(base + '/healthcheck', timeout=5) as response:
            assert response.status == 200
        with urllib.request.urlopen(base, timeout=5) as response:
            assert 'Audiobookshelf' in response.read().decode()
        for binary in ['ffmpeg', 'ffprobe']:
            docker('exec', name, binary, '-version')
        docker('exec', name, 'pdftotext', '-v')
        assert docker('exec', name, 'yt-dlp', '--ignore-config', '--js-runtimes', 'node', '--no-remote-components', '--version') == '2026.08.19'
        docker('exec', name, 'node', '-e', '''
const sqlite = require('sqlite3');
const db = new sqlite.Database('/config/absdatabase.sqlite', sqlite.OPEN_READONLY);
db.all('PRAGMA table_info(podcastEpisodes)', (error, rows) => {
  if (error || !rows.some(row => row.name === 'videoSource')) process.exit(1);
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('knowledgeSources','knowledgeJobs','knowledgeDocuments','knowledgeAssets')", (error, tables) => {
    if (error || tables.length !== 4) process.exit(1);
    db.close();
  });
});''')
        # Exercise authenticated KnowledgeShelf APIs without contacting paid providers.
        def api(path, body=None, token=None):
            headers = {'Content-Type': 'application/json'}
            if token:
                headers['Authorization'] = 'Bearer ' + token
            request = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
            with urllib.request.urlopen(request, timeout=10) as response:
                value = response.read()
                try:
                    return json.loads(value)
                except ValueError:
                    return value.decode()
        api('/init', {'newRoot': {'username': 'smoke', 'password': 'isolated-smoke-password'}})
        login = api('/login', {'username': 'smoke', 'password': 'isolated-smoke-password'})
        token = login['user'].get('accessToken') or login['user']['token']
        assert api('/api/capabilities', token=token)['knowledgeShelfV1'] is True
        assert api('/api/knowledge/jobs', token=token)['total'] == 0
        assert api('/api/knowledge/documents', token=token)['total'] == 0
        docker('exec', name, 'mkdir', '-p', '/metadata/smoke-library')
        documents(base, token, '/metadata/smoke-library')
        docker('restart', name)
        # Docker can assign a new ephemeral host port when the container restarts.
        base = address()
        assert status()['serverVersion'] == expected
        assert api('/api/knowledge/status', token=token)['product'] == 'KnowledgeShelf'
        print('Container startup, UI, authentication, KnowledgeShelf APIs/schema, media/document binaries and persistent restart passed for ' + expected + (' after 2.36.0 upgrade' if upgrade_from else ''))
    except Exception:
        subprocess.run(['docker', 'logs', '--tail', '80', name], check=False)
        raise
    finally:
        subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, check=False)
        for volume in volumes:
            subprocess.run(['docker', 'volume', 'rm', volume], stdout=subprocess.DEVNULL, check=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image')
    parser.add_argument('--upgrade-from')
    args = parser.parse_args()
    main(args.image, args.upgrade_from)
