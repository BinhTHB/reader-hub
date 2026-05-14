# Reader Hub — Implementation Plan

Ứng dụng đọc truyện audio với kiến trúc: **Supabase** (metadata) + **Cloudflare R2** (content storage) + **GitHub Actions** (scraping) + **React Native Expo** (mobile app + on-device TTS).

## Architecture Diagram

```mermaid
graph TB
    subgraph "Data Pipeline"
        CRON["⏰ Cron / Supabase Edge Function"]
        GA["🤖 GitHub Actions Runner"]
        PROXY["🔄 Rotating Proxy"]
        WEB["🌐 Source Websites"]
    end

    subgraph "Storage Layer"
        SUPA["🧠 Supabase PostgreSQL<br/>metadata, users, chapters"]
        R2["📦 Cloudflare R2<br/>JSON content, cover images"]
    end

    subgraph "Client"
        APP["📱 React Native App"]
        TTS["🔊 On-device TTS Engine"]
    end

    CRON -->|repository_dispatch| GA
    GA -->|via proxy| PROXY --> WEB
    GA -->|upload JSON| R2
    GA -->|update metadata| SUPA
    APP -->|query chapters| SUPA
    APP -->|fetch content| R2
    APP -->|text → speech| TTS
```

---

## Phase 1: Infrastructure & Database (Tuần 1)

### Supabase Setup

#### [NEW] [supabase/migrations/001_initial_schema.sql](file:///e:/project/reader-hub/supabase/migrations/001_initial_schema.sql)

SQL migration tạo schema ban đầu:

```sql
-- Bảng users (mở rộng auth.users của Supabase)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bảng stories
CREATE TABLE public.stories (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  author TEXT,
  description TEXT,
  cover_url TEXT,           -- R2 URL for cover image
  source_url TEXT,          -- original website URL
  source_name TEXT,         -- e.g. 'truyenfull', 'metruyenchu'
  genres TEXT[],
  status TEXT DEFAULT 'ongoing', -- ongoing | completed
  total_chapters INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Bảng chapters
CREATE TABLE public.chapters (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  chapter_number INT NOT NULL,
  title TEXT,
  text_r2_url TEXT,         -- R2 URL for JSON content
  word_count INT DEFAULT 0,
  source_url TEXT,
  is_scraped BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(story_id, chapter_number)
);

-- Bảng reading_history
CREATE TABLE public.reading_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  story_id BIGINT NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  last_chapter_number INT DEFAULT 1,
  scroll_position FLOAT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, story_id)
);

-- Indexes
CREATE INDEX idx_stories_slug ON public.stories(slug);
CREATE INDEX idx_stories_source ON public.stories(source_name);
CREATE INDEX idx_chapters_story ON public.chapters(story_id, chapter_number);
CREATE INDEX idx_reading_history_user ON public.reading_history(user_id);

-- RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_history ENABLE ROW LEVEL SECURITY;

-- Stories & chapters: public read, service_role write
CREATE POLICY "Public read stories" ON public.stories FOR SELECT USING (true);
CREATE POLICY "Public read chapters" ON public.chapters FOR SELECT USING (true);

-- Reading history: user-owned
CREATE POLICY "Users read own history" ON public.reading_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users write own history" ON public.reading_history
  FOR ALL USING (auth.uid() = user_id);

-- Profiles: user-owned
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
```

#### [NEW] [supabase/functions/trigger-scraper/index.ts](file:///e:/project/reader-hub/supabase/functions/trigger-scraper/index.ts)

Edge Function để trigger GitHub Actions qua `repository_dispatch`:

- Nhận request body: `{ story_id, source_url, chapter_start, chapter_end }`
- POST tới `api.github.com/repos/{owner}/{repo}/dispatches` với `client_payload`
- Dùng `GITHUB_PAT` từ Supabase Secrets

---

### Cloudflare R2 Setup

> [!IMPORTANT]
> **Cấu hình thủ công trên Cloudflare Dashboard:**
> 1. Tạo bucket `reader-hub-data`
> 2. Enable Custom Domain (public access) hoặc dùng R2.dev subdomain
> 3. Tạo API Token với Edit permission → lưu Access Key ID & Secret Key
> 4. Cấu trúc thư mục: `stories/{story_slug}/chapters/{chapter_number}.json` và `stories/{story_slug}/cover.webp`

