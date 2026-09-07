#!/usr/bin/env python3
"""Backfill a verified completed file, or explicitly restore an excluded import."""
import argparse
import json
import os
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('manifest', help='Path to a completion manifest JSON file')
parser.add_argument('--restore', action='store_true', help='Restore an episode previously excluded in ABS')
args = parser.parse_args()
with open(args.manifest) as file:
    manifest = json.load(file)
request = urllib.request.Request(os.environ['ABS_SERVER_URL'].rstrip('/') + '/api/video-imports',
    data=json.dumps({'manifest': manifest, 'restore': args.restore}).encode(), method='POST',
    headers={'Authorization': 'Bearer ' + os.environ['ABS_API_TOKEN'], 'Content-Type': 'application/json'})
with urllib.request.urlopen(request, timeout=30) as response:
    result = json.load(response)
    print(f"Import {result['id']}: {result['state']}")
