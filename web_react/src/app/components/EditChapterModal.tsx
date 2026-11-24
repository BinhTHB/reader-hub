import { useState, type FormEvent } from "react";
import { RefreshCw, X } from "lucide-react";
import { updateChapter, type AdminChapter } from "../../lib/admin";

interface EditChapterModalProps {
  chapter: AdminChapter;
  onClose: () => void;
  onSaved: (updated: AdminChapter) => void;
}

export function EditChapterModal({ chapter, onClose, onSaved }: EditChapterModalProps) {
  const [chapterNumber, setChapterNumber] = useState(String(chapter.chapter_number));
  const [title, setTitle] = useState(chapter.title || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const num = Number(chapterNumber);
    if (!Number.isInteger(num) || num <= 0) {
      setError("Số chương phải là số nguyên dương.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateChapter(chapter.id, {
        chapter_number: num,
        title: title.trim() || null,
      });
      onSaved(updated);
    } catch (err: any) {
      setError(err?.message || "Không thể cập nhật chương.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Chỉnh sửa chương</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Số chương *
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={chapterNumber}
              onChange={(e) => setChapterNumber(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-background rounded-xl border border-border focus:border-primary focus:outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Tiêu đề chương
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Chương ${chapterNumber || chapter.chapter_number}`}
              className="w-full px-3 py-2.5 bg-background rounded-xl border border-border focus:border-primary focus:outline-none text-sm"
            />
          </div>

          <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <div>Số từ: <span className="text-foreground font-medium">{chapter.word_count ?? 0}</span></div>
            <div>Trạng thái cào: <span className="text-foreground font-medium">{chapter.is_scraped ? "Đã cào" : "Chưa cào"}</span></div>
            {chapter.text_r2_url && (
              <div className="truncate">R2: <span className="text-foreground">{chapter.text_r2_url}</span></div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 py-2.5 bg-muted text-foreground rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isSaving ? "Đang lưu..." : "Lưu chương"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