**JSON content format cho mỗi chapter:**
```json
{
  "story_slug": "tao-te-kinh",
  "chapter_number": 1,
  "title": "Chương 1: Khởi đầu",
  "paragraphs": ["Đoạn 1...", "Đoạn 2...", "..."],
  "word_count": 3200,
  "scraped_at": "2026-05-11T15:00:00Z"
}
```

---

## Phase 2: Scraping Engine (Tuần 2-3)

### Scraper Scripts (Python + Playwright)

#### [NEW] [scraper/requirements.txt](file:///e:/project/reader-hub/scraper/requirements.txt)
```
playwright==1.49.0
playwright-stealth==1.0.6
beautifulsoup4==4.12.3
boto3==1.35.0
supabase==2.10.0
python-dotenv==1.0.1
```

#### [NEW] [scraper/scraper.py](file:///e:/project/reader-hub/scraper/scraper.py)

Main scraper logic:
- **Input**: story source URL, chapter range (từ env vars / `client_payload`)
- **Process**: Playwright + stealth → navigate qua proxy → extract `<p>` tags → clean HTML (remove ads, scripts) → output `paragraphs[]`
- **Output**: Upload JSON to R2 via `boto3` (S3-compatible), update Supabase `chapters` table

#### [NEW] [scraper/r2_uploader.py](file:///e:/project/reader-hub/scraper/r2_uploader.py)

R2 upload helper:
```python
import boto3, json, os

s3 = boto3.client('s3',
    endpoint_url=f"https://{os.environ['CF_ACCOUNT_ID']}.r2.cloudflarestorage.com",
    aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
    region_name='auto'
)

def upload_chapter(story_slug, chapter_num, data):
    key = f"stories/{story_slug}/chapters/{chapter_num}.json"
    s3.put_object(Bucket='reader-hub-data', Key=key,
                  Body=json.dumps(data, ensure_ascii=False),
                  ContentType='application/json')
    return f"https://{os.environ['R2_PUBLIC_DOMAIN']}/{key}"
```

#### [NEW] [scraper/supabase_client.py](file:///e:/project/reader-hub/scraper/supabase_client.py)

Helper cập nhật metadata lên Supabase sau khi scrape xong.

### GitHub Actions Workflow

#### [NEW] [.github/workflows/scraper.yml](file:///e:/project/reader-hub/.github/workflows/scraper.yml)

```yaml
name: Story Scraper
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  repository_dispatch:
    types: [scrape-story]

jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - name: Install deps
        run: |
          pip install -r scraper/requirements.txt
          playwright install chromium
      - name: Run scraper
        run: python scraper/scraper.py
        env:
          STORY_SOURCE_URL: ${{ github.event.client_payload.source_url || '' }}
          CHAPTER_START: ${{ github.event.client_payload.chapter_start || '1' }}
          CHAPTER_END: ${{ github.event.client_payload.chapter_end || '10' }}
          PROXY_URL: ${{ secrets.PROXY_URL }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_PUBLIC_DOMAIN: ${{ secrets.R2_PUBLIC_DOMAIN }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```

**GitHub Secrets cần thiết:**

