// Static UI metadata (icons + display names) for genres.
// Actual stories & chapters come from Supabase — see src/lib/stories-db.ts.

export type Story = {
  id: number;
  slug: string;
  title: string;
  author: string;
  cover: string;
  banner: string;
  genres: string[];
  status: "Đang tiến hành" | "Hoàn thành" | "Tạm ngưng";
  rating: number;
  views: number;
  chapters: number;
  latestChapter: string;
  updatedAt: string;
  description: string;
};

export const GENRES = [
  { slug: "hanh-dong", name: "Hành động", icon: "⚔️" },
  { slug: "phieu-luu", name: "Phiêu lưu", icon: "🗺️" },
  { slug: "lang-man", name: "Lãng mạn", icon: "💖" },
  { slug: "huyen-huyen", name: "Huyền huyễn", icon: "🔮" },
  { slug: "khoa-huyen", name: "Khoa huyễn", icon: "🚀" },
  { slug: "hai-huoc", name: "Hài hước", icon: "😂" },
  { slug: "trinh-tham", name: "Trinh thám", icon: "🕵️" },
  { slug: "hoc-duong", name: "Học đường", icon: "🎒" },
  { slug: "kinh-di", name: "Kinh dị", icon: "👻" },
  { slug: "the-thao", name: "Thể thao", icon: "⚽" },
];

export const formatViews = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};

export const relativeTime = (iso: string | null | undefined) => {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày trước`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} tháng trước`;
  return `${Math.floor(mo / 12)} năm trước`;
};

export const R2_PUBLIC_DOMAIN =
  import.meta.env.VITE_R2_PUBLIC_DOMAIN ??
  process.env.VITE_R2_PUBLIC_DOMAIN ??
  "pub-3ccdfab0a8404fccb5c340426d452889.r2.dev";

export const toPublicAssetUrl = (value: string | null | undefined) => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${R2_PUBLIC_DOMAIN}/${value.replace(/^\/+/, "")}`;
};

const STATUS_MAP: Record<string, Story["status"]> = {
  ongoing: "Đang tiến hành",
  completed: "Hoàn thành",
  paused: "Tạm ngưng",
};

export type DbStoryRow = {
  id: number;
  slug: string;
  title: string;
  author: string | null;
  description: string | null;
  cover_url: string | null;
  genres: string[] | null;
  status: string;
  total_chapters: number;
  view_count: number;
  updated_at: string;
};

export const mapStory = (r: DbStoryRow): Story => {
  const cover = toPublicAssetUrl(r.cover_url);
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    author: r.author ?? "Đang cập nhật",
    cover,
    banner: cover.replace("w=600&h=800", "w=1600&h=700"),
    genres: r.genres ?? [],
    status: STATUS_MAP[r.status] ?? "Đang tiến hành",
    rating: 4.6,
    views: Number(r.view_count ?? 0),
    chapters: r.total_chapters,
    latestChapter: `Chương ${r.total_chapters}: Hồi thứ ${r.total_chapters}`,
    updatedAt: relativeTime(r.updated_at),
    description: r.description ?? "",
  };
};
