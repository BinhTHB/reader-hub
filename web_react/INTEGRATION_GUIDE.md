# 📘 Reader Hub - Integration Guide cho AI Coding Assistant

## 🎯 Tổng quan dự án

**Reader Hub** là ứng dụng mobile đọc truyện dài với tính năng **scraping truyện từ web** sử dụng GitHub Actions + Playwright.

### Tech Stack hiện tại:
- **Frontend**: React + TypeScript + Tailwind CSS (Tailwind v4)
- **UI Framework**: Radix UI, Lucide Icons
- **State**: React Hooks (useState)
- **Routing**: Manual navigation state management

### Tech Stack cần tích hợp:
- **Backend**: Supabase (Database + Edge Functions + Storage)
- **Scraper**: GitHub Actions + Python (scraper.py)
- **Storage**: Cloudflare R2 (covers + chapter JSON)
- **Bypass**: Playwright + playwright-stealth + fingerprints

---

## 📂 Cấu trúc Project

```
/workspaces/default/code/
├── src/
│   ├── app/
│   │   ├── App.tsx                    # Main app with navigation
│   │   ├── components/
│   │   │   ├── BottomNav.tsx          # Bottom navigation bar
│   │   │   ├── BookCard.tsx           # Reusable book card
│   │   │   ├── Skeleton.tsx           # Loading skeletons
│   │   │   └── EmptyState.tsx         # Empty state component
│   │   └── screens/
│   │       ├── HomeScreen.tsx         # Trang chủ
│   │       ├── ReadingScreen.tsx      # Màn đọc truyện
│   │       ├── LibraryScreen.tsx      # Thư viện
│   │       ├── DetailScreen.tsx       # Chi tiết truyện
│   │       ├── ProfileScreen.tsx      # Trang cá nhân
│   │       └── ScrapeScreen.tsx       # 🔥 QUAN TRỌNG - Trang cào truyện
│   ├── styles/
│   │   ├── theme.css                  # Design tokens
│   │   └── fonts.css                  # Font imports
│   └── imports/
│       └── pasted_text/
│           └── reader-hub-ui-plan.md  # Design spec
├── package.json
└── INTEGRATION_GUIDE.md               # File này
```

---

## 🔥 File quan trọng nhất: `ScrapeScreen.tsx`

### Trạng thái hiện tại (Mock):
- ✅ UI hoàn chỉnh với search + results
- ✅ Job progress tracking với 4 bước
- ✅ Logs console real-time
- ❌ **Chưa kết nối backend thật**

### Cần làm gì:
1. Tích hợp Supabase Client
2. Gọi Edge Function để trigger scraping
3. Listen realtime job updates từ Supabase
4. Fetch search results từ backend API

---

## 🗄️ Database Schema (Supabase)

### Bảng `novels`
```sql
CREATE TABLE novels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT,
  description TEXT,
  cover_r2_url TEXT,
  source_url TEXT NOT NULL UNIQUE,
  source_parser TEXT NOT NULL, -- 'TruyenFull', 'Hako', 'TangThuVien', etc.
  total_chapters INTEGER,
  rating DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_novels_source_url ON novels(source_url);
CREATE INDEX idx_novels_title ON novels USING gin(to_tsvector('vietnamese', title));
```

### Bảng `chapters`
```sql
CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id UUID REFERENCES novels(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  text_r2_url TEXT, -- JSON file in R2: {content: "...", html: "..."}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(novel_id, chapter_number)
);

CREATE INDEX idx_chapters_novel_id ON chapters(novel_id);
```

### Bảng `scraping_jobs`
```sql
CREATE TABLE scraping_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id UUID REFERENCES novels(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'detecting_parser', 'scraping_metadata', 'uploading_cover', 'scraping_chapters', 'completed', 'failed'
  progress INTEGER DEFAULT 0, -- 0-100
  current_step TEXT,
  parser TEXT,
  chapters_scraped INTEGER DEFAULT 0,
  total_chapters INTEGER,
  logs JSONB DEFAULT '[]'::jsonb, -- Array of log strings
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_jobs_status ON scraping_jobs(status);
CREATE INDEX idx_jobs_created_at ON scraping_jobs(created_at DESC);
```

