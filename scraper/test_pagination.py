"""Test pagination structure for MeTruyenChu"""
from playwright.sync_api import sync_playwright
from playwright_stealth import stealth_sync

url = "https://metruyenchuvn.com/toan-chuc-phap-su-truyen-full"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    stealth_sync(page)
    
    page.goto(url, wait_until="networkidle", timeout=30000)
    
    # Check total chapters on page
    chapter_links = page.query_selector_all("#chapter-list a, .list-chapter a, ul.list-chapters a, .chapters a")
    print(f"Total chapter links on page 1: {len(chapter_links)}")
    
    if chapter_links:
        first_ch = chapter_links[0].inner_text()
        last_ch = chapter_links[-1].inner_text()
        print(f"First: {first_ch}")
        print(f"Last: {last_ch}")
    
    # Check pagination structure
    pagination = page.query_selector(".pagination, .paging")
    if pagination:
        print("\nPagination found!")
        print(pagination.inner_html()[:500])
    else:
        print("\nNo pagination found - might be single page or infinite scroll")
    
    browser.close()
