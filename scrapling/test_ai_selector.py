"""Unit tests for AI Auto-Selector and DynamicConfigParser (no network/API key required)."""

import unittest

from ai_selector import discover_site_selectors, skeletonize_html, validate_selectors
from dynamic_parser import DynamicConfigParser


SAMPLE_STORY_URL = "https://example-novel.vn/truyen/pham-nhan-tu-tien"

def _make_story_html(num_chapters: int = 100) -> str:
    items = "\n".join(
        f'<li><a href="/truyen/pham-nhan-tu-tien/chuong-{i}">Chương {i}: Khởi đầu {i}</a></li>'
        for i in range(1, num_chapters + 1)
    )
    return f"""
    <html>
      <head>
        <title>Phàm Nhân Tu Tiên - Example Novel</title>
        <meta property="og:title" content="Phàm Nhân Tu Tiên" />
        <script>console.log("tracking noise");</script>
        <style>.ads {{ display: block; }}</style>
      </head>
      <body>
        <div class="story-header">
          <h1 class="book-title">Phàm Nhân Tu Tiên</h1>
          <span class="book-author">Vong Ngữ</span>
          <span class="book-status">Hoàn thành</span>
          <img class="book-cover" src="/covers/pntt.jpg" />
          <div class="genres"><a href="/the-loai/tien-hiep">Tiên Hiệp</a><a href="/the-loai/huyen-huyen">Huyền Huyễn</a></div>
          <div class="book-desc">Một thiếu niên bình thường bước vào con đường tu tiên đầy gian nan và thử thách.</div>
        </div>
        <ul class="chapter-list">{items}</ul>
        <div class="pagination"><a href="?page=1">1</a><a href="?page=2">2</a><a href="?page=12">12</a></div>
      </body>
    </html>
    """


LONG_PARAGRAPHS = [
    "Hàn Lập nhìn chằm chằm vào bình nhỏ màu xanh lục trong tay, trong lòng dâng lên một cảm giác khó tả khi nhớ lại những năm tháng ở Thất Huyền Môn.",
    "Lúc này trời đã về khuya, ánh trăng nhàn nhạt rọi qua khe cửa sổ chiếu xuống mặt bàn gỗ cũ kỹ, khiến căn phòng nhỏ trở nên tĩnh mịch lạ thường.",
    "Hắn khẽ thở dài, thu hồi tâm thần rồi mở nắp bình nhỏ ra, một luồng linh khí thanh mát lập tức lan tỏa khắp căn phòng khiến tinh thần hắn chấn động.",
    "Trải qua bao nhiêu biến cố sinh tử, hắn càng hiểu rõ đạo lý tu tiên vốn nghịch thiên mà đi, chỉ cần sơ sẩy một bước liền rơi vào vạn kiếp bất phục.",
]

SAMPLE_CHAPTER_HTML = f"""
<html>
  <body>
    <h1 class="chap-heading">Chương 1: Khởi đầu 1</h1>
    <div class="bad-ads">adsbygoogle.push({{}});</div>
    <div id="chapter-body">
      <div class="ads-inline">Quảng cáo giữa chương</div>
      {''.join(f'<p>{p}</p>' for p in LONG_PARAGRAPHS)}
    </div>
  </body>
</html>
"""

VALID_SELECTORS = {
    "story_title": "h1.book-title",
    "story_author": "span.book-author",
    "story_description": "div.book-desc",
    "story_cover": "img.book-cover",
    "story_genres": "div.genres a",
    "story_status": "span.book-status",
    "chapter_list": "ul.chapter-list li a",
    "pagination_links": "div.pagination a",
    "page_url_pattern": "{story_url}?page={page}",
    "chapter_title": "h1.chap-heading",
    "chapter_content": "#chapter-body",
    "remove_selectors": [".ads-inline"],
}


