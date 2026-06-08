"""Check if all chapters are in initial HTML"""
from playwright.sync_api import sync_playwright
from playwright_stealth import stealth_sync
import re

url = "https://metruyenchuvn.com/toan-chuc-phap-su-truyen-full"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    stealth_sync(page)
    
    page.goto(url, wait_until="networkidle", timeout=30000)
    
    # Get all HTML
    html = page.content()
    
    # Count how many "Chương" appear in HTML
    chapter_matches = re.findall(r'Chương\s+(\d+)', html)
    unique_chapters = set(int(m) for m in chapter_matches)
    
    print(f"Total 'Chương' mentions in HTML: {len(chapter_matches)}")
    print(f"Unique chapter numbers: {len(unique_chapters)}")
    print(f"Range: {min(unique_chapters)} - {max(unique_chapters)}")
    
    # Check visible chapters
    visible_links = page.query_selector_all("#chapter-list a, .list-chapter a")
    print(f"\nVisible chapter links: {len(visible_links)}")
    
    # Try clicking through all pages
    print("\nTrying to load all pages...")
    for page_num in range(2, 6):  # Test pages 2-5
        try:
            page.evaluate(f"page(112629, {page_num})")
            page.wait_for_timeout(500)
        except:
            break
    
    visible_links_after = page.query_selector_all("#chapter-list a, .list-chapter a")
    print(f"Visible chapter links after loading pages 2-5: {len(visible_links_after)}")
    
    browser.close()
