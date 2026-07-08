import { createFileRoute, Link, useRouter, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  List,
  Minus,
  Plus,
  Settings2,
  X,
  Headphones,
  Pause,
} from "lucide-react";
import { useStoryBySlug, useChapter, recordReadingProgress } from "@/lib/stories-db";
import { useAuth } from "@/hooks/use-auth";
import { useAudioPlayer } from "@/lib/audio-player";

export const Route = createFileRoute("/truyen/$slug_/chuong/$chapter")({
  component: ReaderPage,
  notFoundComponent: NotFound,
  errorComponent: ErrorC,
  head: ({ params }) => ({
    meta: [{ title: `Chương ${params.chapter} — Reader Hub` }],
  }),
});

type Theme = "paper" | "sepia" | "dark";

const THEMES: Record<
  Theme,
  { bg: string; fg: string; muted: string; line: string; panel: string; label: string }
> = {
  paper: {
    bg: "#f5f3ee",
    fg: "#141414",
    muted: "#6b6a63",
    line: "rgba(20,20,20,0.12)",
    panel: "rgba(255,255,255,0.75)",
    label: "Giấy",
  },
  sepia: {
    bg: "#efe6d3",
    fg: "#2a221a",
    muted: "#7a6a52",
    line: "rgba(42,34,26,0.15)",
    panel: "rgba(255,250,238,0.75)",
    label: "Sepia",
  },
  dark: {
    bg: "#111111",
    fg: "#e8e6df",
    muted: "#8a887f",
    line: "rgba(232,230,223,0.14)",
    panel: "rgba(24,24,24,0.75)",
    label: "Tối",
  },
};

