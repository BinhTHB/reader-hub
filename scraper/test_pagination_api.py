"""Test MeTruyenChu pagination API"""
from playwright.sync_api import sync_playwright
from playwright_stealth import stealth_sync
import time

url = "https://metruyenchuvn.com/toan-chuc-phap-su-truyen-full"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    stealth_sync(page)
    
    # Capture network requests
    api_calls = []
    def handle_response(response):
        if 'chapter' in response.url or 'chuong' in response.url or 'page' in response.url:
            api_calls.append({
                'url': response.url,
                'status': response.status,
                'method': response.request.method
            })
    
    page.on('response', handle_response)
    
    page.goto(url, wait_until="networkidle", timeout=30000)
    
    print("Initial page loaded")
    print(f"Captured {len(api_calls)} API calls")
    
    # Try to trigger page 2 by executing the onclick function
    print("\nTrying to load page 2...")
    page.evaluate("page(112629, 2)")
    time.sleep(3)
    
    print(f"\nTotal API calls captured: {len(api_calls)}")
    for call in api_calls:
        print(f"  {call['method']} {call['url']} -> {call['status']}")
    
    # Check if new chapters loaded
    chapter_links = page.query_selector_all("#chapter-list a, .list-chapter a")
    print(f"\nChapter links after page 2: {len(chapter_links)}")
    
    browser.close()
