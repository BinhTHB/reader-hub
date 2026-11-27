import { useState, useEffect } from "react";
import { Moon, Sun, LogOut, User, ShieldCheck, Copy, Check, Trash2, RefreshCw, Database } from "lucide-react";
import { listScrapeSources, deleteScrapeSource, type ScrapeSourceRow } from "../../lib/admin";

interface ProfileScreenProps {
  onNavigate?: (screen: string) => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: (enabled: boolean) => void;
  user?: any;
  onLogout?: () => void;
  isAdmin?: boolean;
}

export function ProfileScreen({
  onNavigate,
  isDarkMode = false,
  onToggleDarkMode,
  user,
  onLogout,
  isAdmin = false,
}: ProfileScreenProps) {
  const [copied, setCopied] = useState(false);
  const [sources, setSources] = useState<ScrapeSourceRow[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const loadSources = async () => {
    if (!isAdmin) return;
    setLoadingSources(true);
    try {
      setSources(await listScrapeSources());
    } catch (err) {
      console.error("Failed to load scrape_sources:", err);
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    void loadSources();
  }, [isAdmin]);

  const handleRemoveSource = async (domain: string) => {
    try {
      await deleteScrapeSource(domain);
      setSources((prev) => prev.filter((s) => s.domain !== domain));
    } catch (err) {
      console.error("Failed to delete scrape source:", err);
    }
  };

  const displayName =
    user?.user_metadata?.display_name ||
    user?.email?.split("@")[0] ||
    "Quản trị viên";
  const userEmail = user?.email || "Chưa đăng nhập";

  const copyUserId = () => {
    if (!user?.id) return;
    navigator.clipboard?.writeText(user.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen pb-24 bg-background">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-secondary px-4 pt-12 pb-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg overflow-hidden shrink-0">
            {isAdmin ? (
              <ShieldCheck className="w-8 h-8 text-emerald-600" />
            ) : (
              <User className="w-8 h-8 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-medium text-white truncate">
                {displayName}
              </h1>
              {user && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    isAdmin
                      ? "bg-emerald-500/90 text-white"
                      : "bg-white/20 text-white"
                  }`}
                >
                  {isAdmin ? "Quản trị viên (Admin)" : "Chưa có quyền Admin"}
                </span>
              )}
            </div>
            <p className="text-sm text-white/80 truncate">{userEmail}</p>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-5">
        {/* Account Card */}
        {user ? (
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-border space-y-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">User ID</div>
              <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-xl px-3 py-2">
                <span className="text-xs font-mono truncate">{user.id}</span>
                <button
                  type="button"
                  onClick={copyUserId}
                  className="text-primary shrink-0 p-1 hover:bg-muted rounded"
                  title="Sao chép User ID"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {!isAdmin && (
              <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                Tài khoản hiện tại chỉ có quyền xem. Hãy cập nhật <code>profiles.role = &apos;admin&apos;</code> trong Supabase để mở khoá thêm/sửa/xoá truyện và chương.
              </p>
            )}

            <button
              onClick={onLogout}
              className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Đăng xuất
            </button>
          </div>
        ) : (
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-border text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Đăng nhập bằng tài khoản Admin để thêm, chỉnh sửa, xoá truyện/chương và kích hoạt cào dữ liệu.
            </p>
            <button
              onClick={() => onNavigate?.("auth")}
              className="w-full py-3 bg-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
            >
              Đăng nhập Admin
            </button>
          </div>
        )}

        {/* Appearance */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-2">
            Giao diện
          </h2>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                {isDarkMode ? (
                  <Moon className="w-5 h-5 text-primary" />
                ) : (
                  <Sun className="w-5 h-5 text-primary" />
                )}
                <span className="font-medium text-sm">Chế độ tối</span>
              </div>
              <button
                onClick={() => onToggleDarkMode?.(!isDarkMode)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  isDarkMode ? "bg-primary" : "bg-muted"
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full flex items-center justify-center transition-transform shadow-md ${
                    isDarkMode ? "translate-x-6" : ""
                  }`}
                >
                  {isDarkMode ? (
                    <Moon className="w-3 h-3 text-primary" />
                  ) : (
                    <Sun className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* AI Selector Cache (Admin only) */}
        {isAdmin && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Database className="w-4 h-4 text-primary" />
                Bộ nhớ AI Selectors ({sources.length})
              </h2>
              <button
                type="button"
                onClick={() => void loadSources()}
                className="text-xs text-primary flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingSources ? "animate-spin" : ""}`} />
                Làm mới
              </button>
            </div>
            <div className="bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
              {sources.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground text-center">
                  {loadingSources ? "Đang tải..." : "Chưa có domain nào được AI lưu cấu trúc."}
                </div>
              ) : (
                sources.map((src) => (
                  <div key={src.domain} className="flex items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{src.domain}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {src.model_name || "AI"} · {src.is_verified ? "Đã kiểm chứng" : "Chưa kiểm chứng"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRemoveSource(src.domain)}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 shrink-0"
                      title="Xoá cache để AI dò lại ở lần cào tới"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
