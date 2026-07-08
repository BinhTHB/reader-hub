import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { getDiagnostics } from "@/lib/diagnostics.functions";
import { SiteLayout } from "@/components/site-layout";
import type { ErrorComponentProps } from "@tanstack/react-router";

const diagnosticsQuery = {
  queryKey: ["diagnostics"] as const,
  queryFn: () => getDiagnostics(),
};

export const Route = createFileRoute("/chan-doan")({
  head: () => ({
    meta: [
      { title: "Chẩn đoán kết nối database" },
      {
        name: "description",
        content:
          "Kiểm tra kết nối tới Supabase và số lượng bản ghi trong public.stories và public.chapters.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(diagnosticsQuery),
  component: DiagnosticsPage,
  errorComponent: DiagnosticsErrorComponent,
  notFoundComponent: () => <div>Không tìm thấy</div>,
});

function DiagnosticsErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <SiteLayout>
      <div className="p-6">
        <h1 className="text-xl font-bold text-destructive">Lỗi chẩn đoán</h1>
        <pre className="mt-2 whitespace-pre-wrap text-sm">{error.message}</pre>
        <button
          className="mt-4 rounded bg-primary px-3 py-1 text-primary-foreground"
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Thử lại
        </button>
      </div>
    </SiteLayout>
  );
}

function DiagnosticsPage() {
  const { data } = useSuspenseQuery(diagnosticsQuery);
  const qc = useQueryClient();

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between border-b py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );

  return (
    <SiteLayout>
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-4 text-2xl font-bold">Chẩn đoán kết nối database</h1>

        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">Kết nối</h2>
          <Row label="Supabase URL" value={data.supabaseUrl || "(không có)"} />
          <Row
            label="public.stories"
            value={
              data.storiesError ? (
                <span className="text-destructive">{data.storiesError}</span>
              ) : (
                <>{data.storiesCount ?? 0} bản ghi</>
              )
            }
          />
          <Row
            label="public.chapters"
            value={
              data.chaptersError ? (
                <span className="text-destructive">{data.chaptersError}</span>
              ) : (
                <>{data.chaptersCount ?? 0} bản ghi</>
              )
            }
          />
        </section>

        <section className="mt-6 rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">5 truyện mới nhất (mẫu)</h2>
          {data.storiesSample.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bảng stories đang trống.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.storiesSample.map((s) => (
                <li key={s.id} className="font-mono">
                  #{s.id} — {s.slug} — {s.title}
                </li>
              ))}
            </ul>
          )}
        </section>

        <button
          className="mt-6 rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => qc.invalidateQueries({ queryKey: ["diagnostics"] })}
        >
          Làm mới
        </button>
      </div>
    </SiteLayout>
  );
}
