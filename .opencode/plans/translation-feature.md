# Kế Hoạch Triển Khai: Tính Năng Dịch Truyện Tự Động

**Ngày tạo**: 2026-05-17  
**Trạng thái**: Chưa triển khai

---

## 🎯 Mục Tiêu

- Tự động dịch nội dung truyện từ ngôn ngữ nguồn sang ngôn ngữ đích khi scrape
- Hỗ trợ multi-language (auto-detect ngôn ngữ nguồn)
- Sử dụng Google AI Studio (Gemini API) - free tier
- Chỉ lưu bản dịch (thay thế nội dung gốc)

---

## 🏗️ Kiến Trúc Thay Đổi

```
┌─────────────────────────────────────────────────────────┐
│ GitHub Actions Scraper Workflow với Context            │
│                                                          │
│  1. Scrape story info                                   │
│  2. Load/Create story context (glossary + summaries)    │
│  3. Scrape chapter list (pagination)                    │
│  4. For each chapter:                                   │
│     ├─ Scrape raw content (original language)          │
│     ├─ Load context (glossary + recent 3-5 chapters)   │
│     ├─ Detect language (if not specified)              │
│     ├─ Translate via Gemini API with context ◄── NEW   │
│     ├─ Extract new terms & generate summary ◄── NEW    │
│     ├─ Update context (glossary + rolling window)      │
│     ├─ Upload translated JSON to R2                     │
│     ├─ Save context to R2 + Supabase ◄── NEW           │
│     └─ Save metadata to Supabase                        │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 Các Thay Đổi Cần Thực Hiện

### **1. Database Schema Changes**

Thêm cột mới vào bảng `chapters` và `stories`:

**File**: `supabase/migrations/002_add_translation_support.sql`

```sql
-- Migration: 002_add_translation_support.sql

ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS 
    original_language TEXT;  -- 'zh', 'en', 'vi', etc.

ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS 
    translated_language TEXT DEFAULT 'vi';  -- Target language

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS 
    original_language TEXT;  -- Story's source language

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS 
    translation_enabled BOOLEAN DEFAULT true;  -- Toggle per story

CREATE INDEX idx_chapters_language ON public.chapters(original_language);

-- Story-level context metadata
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS 
    context_metadata JSONB DEFAULT '{
        "glossary_version": 1,
        "last_context_update": null,
        "total_terms": 0
    }';

-- Context storage table
CREATE TABLE public.story_contexts (
    id BIGSERIAL PRIMARY KEY,
    story_id BIGINT NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    glossary JSONB DEFAULT '{}',  -- { "characters": {...}, "places": {...}, "terms": {...} }
    recent_chapters_summary TEXT,  -- Summary of last 3-5 chapters
    r2_context_url TEXT,           -- Full context file on R2
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(story_id)
);

COMMENT ON TABLE public.story_contexts IS 'Translation context for each story';
COMMENT ON COLUMN public.story_contexts.glossary IS 'Character names, places, terms with translations';
COMMENT ON COLUMN public.story_contexts.recent_chapters_summary IS 'Summary of recent 3-5 chapters for context';

CREATE INDEX idx_story_contexts_story ON public.story_contexts(story_id);

-- RLS for story_contexts
ALTER TABLE public.story_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read story contexts"
    ON public.story_contexts FOR SELECT
    USING (true);
```

---

### **2. Tạo Module Context Manager: `scraper/context_manager.py`**

Module quản lý glossary và context cho translation:

```python
class StoryContext:
    def __init__(self, story_id: int, story_slug: str):
        self.story_id = story_id
        self.story_slug = story_slug
        self.glossary = {"characters": {}, "places": {}, "terms": {}}
        self.recent_chapters = []  # Rolling window of 3-5 chapters
        self.version = 1
        self.last_chapter_processed = 0
        
    def load_from_r2(self) -> bool:
        """Load existing context from R2"""
        
    def add_chapter_summary(self, chapter_num: int, summary: str):
        """Add chapter to rolling window (keep last 5)"""
        
    def update_glossary(self, new_terms: Dict):
        """Merge new terms into glossary"""
        
    def build_context_prompt(self) -> str:
        """Build context section for translation prompt"""
        
    def save(self):
        """Save context to R2 and Supabase"""

