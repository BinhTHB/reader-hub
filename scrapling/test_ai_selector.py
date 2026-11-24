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
            fetch_fn=lambda _url: SAMPLE_CHAPTER_HTML,
            max_retries=2,
            llm_fn=fake_llm,
        )

        self.assertEqual(len(prompts_seen), 2)
        self.assertIn("PREVIOUS ATTEMPT FAILED VALIDATION", prompts_seen[1])
        self.assertEqual(selectors["chapter_content"], "#chapter-body")
        self.assertEqual(preview["title"], "Phàm Nhân Tu Tiên")
        self.assertEqual(preview["chapter_paragraphs"], 4)


if __name__ == "__main__":
    unittest.main()