class AiSelectorTests(unittest.TestCase):
    def test_skeletonize_removes_noise_and_collapses_lists(self):
        html = _make_story_html(100)
        skeleton = skeletonize_html(html)
        self.assertNotIn("tracking noise", skeleton)
        self.assertNotIn("<style>", skeleton)
        self.assertIn("more <li> items omitted", skeleton)
        self.assertLess(len(skeleton), len(html))

    def test_dynamic_parser_extracts_story_chapters_and_content(self):
        parser = DynamicConfigParser(
            domain="example-novel.vn",
            base_url="https://example-novel.vn",
            selectors=VALID_SELECTORS,
        )
        info = parser.parse_story_info(_make_story_html(10), SAMPLE_STORY_URL)
        self.assertEqual(info["title"], "Phàm Nhân Tu Tiên")
        self.assertEqual(info["slug"], "pham-nhan-tu-tien")
        self.assertEqual(info["author"], "Vong Ngữ")
        self.assertEqual(info["status"], "completed")
        self.assertEqual(info["genres"], ["Tiên Hiệp", "Huyền Huyễn"])
        self.assertEqual(info["cover_img_url"], "https://example-novel.vn/covers/pntt.jpg")

        chapters = parser.parse_chapter_list(_make_story_html(5))
        self.assertEqual(len(chapters), 5)
        self.assertEqual(chapters[0]["chapter_number"], 1)
        self.assertEqual(chapters[0]["source_url"], "https://example-novel.vn/truyen/pham-nhan-tu-tien/chuong-1")
        self.assertEqual(parser.parse_max_pages(_make_story_html(5)), 12)
        self.assertEqual(parser.get_chapter_list_url(SAMPLE_STORY_URL, 3), f"{SAMPLE_STORY_URL}?page=3")

        ch = parser.parse_chapter_content(SAMPLE_CHAPTER_HTML)
        self.assertEqual(ch["title"], "Chương 1: Khởi đầu 1")
        self.assertEqual(len(ch["paragraphs"]), 4)
        self.assertGreaterEqual(ch["word_count"], 120)
        self.assertNotIn("Quảng cáo giữa chương", "\n".join(ch["paragraphs"]))

    def test_validate_selectors_rejects_bad_and_noisy_configs(self):
        story_html = _make_story_html(5)
        ok, _, _ = validate_selectors(story_html, SAMPLE_CHAPTER_HTML, SAMPLE_STORY_URL, VALID_SELECTORS)
        self.assertTrue(ok)

        # Wrong chapter_content selector
        bad_sel = {**VALID_SELECTORS, "chapter_content": ".nonexistent"}
        ok_bad, errs, _ = validate_selectors(story_html, SAMPLE_CHAPTER_HTML, SAMPLE_STORY_URL, bad_sel)
        self.assertFalse(ok_bad)
        self.assertTrue(any("chapter_content" in e for e in errs))

        # Noisy adsbygoogle inside a <p> inside chapter content
        noisy_html = SAMPLE_CHAPTER_HTML.replace(
            '<div class="ads-inline">Quảng cáo giữa chương</div>',
            '<p class="ads-inline">adsbygoogle.push({});</p>',
        )
        noisy_sel = {**VALID_SELECTORS, "remove_selectors": []}
        ok_noisy, errs_noisy, _ = validate_selectors(story_html, noisy_html, SAMPLE_STORY_URL, noisy_sel)
        self.assertFalse(ok_noisy)
        self.assertTrue(any("adsbygoogle" in e for e in errs_noisy))

    def test_discover_site_selectors_self_healing_loop(self):
        prompts_seen: list[str] = []

        def fake_llm(prompt: str) -> dict:
            prompts_seen.append(prompt)
            if len(prompts_seen) == 1:
                # Attempt 1 intentionally returns wrong chapter_content selector
                return {**VALID_SELECTORS, "chapter_content": ".wrong-selector"}
            # Attempt 2 should receive the validation error and fix it
            return VALID_SELECTORS

        selectors, preview = discover_site_selectors(
            story_url=SAMPLE_STORY_URL,
            story_html=_make_story_html(5),
            fetch_fn=lambda url: (
                _make_story_html(5).replace("chuong-", "chuong-p2-")
                if "page=2" in url
                else SAMPLE_CHAPTER_HTML
            ),
            max_retries=2,
            llm_fn=fake_llm,
        )

        self.assertEqual(len(prompts_seen), 2)
        self.assertIn("PREVIOUS ATTEMPT FAILED VALIDATION", prompts_seen[1])
        self.assertEqual(selectors["chapter_content"], "#chapter-body")
        self.assertEqual(preview["title"], "Phàm Nhân Tu Tiên")
        self.assertEqual(preview["chapter_paragraphs"], 4)

    def test_hybrid_session_fast_http_and_lazy_browser_upgrade(self):
        from hybrid_session import HybridSession, SimpleResponse

        browser_launched = []

        class FakeBrowser:
            def __init__(self, **_kwargs):
                browser_launched.append(True)

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                pass

            def rotate_proxy(self, _p):
                pass

            def fetch(self, url):
                return SimpleResponse(url=url, body="<html><body>Browser OK " + ("x" * 500) + "</body></html>", status=200)

        with HybridSession(FakeBrowser, prefer_http=True) as hs:
            hs._http_get = lambda url: SimpleResponse(
                url=url, body="<html><body>Fast HTTP " + ("y" * 500) + "</body></html>", status=200
            )
            r1 = hs.fetch("https://example.com/1")
            self.assertEqual(r1.status, 200)
            self.assertEqual(hs.mode, "http")
            self.assertEqual(len(browser_launched), 0)

            # Now simulate Cloudflare 403 block -> should auto-upgrade to browser
            hs._http_get = lambda url: SimpleResponse(url=url, body="Just a moment...", status=403)
            r2 = hs.fetch("https://example.com/2")
            self.assertEqual(r2.status, 200)
            self.assertEqual(hs.mode, "browser")
            self.assertEqual(len(browser_launched), 1)

    def test_upsert_chapters_batch_uses_single_rest_call(self):
        import supabase_client

        calls = []
        orig_rest = supabase_client._rest
        try:
            def fake_rest(method, table, params="", body=None):
                calls.append((method, table, params, body))
                return body

            supabase_client._rest = fake_rest
            res = supabase_client.upsert_chapters_batch([
                {"story_id": 1, "chapter_number": 1, "title": "C1", "is_scraped": True},
                {"story_id": 1, "chapter_number": 2, "title": "C2", "is_scraped": True},
            ])
            self.assertEqual(len(res), 2)
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][0], "POST")
            self.assertEqual(calls[0][1], "chapters")
            self.assertIn("scraped_at", calls[0][3][0])
        finally:
            supabase_client._rest = orig_rest

    def test_comma_separated_chapter_numbers_and_author_prefix(self):
        html = """
        <html>
          <head><title>Trận Vấn Trường Sinh - lore</title></head>
          <body>
            <header class="site-header"><h1 class="site-title">lore Đọc truyện online</h1></header>
            <div class="novel-detail-main">
              <h1>Trận Vấn Trường Sinh</h1>
              <span class="author">Tác giả: Quan Hư</span>
            </div>
            <ul class="chapters">
              <li><a href="/read/1">Chương 1 Họa mực</a></li>
              <li><a href="/read/2">Chương 2 Bia mộ</a></li>
              <li><a href="/read/1000">Chương 1,000 Tông Môn Đạo Binh</a></li>
              <li><a href="/read/1001">Chương 1,001 Kiếm chỉ tứ tông</a></li>
            </ul>
          </body>
        </html>
        """
        parser = DynamicConfigParser(
            domain="lore5.com",
            base_url="https://www.lore5.com",
            selectors={
                "story_title": "",
                "story_author": "span.author",
                "chapter_list": "ul.chapters li a",
            },
        )
        info = parser.parse_story_info(html, "https://www.lore5.com/book/lb00000197")
        self.assertEqual(info["title"], "Trận Vấn Trường Sinh")
        self.assertEqual(info["author"], "Quan Hư")

        chapters = parser.parse_chapter_list(html)
        self.assertEqual([c["chapter_number"] for c in chapters], [1, 2, 1000, 1001])

    def test_validate_selectors_rejects_site_branding_header_and_self_heals(self):
        html = """
        <html>
          <head><title>Trận Vấn Trường Sinh - lore</title></head>
          <body>
            <header class="site-header"><h1 class="site-title">lore Đọc truyện online</h1></header>
            <div class="novel-detail-main">
              <h1>Trận Vấn Trường Sinh</h1>
              <span class="author">Tác giả: Quan Hư</span>
            </div>
            <ul class="chapters">
              <li><a href="/read/1">Chương 1 Họa mực</a></li>
              <li><a href="/read/2">Chương 2 Bia mộ</a></li>
              <li><a href="/read/3">Chương 3 Nhà chiến lược</a></li>
            </ul>
          </body>
        </html>
        """
        prompts_seen: list[str] = []

        def fake_llm(prompt: str) -> dict:
            prompts_seen.append(prompt)
            if len(prompts_seen) == 1:
                return {
                    **VALID_SELECTORS,
                    "story_title": "h1.site-title",
                    "story_author": "span.author",
                    "chapter_list": "ul.chapters li a",
                }
            return {
                **VALID_SELECTORS,
                "story_title": ".novel-detail-main h1",
                "story_author": "span.author",
                "chapter_list": "ul.chapters li a",
            }

        selectors, preview = discover_site_selectors(
            story_url="https://www.lore5.com/book/lb00000197",
            story_html=html,
            fetch_fn=lambda _url: SAMPLE_CHAPTER_HTML,
            max_retries=2,
            llm_fn=fake_llm,
        )
        self.assertEqual(len(prompts_seen), 2)
        self.assertIn("site header/branding", prompts_seen[1])
        self.assertEqual(selectors["story_title"], ".novel-detail-main h1")
        self.assertEqual(preview["title"], "Trận Vấn Trường Sinh")

    def test_upsert_chapters_batch_deduplicates_same_chapter_number(self):
        import supabase_client

        calls = []
        orig_rest = supabase_client._rest
        try:
            def fake_rest(method, table, params="", body=None):
                calls.append((method, table, params, body))
                return body

            supabase_client._rest = fake_rest
            res = supabase_client.upsert_chapters_batch([
                {"story_id": 1, "chapter_number": 1, "title": "Old", "is_scraped": True},
                {"story_id": 1, "chapter_number": 1, "title": "New", "is_scraped": True},
                {"story_id": 1, "chapter_number": 2, "title": "C2", "is_scraped": True},
            ])
            self.assertEqual(len(res), 2)
            self.assertEqual([r["title"] for r in calls[0][3]], ["New", "C2"])
        finally:
            supabase_client._rest = orig_rest

    def test_rest_does_not_retry_deterministic_pg_21000(self):
        import os
        import supabase_client

        class FakeResp:
            status_code = 500
            text = '{"code":"21000","message":"ON CONFLICT DO UPDATE command cannot affect row a second time"}'

        class FakeClient:
            def __init__(self):
                self.calls = 0

            def request(self, *_args, **_kwargs):
                self.calls += 1
                return FakeResp()

        fake_client = FakeClient()
        orig_get_client = supabase_client._get_client
        orig_url = os.environ.get("SUPABASE_URL")
        orig_key = os.environ.get("SUPABASE_SERVICE_KEY")
        try:
            os.environ["SUPABASE_URL"] = "https://example.supabase.co"
            os.environ["SUPABASE_SERVICE_KEY"] = "test-key"
            supabase_client._get_client = lambda: fake_client
            with self.assertRaises(RuntimeError):
                supabase_client._rest("POST", "chapters", params="?on_conflict=story_id,chapter_number", body=[])
            self.assertEqual(fake_client.calls, 1)
        finally:
            supabase_client._get_client = orig_get_client
            if orig_url is None:
                os.environ.pop("SUPABASE_URL", None)
            else:
                os.environ["SUPABASE_URL"] = orig_url
            if orig_key is None:
                os.environ.pop("SUPABASE_SERVICE_KEY", None)
            else:
                os.environ["SUPABASE_SERVICE_KEY"] = orig_key

    def test_build_source_slug_and_resolve_story_slug_isolation(self):
        import supabase_client

        self.assertEqual(
            supabase_client.build_source_slug("tran-van-truong-sinh", "lore5.com"),
            "tran-van-truong-sinh-lore5-com",
        )
        self.assertEqual(
            supabase_client.build_source_slug("tran-van-truong-sinh-lore5-com", "lore5.com"),
            "tran-van-truong-sinh-lore5-com",
        )

        orig_get_by_url = supabase_client.get_story_by_source_url
        orig_get_by_slug = supabase_client.get_story_by_slug
        try:
            # a) Existing story with same source_url -> reuses existing plain slug
            supabase_client.get_story_by_source_url = lambda _u: {"slug": "tran-van-truong-sinh"}
            supabase_client.get_story_by_slug = lambda _s: None
            self.assertEqual(
                supabase_client.resolve_story_slug(
                    "tran-van-truong-sinh", "lore5.com", "https://www.lore5.com/book/lb00000197"
                ),
                "tran-van-truong-sinh",
            )

            # b) Existing plain slug belongs to DIFFERENT source_name -> returns source-scoped slug
            supabase_client.get_story_by_source_url = lambda _u: None
            supabase_client.get_story_by_slug = lambda s: (
                {"slug": "tran-van-truong-sinh", "source_name": "truyendich", "source_url": "https://truyendich.net/a"}
                if s == "tran-van-truong-sinh"
                else None
            )
            self.assertEqual(
                supabase_client.resolve_story_slug(
                    "tran-van-truong-sinh", "lore5.com", "https://www.lore5.com/book/lb00000197"
                ),
                "tran-van-truong-sinh-lore5-com",
            )

            # c) Brand new story -> returns source-scoped slug
            supabase_client.get_story_by_slug = lambda _s: None
            self.assertEqual(
                supabase_client.resolve_story_slug(
                    "tran-van-truong-sinh", "lore5.com", "https://www.lore5.com/book/lb00000197"
                ),
                "tran-van-truong-sinh-lore5-com",
            )

            # d) Legacy plain slug with same source_name and empty source_url -> reuses plain slug
            supabase_client.get_story_by_slug = lambda s: (
                {"slug": "tran-van-truong-sinh", "source_name": "lore5.com", "source_url": None}
                if s == "tran-van-truong-sinh"
                else None
            )
            self.assertEqual(
                supabase_client.resolve_story_slug(
                    "tran-van-truong-sinh", "lore5.com", "https://www.lore5.com/book/lb00000197"
                ),
                "tran-van-truong-sinh",
            )
        finally:
            supabase_client.get_story_by_source_url = orig_get_by_url
            supabase_client.get_story_by_slug = orig_get_by_slug

    def test_dot_thousands_decimal_and_volume_reset_normalization(self):
        html_nums = """
        <html><body>
          <ul class="chapters">
            <li><a href="/read/1">Chương 1.5 Ngoại truyện</a></li>
            <li><a href="/read/1000">Chương 1.000 Đại chiến</a></li>
            <li><a href="/read/1617">Chương 1.617 Kết cục</a></li>
            <li><a href="/read/1618">Chương 1,617 Bổ sung</a></li>
          </ul>
        </body></html>
        """
        parser = DynamicConfigParser(
            domain="example.com",
            base_url="https://example.com",
            selectors={"chapter_list": "ul.chapters li a"},
        )
        parsed = parser.parse_chapter_list(html_nums)
        self.assertEqual([c["chapter_number"] for c in parsed], [1, 1000, 1617, 1617])

        html_vol = """
        <html><body>
          <ul class="chapters">
            <li><a href="/v1/1">Chương 1 Mở đầu</a></li>
            <li><a href="/v1/2">Chương 2 Tiếp nối</a></li>
            <li><a href="/v2/1">Chương 1 Quyển 2</a></li>
            <li><a href="/v2/2">Chương 2 Quyển 2</a></li>
            <li><a href="/v3/1">Chương 1 Quyển 3</a></li>
          </ul>
        </body></html>
        """
        vol_parsed = parser.parse_chapter_list(html_vol)
        self.assertEqual([c["chapter_number"] for c in vol_parsed], [1, 2, 3, 4, 5])
        self.assertEqual([c["source_chapter_number"] for c in vol_parsed], [1, 2, 1, 2, 1])

    def test_skeletonize_preserves_pagination_nav_and_rejects_missing_pagination(self):
        html_with_nav = """
        <html>
          <head><title>Truyện Test - KhoTruyenChu</title></head>
          <body>
            <nav class="main-menu"><a href="/home">Trang chủ</a><a href="/hot">Hot</a></nav>
            <div class="novel">
              <h1 class="truyen-title">Truyện Test</h1>
              <span class="author">Tác giả A</span>
            </div>
            <ul class="chapter-list">
              <li><a href="/c-1">Chương 1</a></li>
              <li><a href="/c-2">Chương 2</a></li>
              <li><a href="/c-3">Chương 3</a></li>
            </ul>
            <nav aria-label="Phân trang" class="ct-pagination" data-max="33">
              <a class="page-numbers" href="/truyen/test/page/2/">2</a>
              <a class="next page-numbers" href="/truyen/test/page/2/">Sau</a>
            </nav>
          </body>
        </html>
        """
        skel = skeletonize_html(html_with_nav)
        self.assertNotIn("main-menu", skel)
        self.assertIn("ct-pagination", skel)
        self.assertIn('data-max="33"', skel)

        no_pag_sel = {
            **VALID_SELECTORS,
            "story_title": "h1.truyen-title",
            "story_author": "span.author",
            "chapter_list": "ul.chapter-list li a",
            "pagination_links": "",
            "page_url_pattern": "",
            "next_page_selector": "",
        }
        ok, errs, _ = validate_selectors(html_with_nav, SAMPLE_CHAPTER_HTML, "https://khotruyenchu.fun/truyen/test", no_pag_sel)
        self.assertFalse(ok)
        self.assertTrue(any("pagination" in e.lower() for e in errs))

        parser = DynamicConfigParser(
            domain="khotruyenchu.fun",
            base_url="https://khotruyenchu.fun",
            selectors={
                **no_pag_sel,
                "pagination_links": "nav.ct-pagination a.page-numbers",
                "page_url_pattern": "{story_url}/page/{page}/",
                "next_page_selector": "nav.ct-pagination a.next",
            },
        )
        self.assertEqual(parser.parse_max_pages(html_with_nav), 33)
        self.assertEqual(
            parser.parse_next_page_url(html_with_nav, "https://khotruyenchu.fun/truyen/test"),
            "https://khotruyenchu.fun/truyen/test/page/2/",
        )

    def test_discover_live_page2_probe_and_ai_auditor_self_healing(self):
        story_p1 = _make_story_html(5).replace(
            '<div class="pagination"><a href="?page=1">1</a><a href="?page=2">2</a><a href="?page=12">12</a></div>',
            '<div class="pagination"><a href="?page=1">1</a><a class="next" href="?page=2">2</a></div>',
        )
        story_p2 = _make_story_html(5).replace("chuong-", "chuong-p2-")

        prompts: list[str] = []
        audits: list[str] = []

        def fake_llm(prompt: str) -> dict:
            prompts.append(prompt)
            if len(prompts) == 1:
                return {**VALID_SELECTORS, "page_url_pattern": "{story_url}?wrong={page}"}
            return VALID_SELECTORS

        def fake_audit(prompt: str) -> dict:
            audits.append(prompt)
            return {"ok": True, "issues": []}

        def fake_fetch(url: str) -> str:
            if "page=2" in url:
                return story_p2
            if "wrong=2" in url:
                return story_p1
            return SAMPLE_CHAPTER_HTML

        selectors, _ = discover_site_selectors(
            story_url=SAMPLE_STORY_URL,
            story_html=story_p1,
            fetch_fn=fake_fetch,
            max_retries=2,
            llm_fn=fake_llm,
            audit_fn=fake_audit,
        )
        self.assertEqual(len(prompts), 2)
        self.assertIn("Live page-2 probe", prompts[1])
        self.assertEqual(selectors["page_url_pattern"], "{story_url}?page={page}")
        self.assertEqual(len(audits), 1)


if __name__ == "__main__":
    unittest.main()
