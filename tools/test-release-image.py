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
        with urllib.request.urlopen(base + '/healthcheck', timeout=5) as response:
            assert response.status == 200
        with urllib.request.urlopen(base, timeout=5) as response:
            assert 'Audiobookshelf' in response.read().decode()
        for binary in ['ffmpeg', 'ffprobe']:
            docker('exec', name, binary, '-version')
        docker('exec', name, 'node', '-e', '''
const sqlite = require('sqlite3');
const db = new sqlite.Database('/config/absdatabase.sqlite', sqlite.OPEN_READONLY);
db.all('PRAGMA table_info(podcastEpisodes)', (error, rows) => {
  if (error || !rows.some(row => row.name === 'videoSource')) process.exit(1);
  db.close();
});''')
        docker('restart', name)
        # Docker can assign a new ephemeral host port when the container restarts.
        base = address()
        assert status()['serverVersion'] == expected
        print('Container startup, UI, healthcheck, media binaries, video schema and persistent restart passed for ' + expected + (' after 2.36.0 upgrade' if upgrade_from else ''))
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