async def extract_terms_from_translation(
    original_text: str,
    translated_text: str,
    gemini_api_key: str
) -> Dict:
    """Extract new terms from translation using Gemini API"""
```

**Context File Structure** (R2: `stories/{slug}/context.json`):

```json
{
  "story_id": 1,
  "story_slug": "dau-la-dai-luc",
  "version": 15,
  "last_updated": "2026-05-17T14:30:00Z",
  "last_chapter_processed": 15,
  
  "glossary": {
    "characters": {
      "唐三": {
        "translation": "Đường Tam",
        "first_seen_chapter": 1,
        "aliases": ["小三", "三哥"]
      }
    },
    "places": {
      "斗罗大陆": {"translation": "Đấu La Đại Lục"}
    },
    "terms": {
      "魂师": {"translation": "Hồn Sư", "category": "cultivation"}
    }
  },
  
  "recent_chapters": [
    {"chapter_number": 13, "summary": "Đường Tam đạt level 20..."},
    {"chapter_number": 14, "summary": "Gặp Đại Sư trong rừng..."},
    {"chapter_number": 15, "summary": "Chiến đấu với Mãng Xà..."}
  ]
}
```

---

### **3. Tạo Module Dịch: `scraper/translator.py`**

Module này sẽ:
- Detect ngôn ngữ nguồn (dùng `langdetect` hoặc Gemini API)
- Gọi Gemini API để dịch với context đầy đủ
- Batch translation để tối ưu rate limit
- Retry logic khi gặp lỗi API
- Preserve formatting (giữ nguyên cấu trúc paragraphs)
- Extract terms và generate summary sau mỗi chapter

**Chức năng chính:**

```python
async def translate_chapter_with_context(
    paragraphs: list[str],
    context: StoryContext,
    source_lang: str = "auto",
    target_lang: str = "vi",
    api_key: str = None
) -> dict:
    """
    Returns: {
        "paragraphs": [...],  # Translated
        "detected_language": "zh",
        "word_count": 1234,
        "chapter_summary": "Tóm tắt chapter..."
    }
    """
```

**API Integration:**
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent`
- Model: `gemini-2.0-flash-exp` (free tier: 1500 requests/day)
- Prompt template: Context + Requirements + Content

---

### **4. Cập Nhật `scraper/scraper.py`**

**Thêm logic context và dịch vào pipeline**:

```python
# Sau khi upsert story
from context_manager import StoryContext

# Load or create context
context = StoryContext(story_id, story_info["slug"])
context.load_from_r2()  # Load existing context if available

print(f"  📚 Context loaded: {len(context.glossary['characters'])} characters, "
      f"{len(context.glossary['terms'])} terms")

# ... trong vòng lặp scrape chapters ...

# Parse chapter content (original)
content = parser.parse_chapter_content(chapter_html)
paragraphs = content["paragraphs"]

# NEW: Translate with context if enabled
if TRANSLATION_ENABLED:
    print(f"  🌐 Translating with context...")
    translation_result = await translate_chapter_with_context(
        paragraphs=paragraphs,
        context=context,
        source_lang=SOURCE_LANG,
        target_lang=TARGET_LANG,
        api_key=GEMINI_API_KEY
    )
    
    # Replace with translated content
    paragraphs = translation_result["paragraphs"]
    detected_lang = translation_result["detected_language"]
    word_count = translation_result["word_count"]
    
    # Update context
    context.last_chapter_processed = chapter_num
    context.add_chapter_summary(
        chapter_num, 
        translation_result["chapter_summary"]
    )
    
    # Save context every chapter
    context.save()
    print(f"  ✅ Translated & context updated (v{context.version})")
else:
    detected_lang = None
    word_count = len(" ".join(paragraphs).split())

# Upload to R2 (now contains translated content)
chapter_json = {
    "chapter_number": chapter_num,
    "title": chapter_title,
    "paragraphs": paragraphs,  # Translated
    "word_count": word_count,
    "scraped_at": datetime.utcnow().isoformat()
}

r2_url = upload_chapter(story_slug, chapter_num, chapter_json)

# Update Supabase with language metadata
upsert_chapter(
    story_id=story_id,
    chapter_number=chapter_num,
    title=chapter_title,
    text_r2_url=r2_url,
    word_count=word_count,
    source_url=chapter_url,
    original_language=detected_lang,  # NEW
    translated_language=TARGET_LANG   # NEW
)
```

