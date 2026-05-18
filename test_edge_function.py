#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
sys.stdout.reconfigure(encoding='utf-8')

import requests
import json

url = "https://gvxzdhufnqhicsgawlyz.supabase.co/functions/v1/search-sources"
headers = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2eHpkaHVmbnFoaWNzZ2F3bHl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MDcyNjgsImV4cCI6MjA5NDI4MzI2OH0.ir1he2rM0xAnR09qigfz8hGe7DzUrtrzerlmR3qm2z8",
    "Content-Type": "application/json"
}
data = {"query": "dau la"}

print("Testing Edge Function search-sources...")
print(f"URL: {url}\n")

try:
    response = requests.post(url, headers=headers, json=data, timeout=10)
    print(f"Status: {response.status_code}\n")
    
    result = response.json()
    print(f"Total results: {result.get('total_results', 0)}")
    print(f"Sources: {len(result.get('sources', []))}\n")
    
    for source in result.get('sources', []):
        print(f"📚 {source['source_display']}: {len(source.get('results', []))} results")
        if source.get('error'):
            print(f"   Error: {source['error']}")
        else:
            for i, r in enumerate(source.get('results', [])[:3], 1):
                print(f"   {i}. {r['title'][:60]}")
    
    print("\n✅ Edge Function is working!")
    
except Exception as e:
    print(f"❌ Error: {e}")
