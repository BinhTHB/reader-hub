import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type LoadArgs = {
  storySlug: string;
  storyTitle: string;
  author?: string;
  chapter: number;
  totalChapters: number;
  chapterTitle: string;
  paragraphs: string[];
  cover?: string;
  onPrev?: () => void;
  onNext?: () => void;
};

type Ctx = {
  loaded: boolean;
  isPlaying: boolean;
  currentIndex: number;
  paragraphs: string[];
  storyTitle: string;
  chapterTitle: string;
  chapter: number;
  totalChapters: number;
  storySlug: string;
  cover?: string;
  rate: number;
  pitch: number;
  voices: SpeechSynthesisVoice[];
  voiceURI: string | null;
  pipSupported: boolean;
  pipActive: boolean;
  load: (args: LoadArgs) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seekIndex: (i: number) => void;
  next: () => void;
  prev: () => void;
  setRate: (r: number) => void;
  setPitch: (p: number) => void;
  setVoice: (uri: string) => void;
  close: () => void;
  openPiP: () => Promise<void>;
  closePiP: () => void;
  registerPiPMount: (el: HTMLElement | null) => void;
  pipMount: HTMLElement | null;
};

const AudioCtx = createContext<Ctx | null>(null);

// 1s of silence, looped, keeps MediaSession alive on iOS/Android
const SILENT_AUDIO =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//FJAAJAMAIwIMAHMPhnPFvOn/o3eL/tQxA0DrhwG1YAhOn///vf/z/9///////////W//////////wCJyKk8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({
    loaded: false,
    isPlaying: false,
    currentIndex: 0,
    paragraphs: [] as string[],
    storyTitle: "",
    chapterTitle: "",
    author: undefined as string | undefined,
    chapter: 0,
    totalChapters: 0,
    cover: undefined as string | undefined,
    storySlug: "",
  });
  const [rate, setRateState] = useState(1);
  const [pitch, setPitchState] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string | null>(null);
  const [pipActive, setPipActive] = useState(false);
  const [pipMount, setPipMount] = useState<HTMLElement | null>(null);

  const callbacksRef = useRef<{ onPrev?: () => void; onNext?: () => void }>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pipWindowRef = useRef<Window | null>(null);
  const currentIdxRef = useRef(0);
  const shouldAdvanceRef = useRef(true);
  const paragraphsRef = useRef<string[]>([]);
  const rateRef = useRef(1);
  const pitchRef = useRef(1);
  const voiceURIRef = useRef<string | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);
  useEffect(() => {
    pitchRef.current = pitch;
  }, [pitch]);
  useEffect(() => {
    voiceURIRef.current = voiceURI;
  }, [voiceURI]);
  useEffect(() => {
    voicesRef.current = voices;
  }, [voices]);

  // load voices
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const update = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
      setVoiceURI((cur) => {
        if (cur && v.some((x) => x.voiceURI === cur)) return cur;
        const vi = v.find((x) => x.lang?.toLowerCase().startsWith("vi"));
        return vi?.voiceURI ?? v[0]?.voiceURI ?? null;
      });
    };
    update();
    window.speechSynthesis.addEventListener?.("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", update);
  }, []);

  const pipSupported = typeof window !== "undefined" && "documentPictureInPicture" in window;

  const speakIndex = useCallback((idx: number) => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    const text = paragraphsRef.current[idx];
    if (!text) {
      // end of chapter -> try next
      setState((s) => ({ ...s, isPlaying: false }));
      callbacksRef.current.onNext?.();
      return;
    }
    shouldAdvanceRef.current = true;
    currentIdxRef.current = idx;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rateRef.current;
    u.pitch = pitchRef.current;
    u.lang = "vi-VN";
    const v = voicesRef.current.find((x) => x.voiceURI === voiceURIRef.current);
    if (v) u.voice = v;
    u.onend = () => {
      if (!shouldAdvanceRef.current) return;
      const nextIdx = currentIdxRef.current + 1;
      if (nextIdx < paragraphsRef.current.length) {
        setState((s) => ({ ...s, currentIndex: nextIdx }));
        speakIndex(nextIdx);
      } else {
        setState((s) => ({ ...s, isPlaying: false }));
        callbacksRef.current.onNext?.();
      }
    };
    synth.cancel();
    synth.speak(u);
  }, []);

  const play = useCallback(() => {
    if (!paragraphsRef.current.length) return;
    setState((s) => ({ ...s, isPlaying: true }));
    audioRef.current?.play().catch(() => {});
    speakIndex(currentIdxRef.current);
  }, [speakIndex]);

  const pause = useCallback(() => {
    shouldAdvanceRef.current = false;
    if (typeof window !== "undefined") window.speechSynthesis.cancel();
    audioRef.current?.pause();
    setState((s) => ({ ...s, isPlaying: false }));
  }, []);

  const toggle = useCallback(() => {
    setState((s) => {
      if (s.isPlaying) {
        shouldAdvanceRef.current = false;
        window.speechSynthesis.cancel();
        audioRef.current?.pause();
        return { ...s, isPlaying: false };
      }
      audioRef.current?.play().catch(() => {});
      setTimeout(() => speakIndex(currentIdxRef.current), 0);
      return { ...s, isPlaying: true };
    });
  }, [speakIndex]);

  const seekIndex = useCallback(
    (i: number) => {
      currentIdxRef.current = i;
      setState((s) => ({ ...s, currentIndex: i }));
      if (state.isPlaying) speakIndex(i);
    },
    [speakIndex, state.isPlaying],
  );

  const next = useCallback(() => callbacksRef.current.onNext?.(), []);
  const prev = useCallback(() => callbacksRef.current.onPrev?.(), []);

  const load = useCallback((args: LoadArgs) => {
    callbacksRef.current = { onPrev: args.onPrev, onNext: args.onNext };
    currentIdxRef.current = 0;
    shouldAdvanceRef.current = false;
    if (typeof window !== "undefined") window.speechSynthesis.cancel();
    paragraphsRef.current = args.paragraphs;
    setState((s) => ({
      ...s,
      loaded: true,
      isPlaying: false,
      currentIndex: 0,
      paragraphs: args.paragraphs,
      storyTitle: args.storyTitle,
      chapterTitle: args.chapterTitle,
      author: args.author,
      chapter: args.chapter,
      totalChapters: args.totalChapters,
      cover: args.cover,
      storySlug: args.storySlug,
    }));
  }, []);

  const close = useCallback(() => {
    shouldAdvanceRef.current = false;
    if (typeof window !== "undefined") window.speechSynthesis.cancel();
    audioRef.current?.pause();
    setState({
      loaded: false,
      isPlaying: false,
      currentIndex: 0,
      paragraphs: [],
      storyTitle: "",
      chapterTitle: "",
      author: undefined,
      chapter: 0,
      totalChapters: 0,
      cover: undefined,
      storySlug: "",
    });
  }, []);

  const setRate = useCallback(
    (r: number) => {
      setRateState(r);
      if (state.isPlaying) {
        // restart current paragraph with new rate
        speakIndex(currentIdxRef.current);
      }
    },
    [state.isPlaying, speakIndex],
  );

  const setPitch = useCallback(
    (p: number) => {
      setPitchState(p);
      if (state.isPlaying) speakIndex(currentIdxRef.current);
    },
    [state.isPlaying, speakIndex],
  );

  const setVoice = useCallback(
    (uri: string) => {
      setVoiceURI(uri);
      if (state.isPlaying) speakIndex(currentIdxRef.current);
    },
    [state.isPlaying, speakIndex],
  );

  // MediaSession
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!state.loaded) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `Chương ${state.chapter}: ${state.chapterTitle}`,
      artist: state.author || state.storyTitle,
      album: state.storyTitle,
      artwork: state.cover ? [{ src: state.cover, sizes: "512x512", type: "image/jpeg" }] : [],
    });
    navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("play", () => toggle());
    navigator.mediaSession.setActionHandler("pause", () => toggle());
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
  }, [
    state.loaded,
    state.isPlaying,
    state.chapter,
    state.chapterTitle,
    state.storyTitle,
    state.author,
    state.cover,
    toggle,
    next,
    prev,
  ]);

  // Document PiP
  const openPiP = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dp = (window as any).documentPictureInPicture;
    if (!dp) return;
    const w: Window = await dp.requestWindow({ width: 380, height: 200 });
    // copy stylesheets so tailwind classes work inside PiP
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      w.document.head.appendChild(node.cloneNode(true));
    });
    w.document.body.style.margin = "0";
    w.document.body.style.background = "#0a0a0a";
    w.document.body.style.color = "#fff";
    const mount = w.document.createElement("div");
    w.document.body.appendChild(mount);
    pipWindowRef.current = w;
    setPipMount(mount);
    setPipActive(true);
    w.addEventListener("pagehide", () => {
      setPipActive(false);
      setPipMount(null);
      pipWindowRef.current = null;
    });
  }, []);

  const closePiP = useCallback(() => {
    pipWindowRef.current?.close();
    pipWindowRef.current = null;
    setPipMount(null);
    setPipActive(false);
  }, []);

  const registerPiPMount = useCallback((el: HTMLElement | null) => {
    // reserved for advanced usage; PiP mount is managed internally
    void el;
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      loaded: state.loaded,
      isPlaying: state.isPlaying,
      currentIndex: state.currentIndex,
      paragraphs: state.paragraphs,
      storyTitle: state.storyTitle,
      chapterTitle: state.chapterTitle,
      chapter: state.chapter,
      totalChapters: state.totalChapters,
      storySlug: state.storySlug,
      cover: state.cover,
      rate,
      pitch,
      voices,
      voiceURI,
      pipSupported,
      pipActive,
      load,
      play,
      pause,
      toggle,
      seekIndex,
      next,
      prev,
      setRate,
      setPitch,
      setVoice,
      close,
      openPiP,
      closePiP,
      registerPiPMount,
      pipMount,
    }),
    [
      state,
      rate,
      pitch,
      voices,
      voiceURI,
      pipSupported,
      pipActive,
      pipMount,
      load,
      play,
      pause,
      toggle,
      seekIndex,
      next,
      prev,
      setRate,
      setPitch,
      setVoice,
      close,
      openPiP,
      closePiP,
      registerPiPMount,
    ],
  );

  return (
    <AudioCtx.Provider value={value}>
      {children}
      {/* silent looping audio keeps MediaSession/lockscreen controls alive */}
      <audio ref={audioRef} src={SILENT_AUDIO} loop preload="auto" style={{ display: "none" }} />
    </AudioCtx.Provider>
  );
}

export function useAudioPlayer() {
  const c = useContext(AudioCtx);
  if (!c) throw new Error("useAudioPlayer must be used inside AudioPlayerProvider");
  return c;
}
