import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Trash2,
  Pencil,
  Search,
  CheckSquare,
  Square,
} from "lucide-react";
import { supabase, R2_PUBLIC_DOMAIN } from "../../lib/supabase";
import {
  deleteContent,
  type AdminChapter,
  type AdminStory,
} from "../../lib/admin";
import { EditStoryModal } from "../components/EditStoryModal";
import { EditChapterModal } from "../components/EditChapterModal";

interface DetailScreenProps {
  book?: any;
  onBack: () => void;
  isAdmin?: boolean;
}

export function DetailScreen({
  book,
  onBack,
  isAdmin = false,
}: DetailScreenProps) {
  const [story, setStory] = useState<AdminStory | null>(null);
  const [chapters, setChapters] = useState<AdminChapter[]>([]);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [expandedChapters, setExpandedChapters] = useState(true);
  const [isDescending, setIsDescending] = useState(true);
  const [chapterQuery, setChapterQuery] = useState("");
  const [showFullDescription, setShowFullDescription] = useState(false);

  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [latestChapterInfo, setLatestChapterInfo] = useState<{
    chapter_number: number;
    title: string;
  } | null>(null);
  const [showScrapeConfirm, setShowScrapeConfirm] = useState(false);

  const [showEditStoryModal, setShowEditStoryModal] = useState(false);
  const [editingChapter, setEditingChapter] = useState<AdminChapter | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "story" | "chapter" | "bulk";
    id?: number;
    name: string;
  } | null>(null);

  useEffect(() => {
    if (book?.id) {
      void loadStoryDetails();
      void loadChapters();
    }
  }, [book?.id]);

  const loadStoryDetails = async () => {
    try {
      const { data, error } = await supabase
        .from("stories")
        .select(
          "id, slug, title, author, description, cover_url, source_url, genres, status, total_chapters, view_count, is_featured, updated_at",
        )
        .eq("id", book.id)
        .single();

      if (error) throw error;
      setStory(data as AdminStory);
    } catch (err) {
      console.error("Failed to load story details:", err);
    }
  };

  const loadChapters = async () => {
    setIsLoadingChapters(true);
    try {
      let allChapters: AdminChapter[] = [];
      let from = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("chapters")
          .select(
            "id, story_id, chapter_number, title, word_count, text_r2_url, source_url, is_scraped, created_at",
          )
          .eq("story_id", book.id)
          .order("chapter_number", { ascending: true })
          .range(from, from + limit - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allChapters = [...allChapters, ...(data as AdminChapter[])];
          if (data.length < limit) {
            hasMore = false;
          } else {
            from += limit;
          }
        } else {
          hasMore = false;
        }
      }

      setChapters(allChapters);
    } catch (err) {
      console.error("Failed to load chapters:", err);
    } finally {
      setIsLoadingChapters(false);
    }
  };

  const bookData: Partial<AdminStory> & { id?: number; title: string } =
    story ||
    book || {
      cover_url: null,
      title: "Đang tải...",
      author: "Đang tải...",
      description: "",
      total_chapters: 0,
      genres: [],
      status: "ongoing",
    };

  const filteredChapters = useMemo(() => {
    const q = chapterQuery.trim().toLowerCase();
    const list = q
      ? chapters.filter(
          (ch) =>
            String(ch.chapter_number).includes(q) ||
            (ch.title || "").toLowerCase().includes(q),
        )
      : chapters;
    return isDescending ? [...list].reverse() : list;
  }, [chapters, chapterQuery, isDescending]);

  const handleCheckLatest = async () => {
    if (!bookData.source_url) return;
    setIsUpdating(true);
    setUpdateMessage(null);
    setLatestChapterInfo(null);
    setShowScrapeConfirm(false);
    try {
      const { data, error } = await supabase.functions.invoke(
        "trigger-scraper",
        {
          body: {
            source_url: bookData.source_url,
            action: "check_latest",
          },
        },
      );

      if (error) throw error;
      if (data && data.success && data.latest) {
        setLatestChapterInfo(data.latest);
        setShowScrapeConfirm(true);
        const currentTotal = chapters.length;
        if (data.latest.chapter_number > currentTotal) {
          setUpdateMessage(
            `Phát hiện chương mới! Nguồn có ${data.latest.chapter_number} chương (Hiện tại có ${currentTotal} chương).`,
          );
        } else {
          setUpdateMessage(
            `Truyện đã cập nhật đầy đủ (Nguồn có ${data.latest.chapter_number} chương, hiện tại có ${currentTotal} chương).`,
          );
        }
      } else {
        throw new Error("Không lấy được thông tin chương mới");
      }
    } catch (err: any) {
      console.error("Failed to check latest chapter:", err);
      setUpdateMessage(
        `Lỗi: ${err.message || "Không thể kiểm tra chương mới"}`,
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStartScrape = async () => {
    if (!bookData.source_url || !bookData.id) return;
    setIsUpdating(true);
    setUpdateMessage(null);
    try {
      const { error } = await supabase.functions.invoke("trigger-scraper", {
        body: {
          story_id: bookData.id,
          source_url: bookData.source_url,
          chapter_start: 1,
          chapter_limit: 0,
          action: "scrape",
        },
      });

      if (error) throw error;
      setUpdateMessage(
        "Đã gửi yêu cầu cào chương mới thành công! Hệ thống đang cào trong nền...",
      );
      setShowScrapeConfirm(false);
    } catch (err: any) {
      console.error("Failed to trigger scrape:", err);
      setUpdateMessage(`Lỗi: ${err.message || "Không thể bắt đầu cào"}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const executeDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setDeleteProgress(null);

    try {
      if (deleteTarget.type === "story" && deleteTarget.id) {
        await deleteContent("story", deleteTarget.id);
        setDeleteTarget(null);
        onBack();
        return;
      }

      if (deleteTarget.type === "chapter" && deleteTarget.id) {
        await deleteContent("chapter", deleteTarget.id);
        setChapters((prev) => prev.filter((ch) => ch.id !== deleteTarget.id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteTarget.id!);
          return next;
        });
        setDeleteTarget(null);
        setUpdateMessage("Đã xoá chương thành công.");
        return;
      }

      if (deleteTarget.type === "bulk") {
        const ids = Array.from(selectedIds);
        const deleted = new Set<number>();
        for (let i = 0; i < ids.length; i++) {
          setDeleteProgress(`Đang xoá ${i + 1}/${ids.length}...`);
          await deleteContent("chapter", ids[i]);
          deleted.add(ids[i]);
        }
        setChapters((prev) => prev.filter((ch) => !deleted.has(ch.id)));
        setSelectedIds(new Set());
        setSelectMode(false);
        setDeleteTarget(null);
        setUpdateMessage(`Đã xoá ${deleted.size} chương.`);
      }
    } catch (err: any) {
      console.error("Failed to delete:", err);
      setUpdateMessage(`Lỗi: ${err?.message || "Không thể xoá"}`);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
      setDeleteProgress(null);
    }
  };

  const getCoverUrl = (coverUrl?: string | null) => {
    if (!coverUrl)
      return "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300&h=450&fit=crop";
    if (coverUrl.startsWith("http")) return coverUrl;
    return `https://${R2_PUBLIC_DOMAIN}/${coverUrl}`;
  };

  return (
    <div className="min-h-screen pb-16">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 px-4 py-3 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="p-2 hover:bg-muted rounded-full transition-colors shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-medium text-sm truncate">Quản lý truyện</span>
        </div>
        {isAdmin && bookData.id && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowEditStoryModal(true)}
              className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium inline-flex items-center gap-1"
            >
              <Pencil className="w-3.5 h-3.5" /> Sửa truyện
            </button>
            <button
              onClick={() =>
                setDeleteTarget({
                  type: "story",
                  id: bookData.id,
                  name: bookData.title,
                })
              }
              className="p-2 hover:bg-red-500/10 rounded-full transition-colors text-red-500"
              title="Xoá truyện"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Story Info */}
      <div className="px-4 pt-5 space-y-5">
        <div className="flex gap-4">
          <div className="w-24 aspect-[2/3] rounded-xl overflow-hidden shadow-md shrink-0 bg-muted">
            <img
              src={getCoverUrl(bookData.cover_url)}
              alt={bookData.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-medium leading-snug mb-1">
              {bookData.title}
            </h1>
            <p className="text-xs text-muted-foreground mb-2">
              {bookData.author || "Chưa rõ tác giả"}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
              <span>{bookData.total_chapters || chapters.length} chương</span>
              <span>•</span>
              <span className="capitalize">{bookData.status || "ongoing"}</span>
              {bookData.slug && (
                <>
                  <span>•</span>
                  <span className="font-mono text-[11px] truncate max-w-[140px]">
                    {bookData.slug}
                  </span>
                </>
              )}
            </div>
            {bookData.genres && bookData.genres.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {bookData.genres.slice(0, 3).map((genre: string, idx: number) => (
                  <span
                    key={idx}
                    className="text-[11px] px-2.5 py-0.5 bg-primary/10 text-primary rounded-full"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Scraper Controls (Admin only) */}
        {isAdmin && bookData.source_url && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleCheckLatest}
              disabled={isUpdating}
              className="px-4 py-2.5 border border-primary text-primary bg-transparent rounded-xl text-xs font-medium hover:bg-primary/5 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <RefreshCw
                className={`w-4 h-4 ${isUpdating && !showScrapeConfirm ? "animate-spin" : ""}`}
              />
              {isUpdating && !showScrapeConfirm
                ? "Đang kiểm tra..."
                : "Kiểm tra chương mới"}
            </button>

            {showScrapeConfirm && (
              <button
                onClick={handleStartScrape}
                disabled={
                  isUpdating ||
                  (latestChapterInfo
                    ? latestChapterInfo.chapter_number <= chapters.length
                    : true)
                }
                className="px-4 py-2.5 bg-red-600 text-white rounded-xl text-xs font-medium hover:bg-red-700 transition-colors disabled:bg-muted disabled:text-muted-foreground disabled:opacity-50"
              >
                {isUpdating && showScrapeConfirm
                  ? "Đang gửi..."
                  : "Cào chương mới"}
              </button>
            )}
          </div>
        )}

        {/* Feedback Banner */}
        {updateMessage && (
          <div
            className={`p-3 rounded-xl border text-xs ${
              updateMessage.startsWith("Lỗi")
                ? "bg-red-500/10 border-red-500/20 text-red-500"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
            }`}
          >
            {updateMessage}
          </div>
        )}

        {/* Description */}
        {bookData.description && (
          <section>
            <h2 className="text-sm font-medium mb-2">Mô tả</h2>
            <div className="bg-card rounded-xl p-3.5 border border-border/60">
              <p
                className={`text-xs text-muted-foreground leading-relaxed ${
                  !showFullDescription ? "line-clamp-3" : ""
                }`}
              >
                {bookData.description}
              </p>
              {bookData.description.length > 150 && (
                <button
                  onClick={() => setShowFullDescription(!showFullDescription)}
                  className="text-xs text-primary font-medium mt-1.5"
                >
                  {showFullDescription ? "Thu gọn" : "Xem thêm"}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Chapter Manager */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setExpandedChapters(!expandedChapters)}
              className="flex items-center gap-2 text-sm font-medium"
            >
              <span>Danh sách chương ({chapters.length})</span>
              {expandedChapters ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            <div className="flex items-center gap-1.5">
              {chapters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsDescending(!isDescending)}
                  className="text-xs px-2.5 py-1 border border-border rounded-lg hover:bg-muted text-muted-foreground"
                >
                  {isDescending ? "Mới nhất" : "Cũ nhất"}
                </button>
              )}
              {isAdmin && chapters.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode((v) => !v);
                    setSelectedIds(new Set());
                  }}
                  className={`text-xs px-2.5 py-1 border rounded-lg ${
                    selectMode
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {selectMode ? "Xong" : "Chọn nhiều"}
                </button>
              )}
            </div>
          </div>

          {expandedChapters && (
            <>
              {chapters.length > 0 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Tìm số chương hoặc tiêu đề..."
                    value={chapterQuery}
                    onChange={(e) => setChapterQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-card rounded-xl border border-border text-xs focus:border-primary focus:outline-none"
                  />
                </div>
              )}

              {isAdmin && selectMode && (
                <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-xl p-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIds(
                          new Set(filteredChapters.map((c) => c.id)),
                        )
                      }
                      className="text-xs text-primary font-medium px-2 py-1"
                    >
                      Chọn tất cả ({filteredChapters.length})
                    </button>
                    {selectedIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        className="text-xs text-muted-foreground px-2 py-1"
                      >
                        Bỏ chọn
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={selectedIds.size === 0}
                    onClick={() =>
                      setDeleteTarget({
                        type: "bulk",
                        name: `${selectedIds.size} chương đã chọn`,
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium disabled:opacity-40"
                  >
                    Xoá đã chọn ({selectedIds.size})
                  </button>
                </div>
              )}

              {isLoadingChapters ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : filteredChapters.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  {chapterQuery
                    ? "Không có chương nào khớp tìm kiếm"
                    : "Chưa có chương nào"}
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {filteredChapters.map((chapter) => {
                    const checked = selectedIds.has(chapter.id);
                    return (
                      <div
                        key={chapter.id}
                        onClick={() => {
                          if (selectMode && isAdmin) {
                            toggleSelect(chapter.id);
                          } else if (isAdmin) {
                            setEditingChapter(chapter);
                          }
                        }}
                        className="flex items-center justify-between gap-2 p-3 bg-card rounded-xl border border-border/60 hover:border-primary/40 cursor-pointer transition-colors"
                      >
                        {selectMode && isAdmin && (
                          <div className="shrink-0 text-primary">
                            {checked ? (
                              <CheckSquare className="w-4 h-4" />
                            ) : (
                              <Square className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-medium truncate">
                            Chương {chapter.chapter_number}:{" "}
                            {chapter.title || `Chương ${chapter.chapter_number}`}
                          </h4>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {chapter.word_count || 0} từ ·{" "}
                            {new Date(chapter.created_at).toLocaleDateString(
                              "vi-VN",
                            )}
                          </p>
                        </div>

                        {isAdmin && !selectMode && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingChapter(chapter);
                              }}
                              className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-primary"
                              title="Sửa chương"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({
                                  type: "chapter",
                                  id: chapter.id,
                                  name: `Chương ${chapter.chapter_number}`,
                                });
                              }}
                              className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-500"
                              title="Xoá chương"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => !isDeleting && setDeleteTarget(null)}
        >
          <div
            className="bg-card w-full max-w-sm rounded-3xl p-6 shadow-xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="text-lg font-medium mb-1.5">Xác nhận xoá</h3>
              <p className="text-sm text-muted-foreground">
                {deleteTarget.type === "story"
                  ? `Xoá truyện "${deleteTarget.name}"? Toàn bộ chương và dữ liệu R2 sẽ bị xoá vĩnh viễn.`
                  : `Xoá ${deleteTarget.name}? Dữ liệu trên DB và R2 sẽ bị xoá vĩnh viễn.`}
              </p>
              {deleteProgress && (
                <p className="text-xs text-primary mt-2">{deleteProgress}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 bg-muted text-foreground rounded-xl font-medium"
              >
                Huỷ
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={executeDelete}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {isDeleting ? "Đang xoá..." : "Xoá"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditStoryModal && bookData.id && (
        <EditStoryModal
          story={bookData as AdminStory}
          onClose={() => setShowEditStoryModal(false)}
          onSaved={(updated) => {
            setStory(updated);
            setShowEditStoryModal(false);
            setUpdateMessage("Đã cập nhật thông tin truyện thành công.");
          }}
        />
      )}

      {editingChapter && (
        <EditChapterModal
          chapter={editingChapter}
          onClose={() => setEditingChapter(null)}
          onSaved={(updated) => {
            setChapters((prev) =>
              prev
                .map((c) => (c.id === updated.id ? updated : c))
                .sort((a, b) => a.chapter_number - b.chapter_number),
            );
            setEditingChapter(null);
            setUpdateMessage(
              `Đã cập nhật Chương ${updated.chapter_number}.`,
            );
          }}
        />
      )}
    </div>
  );
}
