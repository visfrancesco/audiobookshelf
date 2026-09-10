#!/usr/bin/env python3
"""Exercise KnowledgeShelf in an isolated, freshly initialized test server."""
import argparse
import json
import time
import urllib.request
import uuid


def request(base, path, body=None, token=None, content_type='application/json'):
    headers = {'Content-Type': content_type}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    data = body if isinstance(body, bytes) else json.dumps(body).encode() if body is not None else None
    with urllib.request.urlopen(urllib.request.Request(base + path, data=data, headers=headers), timeout=15) as response:
        result = response.read()
        try:
            return json.loads(result)
        except ValueError:
            return result.decode()


def documents(base, token, library_path):
    library = request(base, '/api/libraries', {'name': 'KnowledgeShelf smoke', 'mediaType': 'book', 'folders': [{'fullPath': library_path}]}, token)
    boundary = 'KnowledgeShelf' + uuid.uuid4().hex
    fields = {'title': 'Extracted document', 'libraryId': library['id'], 'libraryFolderId': library['folders'][0]['id']}
    body = ''.join(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n' for key, value in fields.items())
    html = '<article><h1>A document</h1><p>' + 'Every word stays in the narration. ' * 30 + '</p></article><script>privateScript()</script>'
    body += f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="article.html"\r\nContent-Type: text/html\r\n\r\n{html}\r\n--{boundary}--\r\n'
    document = request(base, '/api/knowledge/documents', body.encode(), token, 'multipart/form-data; boundary=' + boundary)
    deadline = time.monotonic() + 30
    while document['state'] == 'extracting' and time.monotonic() < deadline:
        time.sleep(0.3)
        document = request(base, '/api/knowledge/documents/' + document['id'], token=token)
    assert document['state'] == 'ready', document
    assert 'Every word stays in the narration.' in document['text'], document
    assert 'privateScript' not in document['text'], document
    assert 'originalPath' not in document, document
    assert document['contentHash'], document
    jobs = request(base, '/api/knowledge/jobs', token=token)
    assert jobs['total'] == 1, jobs
    assert jobs['jobs'][0]['state'] == 'completed', jobs
    print('Authenticated upload, durable extraction job, packaged HTML extraction and text preview passed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('base')
    parser.add_argument('--library-path', required=True)
    args = parser.parse_args()
    credentials = {'username': 'knowledge-smoke', 'password': uuid.uuid4().hex}
    request(args.base, '/init', {'newRoot': credentials})
    login = request(args.base, '/login', credentials)
    documents(args.base, login['user']['accessToken'], args.library_path)
