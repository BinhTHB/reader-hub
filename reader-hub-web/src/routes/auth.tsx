import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ArrowUpRight, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Đăng nhập — Reader Hub" },
      {
        name: "description",
        content: "Đăng nhập hoặc tạo tài khoản Reader Hub để lưu lịch sử đọc và truyện theo dõi.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/ca-nhan" });
  }, [session, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name || email.split("@")[0] } },
        });
        if (error) throw error;
      }
      navigate({ to: "/ca-nhan" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  }

  function useAdmin() {
    setEmail("admin@yomi.local");
    setPassword("admin123");
    setMode("login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-[family-name:var(--font-sans)]">
      <div className="mx-auto grid min-h-screen max-w-[1400px] px-6 md:grid-cols-2 md:px-10">
        <aside className="hidden flex-col justify-between border-r border-border py-16 pr-16 md:flex">
          <Link to="/" className="flex items-baseline gap-0.5">
            <span className="font-[family-name:var(--font-brand)] text-[28px] leading-none tracking-tight">
              Reader Hub
            </span>
            <span className="font-[family-name:var(--font-brand)] text-[28px] leading-none italic text-muted-foreground">
              /
            </span>
          </Link>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Chào mừng trở lại
            </p>
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-6xl leading-[1.02]">
              Đọc mọi lúc. <span className="italic text-muted-foreground">Mọi nơi.</span>
            </h1>
            <p className="mt-6 max-w-md text-sm text-muted-foreground">
              Đăng nhập để đồng bộ lịch sử đọc, theo dõi truyện yêu thích và nhận thông báo chương
              mới.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 Reader Hub.</p>
        </aside>

        <main className="flex flex-col justify-center py-16 md:pl-16">
          <div className="mx-auto w-full max-w-sm">
            <Link to="/" className="mb-10 flex items-baseline gap-0.5 md:hidden">
              <span className="font-[family-name:var(--font-brand)] text-[28px] leading-none tracking-tight">
                Reader Hub
              </span>
              <span className="font-[family-name:var(--font-brand)] text-[28px] leading-none italic text-muted-foreground">
                /
              </span>
            </Link>

            <div className="flex gap-6 border-b border-border">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`-mb-px border-b-2 py-3 text-sm font-medium transition ${mode === "login" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`-mb-px border-b-2 py-3 text-sm font-medium transition ${mode === "signup" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                Tạo tài khoản
              </button>
            </div>

            <h2 className="mt-10 font-[family-name:var(--font-display)] text-4xl leading-[1.05]">
              {mode === "login" ? (
                "Chào mừng trở lại"
              ) : (
                <>
                  Bắt đầu <span className="italic text-muted-foreground">đọc</span>
                </>
              )}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "login"
                ? "Nhập email và mật khẩu của bạn."
                : "Chỉ mất vài giây để tạo tài khoản Reader Hub."}
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              {mode === "signup" && (
                <Field label="Tên hiển thị">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full border-b border-border bg-transparent py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-foreground"
                  />
                </Field>
              )}
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="email@cua-ban.com"
                  className="w-full border-b border-border bg-transparent py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-foreground"
                />
              </Field>
              <Field label="Mật khẩu">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="w-full border-b border-border bg-transparent py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-foreground"
                />
              </Field>

              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-foreground text-sm font-medium text-background transition hover:bg-foreground/85 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
                {!busy && (
                  <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                )}
              </button>
            </form>

            <div className="mt-10 rounded-md border border-dashed border-border p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Tài khoản admin
              </p>
              <p className="mt-2 font-mono text-xs">
                admin@yomi.local <span className="text-muted-foreground">/</span> admin123
              </p>
              <button
                type="button"
                onClick={useAdmin}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
              >
                Điền sẵn <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
