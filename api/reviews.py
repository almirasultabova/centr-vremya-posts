import json, os, base64
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from urllib.request import urlopen, Request
from urllib.error import HTTPError
from datetime import datetime

GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '')
REPO = 'almirasultabova/centr-vremya-posts'
BRANCH = 'main'

def gh_get(path):
    url = f'https://api.github.com/repos/{REPO}/contents/{path}?ref={BRANCH}'
    req = Request(url, headers={'Authorization': f'token {GITHUB_TOKEN}', 'Accept': 'application/vnd.github.v3+json'})
    try:
        with urlopen(req) as r:
            return json.loads(r.read())
    except HTTPError:
        return None

def gh_put(path, content_str, sha=None):
    url = f'https://api.github.com/repos/{REPO}/contents/{path}'
    body = {
        'message': f'Update {path}',
        'content': base64.b64encode(content_str.encode()).decode(),
        'branch': BRANCH
    }
    if sha:
        body['sha'] = sha
    req = Request(url, data=json.dumps(body).encode(), headers={
        'Authorization': f'token {GITHUB_TOKEN}',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
    }, method='PUT')
    with urlopen(req) as r:
        return json.loads(r.read())

def load_reviews(month):
    data = gh_get(f'reviews/{month}.json')
    if not data:
        return {}, None
    content = base64.b64decode(data['content']).decode()
    return json.loads(content), data['sha']

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        month = params.get('month', ['june'])[0]
        reviews, _ = load_reviews(month)
        self.send_json(200, reviews)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))
        month = body.get('month', 'june')
        idx = str(body.get('idx'))

        reviews, sha = load_reviews(month)
        if idx not in reviews:
            reviews[idx] = {}
        if 'status' in body:
            reviews[idx]['status'] = body['status']
        if 'comment' in body:
            reviews[idx]['comment'] = body['comment']
        reviews[idx]['updated'] = datetime.now().strftime('%d.%m %H:%M')

        gh_put(f'reviews/{month}.json', json.dumps(reviews, ensure_ascii=False, indent=2), sha)
        self.send_json(200, {'ok': True})
