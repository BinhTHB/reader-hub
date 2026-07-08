import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site-layout";
import { GENRES } from "@/lib/stories-data";
import { useStories } from "@/lib/stories-db";

export const Route = createFileRoute("/the-loai")({
  component: GenresPage,
  head: () => ({
    meta: [
      { title: "Thể loại — Reader Hub" },
      { name: "description", content: "Duyệt tất cả thể loại truyện trên Reader Hub." },
    ],
  }),
});

function GenresPage() {
  const { data: stories = [] } = useStories();
  const counts = new Map<string, number>();
  for (const s of stories) for (const g of s.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
  return (
    <SiteLayout>
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">
          Tất cả thể loại
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Chọn thể loại để khám phá truyện.</p>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {GENRES.map((g) => (
            <Link
              key={g.slug}
              to="/the-loai/$slug"
              params={{ slug: g.slug }}
              className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-1 hover:border-primary hover:shadow-lg hover:shadow-primary/10"
            >
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 text-3xl transition group-hover:scale-110">
                {g.icon}
              </div>
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-lg font-bold group-hover:text-primary">
                  {g.name}
                </h3>
                <p className="text-xs text-muted-foreground">{counts.get(g.name) ?? 0} truyện</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </SiteLayout>
  );
}
