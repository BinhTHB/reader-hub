import { createPortal } from "react-dom";
import { Link, useLocation } from "@tanstack/react-router";
import { Pause, Play, SkipBack, SkipForward, PictureInPicture2, X, BookOpen } from "lucide-react";
import { useAudioPlayer } from "@/lib/audio-player";

function PlayerBody({ compact = false }: { compact?: boolean }) {
  const p = useAudioPlayer();
  if (!p.loaded) return null;
  return (
    <div className="flex w-full items-center gap-3">
      {p.cover ? (
        <img src={p.cover} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-white/10">
          <BookOpen className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] uppercase tracking-[0.16em] opacity-60">
          Chương {p.chapter} / {p.totalChapters}
        </p>
        <p className="truncate text-sm font-medium">{p.storyTitle}</p>
        {!compact && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-white/70 transition-[width] duration-300"
              style={{
                width: `${
                  p.paragraphs.length ? ((p.currentIndex + 1) / p.paragraphs.length) * 100 : 0
                }%`,
              }}
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={p.prev}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
          aria-label="Chương trước"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          onClick={p.toggle}
          className="grid h-10 w-10 place-items-center rounded-full bg-white text-black hover:bg-white/90"
          aria-label={p.isPlaying ? "Tạm dừng" : "Phát"}
        >
          {p.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <button
          onClick={p.next}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
          aria-label="Chương sau"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        {!compact && p.pipSupported && !p.pipActive && (
          <button
            onClick={() => p.openPiP()}
            className="ml-1 hidden h-9 w-9 place-items-center rounded-full hover:bg-white/10 md:grid"
            aria-label="Hình trong hình"
            title="Hình trong hình"
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>
        )}
        {!compact && (
          <button
            onClick={p.close}
            className="ml-1 grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function MiniPlayer() {
  const p = useAudioPlayer();
  const location = useLocation();
  if (!p.loaded) return null;
  const onOwnReader = location.pathname === `/truyen/${p.storySlug}/chuong/${p.chapter}`;

  return (
    <>
      {/* Floating in-app mini player */}
      {!onOwnReader && (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[60] flex justify-center px-3">
          <Link
            to="/truyen/$slug/chuong/$chapter"
            params={{
              slug: p.storySlug,
              chapter: String(p.chapter),
            }}
            className="pointer-events-auto w-full max-w-xl rounded-2xl border border-white/10 bg-black/85 p-3 text-white shadow-2xl backdrop-blur-xl"
            onClick={(e) => {
              // avoid navigating when user clicked a control
              const t = e.target as HTMLElement;
              if (t.closest("button")) e.preventDefault();
            }}
          >
            <PlayerBody />
          </Link>
        </div>
      )}

      {/* Document PiP portal */}
      {p.pipActive && p.pipMount
        ? createPortal(
            <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 p-4 text-white">
              <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-4">
                <PlayerBody />
              </div>
            </div>,
            p.pipMount,
          )
        : null}
    </>
  );
}
