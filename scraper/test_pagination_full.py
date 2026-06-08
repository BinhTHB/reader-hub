"""Test pagination for both TruyenFull and MeTruyenChu"""
import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async
from parsers import TruyenFullParser, MeTruyenChuParser

async def test_truyenfull_pagination():
    print("\n" + "="*60)
    print("TEST: TruyenFull Pagination")
    print("="*60)
    
    parser = TruyenFullParser()
    url = "https://truyenfull.vision/toan-chuc-phap-su/"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        await stealth_async(page)
        
        # Page 1
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        html = await page.content()
        
        chapters_p1 = parser.parse_chapter_list(html)
        max_pages = parser.parse_max_pages(html)
        
        print(f"Page 1: {len(chapters_p1)} chapters")
        print(f"Max pages: {max_pages}")
        
        # Page 2
        if max_pages >= 2:
            url_p2 = parser.get_chapter_list_url(url, page=2)
            print(f"\nPage 2 URL: {url_p2}")
            await page.goto(url_p2, wait_until="domcontentloaded", timeout=30000)
            html_p2 = await page.content()
            chapters_p2 = parser.parse_chapter_list(html_p2)
            print(f"Page 2: {len(chapters_p2)} chapters")
            
            if chapters_p1 and chapters_p2:
                print(f"First chapter p1: {chapters_p1[0]['chapter_number']}")
                print(f"First chapter p2: {chapters_p2[0]['chapter_number']}")
        
        await browser.close()

async def test_metruyenchu_pagination():
    print("\n" + "="*60)
    print("TEST: MeTruyenChu Pagination")
    print("="*60)
    
    parser = MeTruyenChuParser()
    url = "https://metruyenchuvn.com/toan-chuc-phap-su-truyen-full"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        await stealth_async(page)
        
        # Page 1
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        html = await page.content()
        
        chapters_p1 = parser.parse_chapter_list(html)
        max_pages = parser.parse_max_pages(html)
        story_id = parser.extract_story_id(html)
        
        print(f"Page 1: {len(chapters_p1)} chapters")
        print(f"Max pages: {max_pages}")
        print(f"Story ID: {story_id}")
        
        # Page 2 via JavaScript
        if max_pages >= 2 and story_id:
            print(f"\nLoading page 2 via JavaScript...")
            await page.evaluate(f"page({story_id}, 2)")
            await page.wait_for_timeout(1000)
            html_p2 = await page.content()
            chapters_p2 = parser.parse_chapter_list(html_p2)
            print(f"After page 2: {len(chapters_p2)} chapters")
            
            # Page 3
            await page.evaluate(f"page({story_id}, 3)")
            await page.wait_for_timeout(1000)
            html_p3 = await page.content()
            chapters_p3 = parser.parse_chapter_list(html_p3)
            print(f"After page 3: {len(chapters_p3)} chapters")
            
            if chapters_p1 and chapters_p3:
                print(f"\nFirst chapter p1: {chapters_p1[0]['chapter_number']}")
                print(f"Last chapter p1: {chapters_p1[-1]['chapter_number']}")
                print(f"First chapter p3: {chapters_p3[0]['chapter_number']}")
                print(f"Last chapter p3: {chapters_p3[-1]['chapter_number']}")
        
        await browser.close()

async def main():
    await test_truyenfull_pagination()
    await test_metruyenchu_pagination()
    print("\n" + "="*60)
    print("✅ PAGINATION TESTS COMPLETE")
    print("="*60)

if __name__ == "__main__":
    asyncio.run(main())
