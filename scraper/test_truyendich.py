#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
sys.stdout.reconfigure(encoding='utf-8')

import requests
from parsers import detect_parser

parser = detect_parser('https://truyendich.ai/tim-kiem?q=dau+la')
search_url = parser.get_search_url('dau la')
print('Search URL:', search_url)

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
r = requests.get(search_url, headers=headers, timeout=10)
results = parser.parse_search_results(r.text)

print(f'Found {len(results)} results')
print('\nFirst 5 results:')
for i, r in enumerate(results[:5], 1):
    print(f'{i}. {r["title"][:60]}')
    print(f'   URL: {r["source_url"][:70]}')