function ReaderPage() {
  const { slug, chapter } = Route.useParams();
  const navigate = useNavigate();
  const { data: s, isLoading } = useStoryBySlug(slug);
  const { user } = useAuth();
  const audio = useAudioPlayer();
  const [theme, setTheme] = useState<Theme>("paper");
  const [fontSize, setFontSize] = useState(19);
  const [lineHeight, setLineHeight] = useState(1.85);
  const [showSettings, setShowSettings] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [progress, setProgress] = useState(0);

  const ch = Number.parseInt(chapter, 10) || 1;
  const { data: chapterRow } = useChapter(s?.id, ch);
  const paragraphs = useMemo(
    () => (chapterRow?.content ? chapterRow.content.split(/\n{2,}/) : []),
    [chapterRow],
  );
  const wordCount = useMemo(() => paragraphs.join(" ").split(/\s+/).length, [paragraphs]);
  const readMinutes = Math.max(1, Math.round(wordCount / 220));

  const contentRef = useRef<HTMLElement>(null);

  const chapterHeading = useMemo(
    () => (s?.latestChapter ?? "").replace(/^Chương\s+\d+:\s*/, "") || `Hồi thứ ${ch}`,
    [s, ch],
  );

  // Keep the audio player in sync when the chapter (or its content) changes.
  useEffect(() => {
    if (!s || !paragraphs.length) return;
    // If already loaded for a different chapter/story, reload
    const sameContext = audio.loaded && audio.storySlug === s.slug && audio.chapter === ch;
    if (sameContext) return;
    if (!audio.loaded) return; // don't auto-open player until user starts
    audio.load({
      storySlug: s.slug,
      storyTitle: s.title,
      author: s.author,
      chapter: ch,
      totalChapters: s.chapters,
      chapterTitle: chapterHeading,
      paragraphs,
      cover: s.cover,
      onPrev: () =>
        ch > 1 &&
        navigate({
          to: "/truyen/$slug/chuong/$chapter",
          params: { slug: s.slug, chapter: String(ch - 1) },
        }),
      onNext: () =>
        ch < s.chapters &&
        navigate({
          to: "/truyen/$slug/chuong/$chapter",
          params: { slug: s.slug, chapter: String(ch + 1) },
        }),
    });
    // auto-resume playback across chapter changes
    audio.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.slug, ch, paragraphs.length]);

  const handleToggleAudio = () => {
    if (!s || !paragraphs.length) return;
    if (audio.loaded && audio.storySlug === s.slug && audio.chapter === ch) {
      audio.toggle();
      return;
    }
    audio.load({
      storySlug: s.slug,
      storyTitle: s.title,
      author: s.author,
      chapter: ch,
      totalChapters: s.chapters,
      chapterTitle: chapterHeading,
      paragraphs,
      cover: s.cover,
      onPrev: () =>
        ch > 1 &&
        navigate({
          to: "/truyen/$slug/chuong/$chapter",
          params: { slug: s.slug, chapter: String(ch - 1) },
        }),
      onNext: () =>
        ch < s.chapters &&
        navigate({
          to: "/truyen/$slug/chuong/$chapter",
          params: { slug: s.slug, chapter: String(ch + 1) },
        }),
    });
    setTimeout(() => audio.play(), 0);
  };

  const audioActive = audio.loaded && audio.storySlug === (s?.slug ?? "") && audio.chapter === ch;

  useEffect(() => {
    if (user && s?.id) {
      recordReadingProgress(user.id, s.id, ch).catch(() => {});
    }
  }, [user, s?.id, ch]);

  useEffect(() => {
    const onScroll = () => {
      const el = contentRef.current;
      if (!el) return;
      const start = el.offsetTop;
      const total = el.offsetHeight - window.innerHeight;
      const y = window.scrollY - start;
      const p = Math.max(0, Math.min(1, y / Math.max(total, 1)));
      setProgress(p);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [ch]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [ch]);

  useEffect(() => {
    if (!s) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.tagName === "INPUT" ||
        (e.target as HTMLElement)?.tagName === "SELECT"
      )
        return;
      if (e.key === "ArrowLeft" && ch > 1) {
        navigate({
          to: "/truyen/$slug/chuong/$chapter",
          params: { slug: s.slug, chapter: String(ch - 1) },
        });
      } else if (e.key === "ArrowRight" && ch < s.chapters) {
        navigate({
          to: "/truyen/$slug/chuong/$chapter",
          params: { slug: s.slug, chapter: String(ch + 1) },
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ch, s, navigate]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center text-sm text-muted-foreground">
        Đang tải chương…
      </div>
    );
  }
  if (!s) return <NotFound />;

  const t = THEMES[theme];
  const prev = ch > 1 ? ch - 1 : null;
  const next = ch < s.chapters ? ch + 1 : null;

  return (
    <div
      className="min-h-screen font-[family-name:var(--font-sans)] antialiased transition-colors duration-500"
      style={{ backgroundColor: t.bg, color: t.fg }}
    >
      <div className="fixed left-0 right-0 top-0 z-50 h-[2px]" style={{ backgroundColor: t.line }}>
        <div
          className="h-full transition-[width] duration-150"
          style={{ width: `${progress * 100}%`, backgroundColor: t.fg }}
        />
      </div>

      <header
        className="sticky top-0 z-40 backdrop-blur-xl"
        style={{ backgroundColor: t.panel, borderBottom: `1px solid ${t.line}` }}
      >
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4 md:px-8">
          <Link
            to="/truyen/$slug"
            params={{ slug: s.slug }}
            className="inline-flex items-center gap-1.5 text-sm font-medium opacity-80 transition hover:opacity-100"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Trở về</span>
          </Link>
          <div className="mx-auto hidden min-w-0 flex-1 flex-col items-center md:flex">
            <p
              className="truncate text-[11px] uppercase tracking-[0.18em]"
              style={{ color: t.muted }}
            >
              {s.title}
            </p>
            <p className="font-[family-name:var(--font-display)] text-[15px] leading-none">
              Chương {ch}{" "}
              <span className="italic" style={{ color: t.muted }}>
                / {s.chapters}
              </span>
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={handleToggleAudio}
              className="grid h-9 w-9 place-items-center rounded-md transition hover:opacity-70"
              aria-label={audioActive && audio.isPlaying ? "Tạm dừng nghe" : "Nghe truyện"}
              title="Nghe truyện"
            >
              {audioActive && audio.isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Headphones className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => setShowChapters(true)}
              className="grid h-9 w-9 place-items-center rounded-md transition hover:opacity-70"
              aria-label="Danh sách chương"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-md transition hover:opacity-70"
              aria-label="Tuỳ chỉnh"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="border-t" style={{ borderColor: t.line, backgroundColor: t.panel }}>
            <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-5 md:grid-cols-3 md:px-8">
              <div>
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: t.muted }}
                >
                  Chủ đề
                </p>
                <div className="mt-3 flex gap-2">
                  {(Object.keys(THEMES) as Theme[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setTheme(k)}
                      className="flex-1 rounded-md border px-3 py-2 text-xs font-medium transition"
                      style={{
                        borderColor: theme === k ? t.fg : t.line,
                        backgroundColor: theme === k ? t.fg : "transparent",
                        color: theme === k ? t.bg : t.fg,
                      }}
                    >
                      {THEMES[k].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: t.muted }}
                >
                  Cỡ chữ · {fontSize}px
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => setFontSize((v) => Math.max(14, v - 1))}
                    className="grid h-9 w-9 place-items-center rounded-md border transition hover:opacity-70"
                    style={{ borderColor: t.line }}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <div
                    className="flex-1 rounded-md border px-3 py-2 text-center text-sm"
                    style={{ borderColor: t.line }}
                  >
                    <span
                      style={{ fontSize: `${fontSize}px` }}
                      className="font-[family-name:var(--font-display)]"
                    >
                      Aa
                    </span>
                  </div>
                  <button
                    onClick={() => setFontSize((v) => Math.min(28, v + 1))}
                    className="grid h-9 w-9 place-items-center rounded-md border transition hover:opacity-70"
                    style={{ borderColor: t.line }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: t.muted }}
                >
                  Giãn dòng · {lineHeight.toFixed(2)}
                </p>
                <div className="mt-3 flex gap-2">
                  {[1.6, 1.85, 2.1].map((v) => (
                    <button
                      key={v}
                      onClick={() => setLineHeight(v)}
                      className="flex-1 rounded-md border px-3 py-2 text-xs font-medium transition"
                      style={{
                        borderColor: lineHeight === v ? t.fg : t.line,
                        backgroundColor: lineHeight === v ? t.fg : "transparent",
                        color: lineHeight === v ? t.bg : t.fg,
                      }}
                    >
                      {v === 1.6 ? "Gọn" : v === 1.85 ? "Vừa" : "Thoáng"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      <article ref={contentRef} className="mx-auto max-w-[680px] px-5 pb-24 pt-14 md:px-8 md:pt-20">
        <div
          className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em]"
          style={{ color: t.muted }}
        >
          <BookOpen className="h-3 w-3" />
          <span>Chương {ch}</span>
          <span>·</span>
          <span>{readMinutes} phút đọc</span>
          <span>·</span>
          <span>{wordCount.toLocaleString()} từ</span>
        </div>

        <h1 className="mt-5 font-[family-name:var(--font-display)] text-4xl leading-[1.1] md:text-6xl">
          {s.latestChapter.replace(/^Chương\s+\d+:\s*/, "") || `Hồi thứ ${ch}`}
        </h1>
        <p className="mt-4 flex items-center gap-2 text-sm" style={{ color: t.muted }}>
          <Link
            to="/truyen/$slug"
            params={{ slug: s.slug }}
            className="underline-offset-4 hover:underline"
          >
            {s.title}
          </Link>
          <span>·</span>
          <span className="italic">{s.author}</span>
        </p>

        <div className="mt-10 h-px w-16" style={{ backgroundColor: t.fg }} />

        <div
          className="mt-10 space-y-6 font-[family-name:var(--font-display)]"
          style={{ fontSize: `${fontSize}px`, lineHeight, color: t.fg }}
        >
          {paragraphs.map((p: string, i: number) => (
            <p
              key={i}
              className={
                i === 0
                  ? "first-letter:float-left first-letter:mr-2 first-letter:font-[family-name:var(--font-display)] first-letter:text-6xl first-letter:leading-[0.85] first-letter:italic"
                  : ""
              }
            >
              {p}
            </p>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <p className="text-[10px] uppercase tracking-[0.25em]" style={{ color: t.muted }}>
            — Hết chương {ch} —
          </p>
          <div className="h-px w-24" style={{ backgroundColor: t.line }} />
        </div>

        <div className="mt-12 grid gap-3 md:grid-cols-2">
          {prev ? (
            <Link
              to="/truyen/$slug/chuong/$chapter"
              params={{ slug: s.slug, chapter: String(prev) }}
              className="group flex items-center gap-4 rounded-lg border p-5 transition hover:-translate-y-0.5"
              style={{ borderColor: t.line }}
            >
              <ArrowLeft className="h-4 w-4 shrink-0 transition group-hover:-translate-x-1" />
              <div className="min-w-0 text-left">
                <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: t.muted }}>
                  Chương trước
                </p>
                <p className="mt-1 truncate font-[family-name:var(--font-display)] text-lg">
                  Chương {prev}
                </p>
              </div>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link
              to="/truyen/$slug/chuong/$chapter"
              params={{ slug: s.slug, chapter: String(next) }}
              className="group flex items-center gap-4 rounded-lg border p-5 text-right transition hover:-translate-y-0.5 md:justify-end"
              style={{ borderColor: t.line, backgroundColor: t.fg, color: t.bg }}
            >
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">Chương sau</p>
                <p className="mt-1 truncate font-[family-name:var(--font-display)] text-lg">
                  Chương {next}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-1" />
            </Link>
          ) : (
            <div
              className="flex items-center justify-center rounded-lg border p-5 text-sm italic"
              style={{ borderColor: t.line, color: t.muted }}
            >
              Bạn đã đọc đến chương mới nhất.
            </div>
          )}
        </div>
      </article>

      <div
        className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit items-center gap-1 rounded-full border px-1.5 py-1.5 shadow-lg backdrop-blur-xl"
        style={{
          borderColor: t.line,
          backgroundColor: t.panel,
          boxShadow: `0 10px 30px ${t.line}`,
        }}
      >
        <button
          onClick={() =>
            prev &&
            navigate({
              to: "/truyen/$slug/chuong/$chapter",
              params: { slug: s.slug, chapter: String(prev) },
            })
          }
          disabled={!prev}
          className="grid h-9 w-9 place-items-center rounded-full transition hover:opacity-70 disabled:opacity-30"
          aria-label="Chương trước"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => setShowChapters(true)}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition hover:opacity-70"
        >
          Chương {ch} / {s.chapters}
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          onClick={() =>
            next &&
            navigate({
              to: "/truyen/$slug/chuong/$chapter",
              params: { slug: s.slug, chapter: String(next) },
            })
          }
          disabled={!next}
          className="grid h-9 w-9 place-items-center rounded-full transition hover:opacity-70 disabled:opacity-30"
          aria-label="Chương sau"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {showChapters && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowChapters(false)}>
          <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="relative flex h-full w-full max-w-md flex-col"
            style={{ backgroundColor: t.bg, color: t.fg, borderLeft: `1px solid ${t.line}` }}
          >
            <div
              className="flex items-center justify-between border-b p-5"
              style={{ borderColor: t.line }}
            >
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: t.muted }}>
                  Danh sách
                </p>
                <p className="font-[family-name:var(--font-display)] text-2xl">
                  {s.chapters} chương
                </p>
              </div>
              <button
                onClick={() => setShowChapters(false)}
                className="grid h-9 w-9 place-items-center rounded-md transition hover:opacity-70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {Array.from({ length: Math.min(s.chapters, 200) }).map((_, i) => {
                const n = i + 1;
                const active = n === ch;
                return (
                  <Link
                    key={n}
                    to="/truyen/$slug/chuong/$chapter"
                    params={{ slug: s.slug, chapter: String(n) }}
                    onClick={() => setShowChapters(false)}
                    className="flex items-baseline justify-between gap-3 rounded-md px-3 py-2.5 text-sm transition"
                    style={{
                      backgroundColor: active ? t.fg : "transparent",
                      color: active ? t.bg : t.fg,
                    }}
                  >
                    <span className="flex items-baseline gap-3">
                      <span
                        className="w-8 text-right text-[11px] tabular-nums"
                        style={{ color: active ? t.bg : t.muted }}
                      >
                        {String(n).padStart(3, "0")}
                      </span>
                      <span className="font-[family-name:var(--font-display)]">Chương {n}</span>
                    </span>
                    {active && (
                      <span className="text-[10px] uppercase tracking-[0.2em]">Đang đọc</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-4xl">Không tìm thấy chương</h1>
      <Link
        to="/"
        className="mt-6 inline-flex rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background"
      >
        Về trang chủ
      </Link>
    </div>
  );
}

function ErrorC({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Có lỗi xảy ra</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-6 rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background"
      >
        Thử lại
      </button>
    </div>
  );
}
