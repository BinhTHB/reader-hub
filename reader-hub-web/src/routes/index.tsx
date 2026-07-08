import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, ArrowRight, Eye, Star } from "lucide-react";
import { SiteLayout, StoryCard } from "@/components/site-layout";
import { GENRES, formatViews, type Story } from "@/lib/stories-data";
import { useStories } from "@/lib/stories-db";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { data: stories = [], isLoading } = useStories();
  const genreCounts = new Map<string, number>();
  for (const s of stories)
    for (const g of s.genres) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);

  if (isLoading || stories.length === 0) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-[1400px] px-6 py-40 text-center md:px-10">
          <p className="text-sm text-muted-foreground">Đang tải nội dung từ máy chủ…</p>
        </div>
      </SiteLayout>
    );
  }

  const featured = stories[0];
  const bento = stories.slice(1, 5);
  const latest = stories.slice(0, 8);
  const ranking = [...stories].sort((a, b) => b.views - a.views).slice(0, 5);

  return (
    <SiteLayout>
      <section className="mx-auto max-w-[1400px] px-6 pt-10 md:px-10 md:pt-16">
        <div className="flex items-center justify-between border-b border-border pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Vol. 01 — Số ra tuần này
          </p>
          <p className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground md:block">
            Cập nhật 07 · 07 · 2026
          </p>
        </div>

        <div className="mt-10 grid gap-10 md:grid-cols-12 md:gap-14">
          <div className="md:col-span-7">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              — Trang bìa
            </p>
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-[52px] leading-[0.95] tracking-tight md:text-[104px]">
              Truyện dành cho
              <br />
              <span className="italic text-muted-foreground">người đọc</span> thực thụ.
            </h1>
            <p className="mt-8 max-w-xl text-base text-muted-foreground md:text-lg">
              Reader Hub biên tập lại trải nghiệm đọc truyện online — không quảng cáo chớp nháy,
              không thẻ neon, chỉ có chữ, hình, và câu chuyện. Như một tạp chí bạn muốn giữ lại.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                to="/truyen/$slug/chuong/$chapter"
                params={{ slug: featured.slug, chapter: "1" }}
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition hover:bg-foreground/85"
              >
                Bắt đầu đọc <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/the-loai"
                className="inline-flex items-center gap-2 text-sm font-medium underline decoration-border decoration-1 underline-offset-8 hover:decoration-foreground"
              >
                Duyệt theo thể loại
              </Link>
            </div>

            <dl className="mt-16 grid max-w-lg grid-cols-3 gap-8 border-t border-border pt-8">
              {[
                { k: "Truyện", v: `${stories.length}` },
                { k: "Chương", v: `${stories.reduce((a, s) => a + s.chapters, 0)}` },
                { k: "Độc giả", v: formatViews(stories.reduce((a, s) => a + s.views, 0)) },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    {s.k}
                  </dt>
                  <dd className="mt-2 font-[family-name:var(--font-display)] text-3xl">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="md:col-span-5">
            <Link to="/truyen/$slug" params={{ slug: featured.slug }} className="group block">
              <figure className="relative overflow-hidden rounded-lg bg-secondary">
                <div className="aspect-[4/5]">
                  <img
                    src={featured.cover}
                    alt={featured.title}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]"
                  />
                </div>
                <div className="absolute right-4 top-4 rounded-full bg-background/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em]">
                  Editor's pick
                </div>
              </figure>
              <figcaption className="mt-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    {featured.genres[0]}
                  </p>
                  <p className="mt-2 font-[family-name:var(--font-display)] text-2xl leading-tight">
                    {featured.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Tác giả · {featured.author}</p>
                </div>
                <ArrowUpRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
              </figcaption>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-6 pt-32 md:px-10">
        <SectionHead
          eyebrow="Bộ sưu tập tuần"
          title="Đang được chú ý"
          subtitle="Bốn tác phẩm biên tập viên đánh dấu — mỗi cuốn một giọng kể."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-6 md:grid-rows-2 md:gap-5">
          <BentoBig story={bento[0]} className="md:col-span-4 md:row-span-2" />
          <BentoSmall story={bento[1]} className="md:col-span-2" />
          <BentoSmall story={bento[2]} className="md:col-span-1" />
          <BentoSmall story={bento[3]} className="md:col-span-1" dark />
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-6 pt-32 md:px-10">
        <SectionHead eyebrow="Mục lục" title="Duyệt theo thể loại" />
        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-border pt-4 md:grid-cols-5">
          {GENRES.map((g, i) => (
            <Link
              key={g.slug}
              to="/the-loai/$slug"
              params={{ slug: g.slug }}
              className="group flex items-baseline justify-between border-b border-border py-5 transition"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-[family-name:var(--font-display)] text-xl transition group-hover:italic">
                  {g.name}
                </span>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {genreCounts.get(g.name) ?? 0}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-6 pt-32 md:px-10">
        <div className="flex items-end justify-between gap-6 border-b border-border pb-6">
          <SectionHead eyebrow="Số mới" title="Vừa cập nhật" bare />
          <Link
            to="/"
            className="hidden shrink-0 items-center gap-1 text-sm font-medium underline decoration-border decoration-1 underline-offset-8 hover:decoration-foreground sm:inline-flex"
          >
            Xem tất cả <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-14 md:grid-cols-4">
          {latest.map((s) => (
            <StoryCard key={s.slug} {...s} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-6 pt-32 md:px-10">
        <SectionHead
          eyebrow="Bảng xếp hạng"
          title="Được đọc nhiều nhất"
          subtitle="Theo lượt đọc 30 ngày qua."
        />
        <ol className="mt-12 divide-y divide-border border-y border-border">
          {ranking.map((s, idx) => (
            <li key={s.slug}>
              <Link
                to="/truyen/$slug"
                params={{ slug: s.slug }}
                className="group grid grid-cols-[3rem_1fr_auto] items-center gap-6 py-6 md:grid-cols-[4rem_5rem_1fr_auto] md:gap-8"
              >
                <span className="font-[family-name:var(--font-display)] text-3xl text-muted-foreground tabular-nums md:text-4xl">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <img
                  src={s.cover}
                  alt={s.title}
                  loading="lazy"
                  className="hidden aspect-[3/4] w-20 rounded object-cover md:block"
                />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    {s.genres.join(" · ")}
                  </p>
                  <h3 className="mt-1.5 line-clamp-1 font-[family-name:var(--font-display)] text-2xl leading-tight transition group-hover:italic md:text-3xl">
                    {s.title}
                  </h3>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                    {s.author} — {s.description}
                  </p>
                </div>
                <div className="hidden items-center gap-6 text-xs text-muted-foreground md:flex">
                  <span className="inline-flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> {formatViews(s.views)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5" /> {s.rating}
                  </span>
                  <ArrowUpRight className="h-5 w-5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </SiteLayout>
  );
}

function SectionHead({
  eyebrow,
  title,
  subtitle,
  bare,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  bare?: boolean;
}) {
  return (
    <div className={bare ? "" : "border-b border-border pb-6"}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        — {eyebrow}
      </p>
      <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl leading-[1] md:text-6xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 max-w-xl text-sm text-muted-foreground md:text-base">{subtitle}</p>
      )}
    </div>
  );
}

function BentoBig({ story, className = "" }: { story: Story; className?: string }) {
  return (
    <Link
      to="/truyen/$slug"
      params={{ slug: story.slug }}
      className={`group relative overflow-hidden rounded-lg bg-secondary ${className}`}
    >
      <img
        src={story.banner ?? story.cover}
        alt={story.title}
        className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      <div className="relative flex h-full min-h-[420px] flex-col justify-end p-8 text-background md:min-h-[560px] md:p-12">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-background/70">
          {story.genres.join(" · ")}
        </p>
        <h3 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-4xl leading-[1] md:text-6xl">
          {story.title}
        </h3>
        <p className="mt-4 max-w-xl text-sm text-background/80 md:text-base">{story.description}</p>
        <div className="mt-6 flex items-center gap-6 text-xs text-background/70">
          <span>Tác giả · {story.author}</span>
          <span className="inline-flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" /> {formatViews(story.views)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5" /> {story.rating}
          </span>
        </div>
      </div>
    </Link>
  );
}

function BentoSmall({
  story,
  className = "",
  dark = false,
}: {
  story: Story;
  className?: string;
  dark?: boolean;
}) {
  return (
    <Link
      to="/truyen/$slug"
      params={{ slug: story.slug }}
      className={`group relative flex flex-col overflow-hidden rounded-lg border border-border ${dark ? "bg-foreground text-background" : "bg-card"} ${className}`}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <img
          src={story.cover}
          alt={story.title}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col justify-between gap-3 p-6">
        <div>
          <p
            className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${dark ? "text-background/60" : "text-muted-foreground"}`}
          >
            {story.genres[0]}
          </p>
          <h3 className="mt-2 line-clamp-2 font-[family-name:var(--font-display)] text-2xl leading-tight">
            {story.title}
          </h3>
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-xs ${dark ? "text-background/60" : "text-muted-foreground"}`}>
            {story.author}
          </span>
          <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}
