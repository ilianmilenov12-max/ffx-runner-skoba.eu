#!/usr/bin/env python3
"""Приема записите от tools/recorder.js и ги пише в tools/sessions/<id>.jsonl.

Всеки ред е една част: нови проби, нови събития и обобщение до момента.
Слуша само на 127.0.0.1 — играта е на localhost, а отвън никой не бива да пише.

    python3 tools/rec_server.py          # порт 8799
"""
import http.server
import pathlib
import re

OUT = pathlib.Path(__file__).resolve().parent / 'sessions'
PORT = 8799


class Handler(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        # /shot?name=... — PNG кадър от играта, за сверяване с видеото.
        shot = re.search(r'^/shot\?name=([\w-]+)', self.path)
        if shot:
            length = int(self.headers.get('Content-Length') or 0)
            folder = OUT.parent / 'shots'
            folder.mkdir(exist_ok=True)
            (folder / f'{shot.group(1)}.png').write_bytes(self.rfile.read(length))
            self.send_response(204)
            self._cors()
            self.end_headers()
            return
        m = re.search(r'id=([\w-]+)', self.path)
        length = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(length) if length else b''
        if m and body:
            OUT.mkdir(exist_ok=True)
            with open(OUT / f'{m.group(1)}.jsonl', 'ab') as f:
                f.write(body.rstrip(b'\n') + b'\n')
        self.send_response(204)
        self._cors()
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    print(f'записи → {OUT}  (http://127.0.0.1:{PORT}/rec)', flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