---

### **5. Environment Variables**

Thêm vào `.env` và GitHub Secrets:

```bash
# Translation Settings
TRANSLATION_ENABLED=true
GEMINI_API_KEY=your_google_ai_studio_api_key_here
SOURCE_LANGUAGE=auto  # auto-detect, or 'zh', 'en', 'ja', etc.
TARGET_LANGUAGE=vi

# Context Management
CONTEXT_ENABLED=true
CONTEXT_WINDOW_SIZE=5  # Number of recent chapters to keep
CONTEXT_UPDATE_FREQUENCY=1  # Update glossary every N chapters
CONTEXT_MAX_TERMS=100  # Max terms to include in prompt
```

**GitHub Actions Secrets:**
- `GEMINI_API_KEY` (bắt buộc nếu bật translation)

---

### **6. Cập Nhật `scraper/requirements.txt`**

```txt
# Existing dependencies...
playwright==1.42.0
playwright-stealth==1.0.6
beautifulsoup4==4.12.3
boto3==1.34.51
supabase==2.4.0
python-dotenv==1.0.1

# NEW: Translation dependencies
google-generativeai==0.3.2  # Gemini SDK
langdetect==1.0.9           # Language detection fallback
```

---

### **7. Cập Nhật `sites_config.py`**

Thêm metadata ngôn ngữ cho mỗi site:

```python
@dataclass
class SiteConfig:
    name: str
    display_name: str
    base_url: str
    search_url_template: str
    default_language: str = "vi"  # NEW: Default source language
    enabled: bool = True

SITES: dict[str, SiteConfig] = {
    "truyenfull": SiteConfig(
        name="truyenfull",
        display_name="TruyenFull",
        base_url="https://truyenfull.vision",
        search_url_template="https://truyenfull.vision/tim-kiem/?tukhoa={query}",
        default_language="zh",  # Mostly Chinese novels
    ),
    "metruyenchu": SiteConfig(
        name="metruyenchu",
        display_name="MeTruyenChu",
        base_url="https://metruyenchu.com.vn",
        search_url_template="https://metruyenchu.com.vn/search?q={query}",
        default_language="zh",
    ),
}
```

---

### **8. Cập Nhật GitHub Actions Workflow**

File `.github/workflows/scraper.yml`:

```yaml
env:
  # Existing env vars...
  TRANSLATION_ENABLED: 'true'
  GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
  SOURCE_LANGUAGE: 'auto'
  TARGET_LANGUAGE: 'vi'
```

---

### **9. Cập Nhật `scraper/r2_uploader.py`**

Thêm helper functions cho context management:

```python
def upload_json_to_r2(key: str, data: dict) -> str:
    """Upload JSON data to R2 and return public URL"""
    json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
    # ... existing upload logic ...
    return public_url

def download_from_r2(key: str) -> dict | None:
    """Download and parse JSON from R2"""
    try:
        response = s3_client.get_object(Bucket=R2_BUCKET_NAME, Key=key)
        content = response['Body'].read().decode('utf-8')
        return json.loads(content)
    except:
        return None
```

