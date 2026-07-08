import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Star, Eye, BookOpen, Clock, Heart, Share2, Bookmark, ChevronRight } from "lucide-react";
import { SiteLayout } from "@/components/site-layout";
import { formatViews } from "@/lib/stories-data";
import { useStories, useStoryBySlug } from "@/lib/stories-db";

export const Route = createFileRoute("/truyen/$slug")({
  component: StoryPage,
  notFoundComponent: NotFound,
  errorComponent: ErrorC,
  head: ({ params }) => ({
    meta: [{ title: `Truyện ${params.slug} — Reader Hub` }],
  }),
});

function StoryPage() {
  const { slug } = Route.useParams();
  const { data: s, isLoading } = useStoryBySlug(slug);
  const { data: allStories = [] } = useStories();
  if (isLoading) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-6xl px-4 py-24 text-center text-sm text-muted-foreground">
          Đang tải…
        </div>
      </SiteLayout>
    );
  }
  if (!s) return <NotFound />;

  const related = allStories
    .filter((x) => x.slug !== s.slug && x.genres.some((g: string) => s.genres.includes(g)))
    .slice(0, 6);
  const chapters = Array.from({ length: Math.min(s.chapters, 30) }, (_, i) => s.chapters - i);

  return (
    <SiteLayout>
      <div className="relative">
        <div className="absolute inset-0 h-72 overflow-hidden">
          <img
            src={s.banner ?? s.cover}
            alt=""
            className="h-full w-full object-cover blur-2xl opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 to-background" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pt-10 md:px-6">
          <div className="flex flex-col gap-6 md:flex-row md:gap-10">
            <img
              src={s.cover}
              alt={s.title}
              className="mx-auto h-72 w-52 shrink-0 rounded-2xl object-cover shadow-2xl shadow-primary/20 ring-4 ring-background md:mx-0"
            />
            <div className="flex-1">
              <div className="flex flex-wrap gap-2">
                {s.genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                  >
                    {g}
                  </span>
                ))}
              </div>
              <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-black md:text-5xl">
                {s.title}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Tác giả: <span className="font-semibold text-foreground">{s.author}</span>
              </p>

              <div className="mt-4 grid max-w-md grid-cols-4 gap-3 text-center">
                <Stat
                  icon={<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />}
                  label="Đánh giá"
                  value={String(s.rating)}
                />
                <Stat
                  icon={<Eye className="h-4 w-4 text-primary" />}
                  label="Lượt đọc"
                  value={formatViews(s.views)}
                />
                <Stat
                  icon={<BookOpen className="h-4 w-4 text-primary" />}
                  label="Chương"
                  value={String(s.chapters)}
                />
                <Stat
                  icon={<Clock className="h-4 w-4 text-primary" />}
                  label="Cập nhật"
                  value={s.updatedAt}
                  small
                />
              </div>

              <p className="mt-5 max-w-2xl text-sm leading-relaxed text-foreground/80 md:text-base">
                {s.description}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/truyen/$slug/chuong/$chapter"
                  params={{ slug: s.slug, chapter: "1" }}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/40 hover:brightness-110"
                >
                  <BookOpen className="h-4 w-4" /> Đọc từ đầu
                </Link>
                <Link
                  to="/truyen/$slug/chuong/$chapter"
                  params={{ slug: s.slug, chapter: String(s.chapters) }}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-semibold hover:border-primary hover:text-primary"
                >
                  Chương mới nhất <ChevronRight className="h-4 w-4" />
                </Link>
                <button className="grid h-11 w-11 place-items-center rounded-full border border-border hover:border-primary hover:text-primary">
                  <Heart className="h-4 w-4" />
                </button>
                <button className="grid h-11 w-11 place-items-center rounded-full border border-border hover:border-primary hover:text-primary">
                  <Bookmark className="h-4 w-4" />
                </button>
                <button className="grid h-11 w-11 place-items-center rounded-full border border-border hover:border-primary hover:text-primary">
                  <Share2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-black">
          Danh sách chương
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hiển thị {chapters.length} chương gần nhất
        </p>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {chapters.map((c) => (
            <Link
              key={c}
              to="/truyen/$slug/chuong/$chapter"
              params={{ slug: s.slug, chapter: String(c) }}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm transition hover:border-primary hover:bg-primary/5"
            >
              <span className="font-medium">Chương {c}</span>
              <span className="text-xs text-muted-foreground">{c === s.chapters ? "Mới" : ""}</span>
            </Link>
          ))}
        </div>
      </section>

      {related.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-12 md:px-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-black">
            Có thể bạn thích
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-6">
            {related.map((r) => (
              <Link key={r.slug} to="/truyen/$slug" params={{ slug: r.slug }} className="group">
                <div className="aspect-[3/4] overflow-hidden rounded-xl">
                  <img
                    src={r.cover}
                    alt={r.title}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <p className="mt-2 line-clamp-1 text-sm font-semibold group-hover:text-primary">
                  {r.title}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </SiteLayout>
  );
}

function Stat({
  icon,
  label,
  value,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-2 py-2">
      <div className="flex items-center justify-center gap-1">
        {icon}
        <span className={small ? "text-xs font-semibold" : "text-sm font-bold"}>{value}</span>
      </div>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function NotFound() {
  const { slug } = Route.useParams();
  return (
    <SiteLayout>
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">
          Không tìm thấy truyện
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Truyện "{slug}" không tồn tại.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Về trang chủ
        </Link>
      </div>
    </SiteLayout>
  );
}

function ErrorC({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <SiteLayout>
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Có lỗi xảy ra</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Thử lại
        </button>
      </div>
    </SiteLayout>
  );
}