| Secret | Mô tả |
|--------|--------|
| `PROXY_URL` | URL proxy xoay vòng (e.g. `http://user:pass@proxy.example.com:port`) |
| `CF_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | R2 API Token Access Key |
| `R2_SECRET_ACCESS_KEY` | R2 API Token Secret Key |
| `R2_PUBLIC_DOMAIN` | R2 public domain (e.g. `data.reader-hub.com`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (bypass RLS) |
| `GITHUB_PAT` | GitHub PAT (for Edge Function dispatch) |

---

## Phase 3: Mobile App — React Native Expo (Tuần 4-5)

### Project Setup

```bash
npx -y create-expo-app@latest ./mobile --template blank-typescript
cd mobile
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
npx expo install react-native-tts react-native-track-player
npx expo install expo-build-properties
```

> [!WARNING]
> **`react-native-tts` và `react-native-track-player` yêu cầu Development Build** (không chạy được trên Expo Go). Cần dùng `eas build --profile development`.

### App Structure

```
mobile/
├── app/                        # Expo Router (file-based routing)
│   ├── _layout.tsx             # Root layout + Supabase auth provider
│   ├── (tabs)/
│   │   ├── _layout.tsx         # Tab navigator
│   │   ├── index.tsx           # Home — danh sách truyện HOT
│   │   ├── search.tsx          # Tìm kiếm truyện
│   │   └── library.tsx         # Thư viện / Lịch sử đọc
│   ├── story/[slug].tsx        # Chi tiết truyện + mục lục
│   └── reader/[chapterId].tsx  # Reader screen + TTS controls
├── components/
│   ├── StoryCard.tsx
│   ├── ChapterList.tsx
│   ├── ReaderView.tsx
│   └── TTSPlayer.tsx           # Play/Pause/Speed controls
├── lib/
│   ├── supabase.ts             # Supabase client init
│   ├── r2.ts                   # Fetch chapter content from R2
│   └── tts.ts                  # TTS engine wrapper
├── services/
│   └── playback-service.ts     # react-native-track-player service
└── app.json                    # Expo config + plugins
```

### Key Components

#### Supabase Client (`lib/supabase.ts`)
- Init `createClient()` with AsyncStorage adapter for auth persistence

#### R2 Content Fetcher (`lib/r2.ts`)
- `fetchChapter(r2Url)` → GET JSON → return `paragraphs[]`
- Offline cache layer using AsyncStorage

#### TTS Engine (`lib/tts.ts`)
- Wrapper around `react-native-tts`
- `speak(text)`, `pause()`, `resume()`, `setRate(speed)`, `setLanguage('vi-VN')`
- Chunk long text into sentences for smoother playback

#### Reader Screen (`app/reader/[chapterId].tsx`)
- ScrollView hiển thị paragraphs
- Floating TTS control bar (Play/Pause, Speed 0.5x–2.0x, Skip sentence)
- Settings: font size, background color (white/sepia/dark)
- Auto-save scroll position to `reading_history`

#### Background Audio (`services/playback-service.ts`)
- Register `TrackPlayer` for lock-screen controls
- Handle Remote events (Play, Pause, Next chapter)

### `app.json` Plugins Config

```json
{
  "expo": {
    "plugins": [
      "react-native-track-player",
      ["expo-build-properties", {
        "android": { "usesCleartextTraffic": true }
      }]
    ]
  }
}
```

---

## Phase 4: Testing & Release (Tuần 6)

### E2E Testing
1. Trigger scrape từ Supabase Edge Function → verify GitHub Actions chạy thành công
2. Check R2 bucket có file JSON mới
3. App fetch chapter → hiển thị nội dung → TTS đọc

### Performance Checks
- GitHub Actions: không vượt quá 30 phút/run, rate limit scraping (delay 2-5s giữa các chapter)
- R2: verify zero egress cost, CDN response time < 200ms
- App: test offline TTS (airplane mode), memory usage khi đọc chapter dài

### Build & Release
```bash
eas build --platform android --profile production  # → AAB/APK
```

---

## Open Questions

> [!IMPORTANT]
> **Cần bạn xác nhận trước khi bắt đầu code:**

1. **Proxy Provider**: Bạn đã có nhà cung cấp Rotating Proxy chưa? (e.g. BrightData, ScraperAPI, SmartProxy) — hay cần tích hợp free proxy list?

2. **Target Websites**: Danh sách chính xác các trang web cần cào? (truyenfull.vn, metruyenchu.com, v.v.) — mỗi site cần logic parser riêng.

3. **Supabase Region**: Confirm dùng Singapore region?

4. **Auth Flow**: Cần đăng nhập/đăng ký user không, hay app mở tự do (anonymous)?

5. **Bắt đầu từ Phase nào?** Tôi recommend bắt đầu từ Phase 1 (DB schema + R2 setup) → Phase 2 (scraper) → Phase 3 (app). Bạn muốn tôi bắt đầu code phase nào trước?

6. **React Native vs Flutter**: Kiến trúc plan dùng React Native (Expo). Bạn có prefer Flutter không?