---

### **10. Cập Nhật Mobile App (Optional - Future Enhancement)**

Hiện tại app chỉ đọc `text_r2_url`, không cần thay đổi gì vì nội dung đã được dịch sẵn.

**Nếu muốn thêm toggle "Xem bản gốc/bản dịch" sau này:**
- Lưu thêm `original_text_r2_url` trong database
- Thêm switch trong reader screen
- Fetch từ URL tương ứng

---

## 🔧 Chi Tiết Kỹ Thuật

### **Language Detection Strategy**

1. **Priority 1**: Dùng `site.default_language` từ config
2. **Priority 2**: Auto-detect bằng `langdetect` library (nhanh, offline)
3. **Priority 3**: Hỏi Gemini API detect language (chính xác hơn nhưng tốn quota)

### **Translation Prompt Template với Context**

```python
TRANSLATION_PROMPT_WITH_CONTEXT = """
# NGỮ CẢNH TRUYỆN

## Nhân vật:
- 唐三 → Đường Tam
- 小舞 → Tiểu Vũ
- 大师 → Đại Sư

## Địa danh:
- 斗罗大陆 → Đấu La Đại Lục
- 诺丁学院 → Học Viện Nặc Đình

## Thuật ngữ:
- 魂师 → Hồn Sư
- 魂环 → Hồn Hoàn
- 魂力 → Hồn Lực

## Các chương gần đây:
- Chương 13: Đường Tam đạt level 20, chuẩn bị săn hồn hoàn đầu tiên
- Chương 14: Gặp Đại Sư trong rừng, học về các loại hồn thú
- Chương 15: Chiến đấu với Mãng Xà Thiên Niên, thu được hồn hoàn vàng

---

Bạn là một dịch giả chuyên nghiệp. Hãy dịch đoạn văn sau từ {source_lang} sang {target_lang}.

YÊU CẦU:
- SỬ DỤNG ĐÚNG các tên nhân vật, địa danh, thuật ngữ từ NGỮ CẢNH TRUYỆN ở trên
- Giữ nguyên văn phong văn học, tự nhiên như người Việt viết
- Không thêm giải thích, chú thích, hoặc nội dung ngoài bản dịch
- Giữ nguyên cấu trúc đoạn văn

Văn bản gốc:
{text}

Bản dịch:
"""
```

### **Rate Limiting & Retry**

- Gemini free tier: **1500 requests/day**, **15 RPM**
- Batch size: 5-10 paragraphs/request (tối ưu token usage)
- Retry: 3 lần với exponential backoff (2s, 4s, 8s)
- Fallback: Nếu API fail, lưu bản gốc + log error

### **Token Usage với Context System**

**Với context system:**
- Context prompt: ~500-1000 tokens (glossary + recent chapters)
- Chapter content: ~2000-4000 tokens (50 paragraphs)
- **Total per chapter**: ~2500-5000 tokens input

**Gemini 2.0 Flash limits:**
- Free tier: 1500 requests/day
- 1M tokens/day input
- **Có thể dịch ~200-400 chapters/day** với context đầy đủ

### **Cost Estimation**

- Gemini 2.0 Flash: **FREE** (1500 req/day)
- 1 chapter với context ≈ 8-12 API calls (translation + term extraction + summary)
- **Có thể scrape ~125-180 chapters/day** trong free tier

---

## 📝 Checklist Triển Khai

### **Phase 1: Core Translation & Context (2-3 giờ)**

- [ ] Tạo migration `002_add_translation_support.sql` (bao gồm `story_contexts` table)
- [ ] Chạy migration trên Supabase
- [ ] Tạo `scraper/context_manager.py` với StoryContext class
- [ ] Tạo `scraper/translator.py` với Gemini integration + context support
- [ ] Thêm dependencies vào `requirements.txt`
- [ ] Cập nhật `sites_config.py` với `default_language`
- [ ] Cập nhật `r2_uploader.py` với `upload_json_to_r2()` và `download_from_r2()`

