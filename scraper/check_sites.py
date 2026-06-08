#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
sys.stdout.reconfigure(encoding='utf-8')

import requests

sites = [
    ('TruyenFull', 'https://truyenfull.vision'),
    ('MeTruyenChu', 'https://metruyenchuvn.com'),
    ('TruyenDich', 'https://truyendich.ai')
]

print('Checking site accessibility:\n')
for name, url in sites:
    try:
        r = requests.get(url, timeout=10, allow_redirects=True)
        print(f'{name}: {r.status_code} OK')
    except Exception as e:
        print(f'{name}: FAILED - {str(e)[:50]}')