### Bảng `user_library` (optional - cho tracking user)
```sql
CREATE TABLE user_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id UUID REFERENCES novels(id) ON DELETE CASCADE,
  reading_progress INTEGER DEFAULT 0, -- Chapter number
  is_favorite BOOLEAN DEFAULT false,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, novel_id)
);
```

---

## ⚡ Edge Functions (Supabase)

### 1. `trigger-scraper` (POST)
**Path**: `/functions/v1/trigger-scraper`

**Input**:
```typescript
{
  "source_url": "https://truyenfull.vn/kiem-than-dao"
}
```

**Logic**:
1. Tạo record trong `scraping_jobs` với status `pending`
2. Trigger GitHub Actions via `repository_dispatch`:
   ```bash
   curl -X POST \
     -H "Authorization: token ${GITHUB_TOKEN}" \
     -H "Accept: application/vnd.github.v3+json" \
     https://api.github.com/repos/{owner}/{repo}/dispatches \
     -d '{"event_type":"scrape","client_payload":{"job_id":"...","url":"..."}}'
   ```
3. Return `job_id`

**Output**:
```typescript
{
  "job_id": "uuid",
  "status": "pending"
}
```

### 2. `search-novels` (GET)
**Path**: `/functions/v1/search-novels?q=Kiếm+Thần`

**Logic**:
1. Search trong bảng `novels` bằng full-text search
2. Return danh sách novels với metadata

**Output**:
```typescript
{
  "results": [
    {
      "id": "uuid",
      "title": "Kiếm Thần Đạo",
      "author": "Bạch Y Huyền Sĩ",
      "cover_r2_url": "https://...",
      "source_url": "https://truyenfull.vn/...",
      "source_parser": "TruyenFull",
      "total_chapters": 450,
      "rating": 4.8
    }
  ]
}
```

### 3. `get-job-status` (GET) - Optional nếu không dùng Realtime
**Path**: `/functions/v1/get-job-status?job_id=uuid`

---

## 🤖 GitHub Actions Workflow

**File**: `.github/workflows/scraper.yml`

```yaml
name: Novel Scraper

on:
  repository_dispatch:
    types: [scrape]

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          pip install playwright playwright-stealth supabase requests cloudflare
          playwright install chromium
      
      - name: Run scraper
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
        run: |
          python scraper.py \
            --job-id "${{ github.event.client_payload.job_id }}" \
            --url "${{ github.event.client_payload.url }}"
```

---

## 🐍 Python Scraper (scraper.py)

### Cấu trúc:
```python
# scraper.py
import argparse
from supabase import create_client
from playwright.sync_api import sync_playwright
from parsers import PARSERS, detect_parser
import cloudflare_r2

def main(job_id, url):
    # 1. Update job status: detecting_parser
    update_job_status(job_id, "detecting_parser", 15, "Phát hiện parser...")
    
    # 2. Detect parser
    parser_class = detect_parser(url)
    parser = parser_class(url)
    
    # 3. Scrape metadata
    update_job_status(job_id, "scraping_metadata", 40, "Đang cào metadata...")
    metadata = parser.get_metadata()  # {title, author, cover_url}
    
    # 4. Upload cover to R2
    update_job_status(job_id, "uploading_cover", 60, "Upload cover...")
    cover_r2_url = upload_to_r2(metadata['cover_url'], 'covers/')
    
    # 5. Save novel to Supabase
    novel = supabase.table('novels').upsert({
        'source_url': url,
        'title': metadata['title'],
        'author': metadata['author'],
        'cover_r2_url': cover_r2_url,
        'source_parser': parser.name,
        'total_chapters': len(metadata['chapters'])
    }).execute()
    
    # 6. Scrape chapters
    update_job_status(job_id, "scraping_chapters", 70, "Đang cào chapters...")
    for i, chapter_url in enumerate(metadata['chapters']):
        content = parser.get_chapter_content(chapter_url)
        chapter_json = upload_to_r2(content, f'chapters/{novel.id}/')
        
        supabase.table('chapters').insert({
            'novel_id': novel.id,
            'chapter_number': i + 1,
            'title': content['title'],
            'text_r2_url': chapter_json
        }).execute()
        
        progress = 70 + int((i / len(metadata['chapters'])) * 25)
        update_job_status(job_id, "scraping_chapters", progress, 
                         f"Chương {i+1}/{len(metadata['chapters'])}")
    
    # 7. Complete
    update_job_status(job_id, "completed", 100, "Hoàn tất!")
```

