#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
sys.stdout.reconfigure(encoding='utf-8')

from parsers import get_all_parsers

parsers = get_all_parsers()
print(f'Total parsers: {len(parsers)}')
for p in parsers:
    display = p.config.display_name if p.config else 'No config'
    print(f'  - {p.name}: {display}')