### **Phase 2: Integration (1-1.5 giờ)**

- [ ] Cập nhật `scraper.py` để load/save context và gọi translator
- [ ] Cập nhật `supabase_client.py` để lưu language metadata và context
- [ ] Thêm env vars vào `.env.example` (translation + context settings)
- [ ] Thêm `GEMINI_API_KEY` vào GitHub Secrets

### **Phase 3: Testing (45 phút - 1 giờ)**

- [ ] Test local với 1 chapter: `python scraper/scraper.py --url ... --limit 1`
- [ ] Verify context được tạo và lưu đúng (R2 + Supabase)
- [ ] Test với 5-10 chapters để verify glossary auto-update
- [ ] Verify bản dịch chất lượng và consistency
- [ ] Test GitHub Actions workflow
- [ ] Verify R2 upload + Supabase sync

### **Phase 4: Documentation (15-30 phút)**

- [ ] Cập nhật `CONTEXT.md` với tính năng translation + context system
- [ ] Thêm hướng dẫn setup Gemini API key vào README
- [ ] Ghi chú về rate limit, context management và best practices
- [ ] Document context file structure và glossary format

---

## ⚠️ Lưu Ý Quan Trọng

1. **Rate Limit**: Free tier chỉ 1500 req/day → cần batch translation thông minh
2. **Quality Control**: Nên test với 5-10 chapters trước khi scrape hàng trăm chapters
3. **Fallback**: Nếu API fail, vẫn lưu bản gốc thay vì bỏ qua chapter
4. **Language Detection**: Một số truyện có cả tiếng Trung lẫn tiếng Việt → cần logic skip nếu đã là tiếng Việt
5. **Context Consistency**: Context system đảm bảo tên nhân vật, thuật ngữ được dịch nhất quán qua các chapters
6. **Context Storage**: Context file có thể lớn (>100KB) khi truyện dài → cần optimize glossary size
7. **Term Extraction**: Chỉ extract terms mỗi N chapters để tiết kiệm API quota
8. **Rolling Window**: Giữ 5 chapters gần nhất để AI hiểu bối cảnh mà không tốn quá nhiều tokens

---

## 🚀 Ước Tính Thời Gian

- **Development**: 3-4.5 giờ (translation + context system)
- **Testing**: 45 phút - 1 giờ
- **Documentation**: 15-30 phút
- **Tổng**: ~4.5-6 giờ

---

## 📌 Quyết Định Thiết Kế

**Từ cuộc thảo luận ngày 2026-05-17:**

- **Ngôn ngữ**: Multi-language support (auto-detect → Vietnamese)
- **API**: Google AI Studio (Gemini 2.0 Flash) - free tier
- **Timing**: Dịch ngay khi scrape (inline translation)
- **Storage**: Chỉ lưu bản dịch (thay thế nội dung gốc)
- **Rate Limit**: 1500 requests/day, 15 RPM
- **Model**: `gemini-2.0-flash-exp` hoặc `gemma-4-26b` (tuỳ availability)

**Context Management (bổ sung):**

- **Context Type**: Hybrid approach (Glossary cố định + Rolling window 3-5 chapters)
- **Context Creation**: Fully automatic (AI tự động extract và update)
- **Storage**: Both (Metadata trong Supabase + Full context file trên R2)
- **Update Frequency**: Mỗi khi gọi API để dịch (real-time update)
- **Glossary Categories**: Characters, Places, Terms
- **Rolling Window**: 5 chapters gần nhất với summary

---

## 🔗 Tài Liệu Tham Khảo

- [Google AI Studio](https://aistudio.google.com/)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [google-generativeai Python SDK](https://pypi.org/project/google-generativeai/)
- [langdetect Library](https://pypi.org/project/langdetect/)