### Base Parser:
```python
# parsers/base.py
class BaseSiteParser:
    def __init__(self, url):
        self.url = url
        self.page = None
    
    def get_metadata(self):
        """Return {title, author, cover_url, chapters: [urls]}"""
        raise NotImplementedError
    
    def get_chapter_content(self, chapter_url):
        """Return {title, content, html}"""
        raise NotImplementedError
```

### Parser Registry:
```python
# parsers/__init__.py
from .truyenfull import TruyenFullParser
from .hako import HakoParser
from .tangthuvien import TangThuVienParser

PARSERS = {
    'truyenfull.vn': TruyenFullParser,
    'ln.hako.vn': HakoParser,
    'tangthuvien.vn': TangThuVienParser,
}

def detect_parser(url):
    for domain, parser_class in PARSERS.items():
        if domain in url:
            return parser_class
    raise ValueError(f"No parser found for {url}")
```

---

## 🔌 Frontend Integration (ScrapeScreen.tsx)

### 1. Install Supabase Client
```bash
pnpm add @supabase/supabase-js
```

### 2. Create Supabase Client
```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### 3. Thay thế Mock Functions trong ScrapeScreen.tsx

#### A. Search Function:
```typescript
// Thay thế handleSearch()
const handleSearch = async () => {
  if (!searchQuery.trim()) {
    setError("Vui lòng nhập tên truyện");
    return;
  }

  setIsSearching(true);
  setError("");
  setSearchResults([]);

  try {
    const { data, error } = await supabase.functions.invoke('search-novels', {
      body: { query: searchQuery }
    });

    if (error) throw error;
    
    setSearchResults(data.results);
    if (data.results.length === 0) {
      setError("Không tìm thấy kết quả");
    }
  } catch (err) {
    setError(err.message);
  } finally {
    setIsSearching(false);
  }
};
```

#### B. Trigger Scrape:
```typescript
// Thay thế handleScrapeResult()
const handleScrapeResult = async (result: SearchResult) => {
  setSearchResults([]);
  setSearchQuery("");

  try {
    // Trigger scraper
    const { data, error } = await supabase.functions.invoke('trigger-scraper', {
      body: { source_url: result.url }
    });

    if (error) throw error;

    // Subscribe to job updates
    const jobId = data.job_id;
    const channel = supabase
      .channel(`job:${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scraping_jobs',
          filter: `id=eq.${jobId}`
        },
        (payload) => {
          const job = payload.new as ScrapeJob;
          setActiveJob(job);
          
          if (job.status === 'completed') {
            setJobHistory(prev => [job, ...prev]);
            channel.unsubscribe();
          }
        }
      )
      .subscribe();

    // Set initial job state
    setActiveJob({
      id: jobId,
      url: result.url,
      status: 'pending',
      progress: 0,
      currentStep: 'Đang khởi tạo...',
      logs: [],
      created_at: new Date().toISOString(),
    });

  } catch (err) {
    setError(err.message);
  }
};
```

#### C. Load Job History:
```typescript
// Thay useEffect() load demo jobs
useEffect(() => {
  const loadJobHistory = async () => {
    const { data } = await supabase
      .from('scraping_jobs')
      .select(`
        *,
        novels (
          title,
          author,
          cover_r2_url,
          total_chapters
        )
      `)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) {
      const formattedJobs = data.map(job => ({
        ...job,
        metadata: job.novels ? {
          title: job.novels.title,
          author: job.novels.author,
          cover_r2_url: job.novels.cover_r2_url,
          total_chapters: job.novels.total_chapters,
        } : undefined
      }));
      setJobHistory(formattedJobs);
    }
  };

  loadJobHistory();
}, []);
```

---

## 🔐 Environment Variables

### `.env.local` (Frontend):
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

### GitHub Secrets (cho Actions):
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc... (service_role key, not anon)
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=reader-hub-storage
GITHUB_TOKEN=ghp_... (Personal Access Token for repository_dispatch)
```

---

## 📝 Checklist tích hợp

### Backend Setup:
- [ ] Tạo Supabase project
- [ ] Chạy SQL migrations (tạo bảng novels, chapters, scraping_jobs)
- [ ] Deploy Edge Functions (trigger-scraper, search-novels)
- [ ] Setup Cloudflare R2 bucket
- [ ] Tạo GitHub repository cho scraper
- [ ] Add GitHub Secrets
- [ ] Tạo `.github/workflows/scraper.yml`
- [ ] Viết `scraper.py` + parsers

### Frontend Integration:
- [ ] Install `@supabase/supabase-js`
- [ ] Tạo file `src/lib/supabase.ts`
- [ ] Thêm `.env.local` với Supabase credentials
- [ ] Update `ScrapeScreen.tsx`:
  - [ ] Thay `handleSearch()` bằng real API call
  - [ ] Thay `handleScrapeResult()` bằng trigger + realtime
  - [ ] Thay `useEffect()` load jobs từ DB
- [ ] Test flow hoàn chỉnh

### Testing:
- [ ] Test search novels
- [ ] Test trigger scraping job
- [ ] Test realtime updates
- [ ] Test GitHub Actions workflow
- [ ] Test R2 upload
- [ ] Verify data trong Supabase

---

## 🚨 Lưu ý quan trọng

### 1. Realtime Subscriptions
Supabase Realtime yêu cầu enable Realtime cho bảng `scraping_jobs`:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE scraping_jobs;
```

### 2. Row Level Security (RLS)
Nếu dùng auth, cần setup RLS policies:
```sql
-- Allow read all novels
CREATE POLICY "Allow public read novels"
ON novels FOR SELECT
TO public
USING (true);

-- Allow read own jobs
CREATE POLICY "Allow users read own jobs"
ON scraping_jobs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
```

### 3. R2 CORS
Config CORS cho R2 bucket để frontend có thể load images:
```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"]
  }
]
```

### 4. Rate Limiting
Implement rate limiting cho Edge Functions để tránh abuse:
```typescript
// Trong Edge Function
const { data: recentJobs } = await supabase
  .from('scraping_jobs')
  .select('created_at')
  .eq('user_id', userId)
  .gte('created_at', new Date(Date.now() - 3600000).toISOString());

if (recentJobs.length >= 10) {
  return new Response('Rate limit exceeded', { status: 429 });
}
```

---

## 📚 Resources

- [Supabase Docs](https://supabase.com/docs)
- [Playwright Docs](https://playwright.dev)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2)
- [GitHub Actions Docs](https://docs.github.com/en/actions)

---

## 🎯 Next Steps

Sau khi tích hợp backend xong, bạn có thể mở rộng:
1. **Authentication**: Thêm login/register với Supabase Auth
2. **Library Sync**: Đồng bộ thư viện người dùng lên cloud
3. **Reading Progress**: Track tiến độ đọc realtime
4. **Notifications**: Push notification khi có chapter mới
5. **Offline Reading**: Download chapters để đọc offline
6. **Multi-language**: Hỗ trợ nhiều nguồn truyện quốc tế

---

**Tạo bởi**: Claude Sonnet 4.5  
**Ngày**: 2026-05-17  
**Version**: 1.0
