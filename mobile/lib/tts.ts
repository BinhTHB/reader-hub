/**
 * TTS Engine Wrapper — On-device Text-to-Speech
 *
 * Wraps the native TTS engine (Google TTS on Android, AVSpeechSynthesizer on iOS)
 * with sentence-level chunking for smoother playback and progress tracking.
 *
 * Note: react-native-tts requires a Development Build (not compatible with Expo Go).
 * For development, this module provides a mock fallback.
 */

// Type definitions (works without react-native-tts installed)
interface TTSModule {
  setDefaultLanguage(lang: string): Promise<string>;
  setDefaultRate(rate: number, skipTransform?: boolean): Promise<string>;
  setDefaultPitch(pitch: number): Promise<string>;
  speak(text: string, options?: object): string | number;
  stop(): void;
  pause(): void;
  resume(): void;
  addEventListener(event: string, handler: Function): { remove(): void };
  voices(): Promise<Array<{ id: string; name: string; language: string }>>;
}

// ─── State ────────────────────────────────────────────────

let tts: TTSModule | null = null;
let isInitialized = false;

let currentSentences: string[] = [];
let currentIndex = 0;
let isPlaying = false;
let isPaused = false;
let playbackRate = 1.0;

type ProgressCallback = (index: number, total: number) => void;
type StateCallback = (state: "playing" | "paused" | "stopped") => void;

let onProgress: ProgressCallback | null = null;
let onStateChange: StateCallback | null = null;

// ─── Initialization ───────────────────────────────────────

export async function initTTS(): Promise<boolean> {
  if (isInitialized) return true;

  try {
    const Tts = require("react-native-tts").default;
    tts = Tts as TTSModule;

    await tts.setDefaultLanguage("vi-VN");
    await tts.setDefaultRate(playbackRate, true);
    await tts.setDefaultPitch(1.0);

    // Listen for utterance completion to chain sentences
    tts.addEventListener("tts-finish", () => {
      if (isPlaying && !isPaused) {
        currentIndex++;
        if (currentIndex < currentSentences.length) {
          speakCurrentSentence();
          onProgress?.(currentIndex, currentSentences.length);
        } else {
          // Finished all sentences
          isPlaying = false;
          onStateChange?.("stopped");
        }
      }
    });

    tts.addEventListener("tts-cancel", () => {
      // Do nothing; we handle stop explicitly
    });

    isInitialized = true;
    return true;
  } catch (e) {
    console.warn("TTS not available (requires Development Build):", e);
    return false;
  }
}

// ─── Text Processing ──────────────────────────────────────

/**
 * Split text into sentences for chunked TTS playback.
 * Vietnamese sentences typically end with . ! ? or ;
 */
function splitIntoSentences(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?;])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // If no sentence boundaries found, chunk by ~200 chars at word boundaries
  if (sentences.length <= 1 && text.length > 200) {
    const chunks: string[] = [];
    const words = text.split(/\s+/);
    let chunk = "";
    for (const word of words) {
      if (chunk.length + word.length > 200) {
        chunks.push(chunk.trim());
        chunk = word;
      } else {
        chunk += (chunk ? " " : "") + word;
      }
    }
    if (chunk.trim()) chunks.push(chunk.trim());
    return chunks;
  }

  return sentences;
}

/**
 * Prepare paragraphs for TTS playback.
 * Joins paragraphs and splits into sentences.
 */
export function prepareParagraphs(paragraphs: string[]): string[] {
  const fullText = paragraphs.join(". ");
  const sentences = splitIntoSentences(fullText);
  currentSentences = sentences;
  currentIndex = 0;
  return sentences;
}

// ─── Playback Controls ───────────────────────────────────

function speakCurrentSentence() {
  if (!tts || currentIndex >= currentSentences.length) return;
  tts.speak(currentSentences[currentIndex]);
}

export function play(paragraphs?: string[], startIndex?: number) {
  if (!tts) return;

  if (isPaused && !paragraphs) {
    // Resume from pause
    tts.resume();
    isPaused = false;
    isPlaying = true;
    onStateChange?.("playing");
    return;
  }

  // Start fresh
  stop();
  if (paragraphs) {
    prepareParagraphs(paragraphs);
  }
  if (startIndex !== undefined) {
    currentIndex = Math.max(0, Math.min(startIndex, currentSentences.length - 1));
  }

  isPlaying = true;
  isPaused = false;
  onStateChange?.("playing");
  speakCurrentSentence();
  onProgress?.(currentIndex, currentSentences.length);
}

export function pause() {
  if (!tts || !isPlaying) return;
  tts.pause();
  isPaused = true;
  isPlaying = false;
  onStateChange?.("paused");
}

export function stop() {
  if (!tts) return;
  tts.stop();
  isPlaying = false;
  isPaused = false;
  currentIndex = 0;
  onStateChange?.("stopped");
}

export function skipForward() {
  if (!tts || currentIndex >= currentSentences.length - 1) return;
  tts.stop();
  currentIndex++;
  if (isPlaying || isPaused) {
    isPlaying = true;
    isPaused = false;
    speakCurrentSentence();
    onProgress?.(currentIndex, currentSentences.length);
    onStateChange?.("playing");
  }
}

export function skipBackward() {
  if (!tts || currentIndex <= 0) return;
  tts.stop();
  currentIndex--;
  if (isPlaying || isPaused) {
    isPlaying = true;
    isPaused = false;
    speakCurrentSentence();
    onProgress?.(currentIndex, currentSentences.length);
    onStateChange?.("playing");
  }
}

export async function setRate(rate: number) {
  playbackRate = rate;
  if (tts) {
    await tts.setDefaultRate(rate, true);
    // If playing, restart current sentence with new rate
    if (isPlaying) {
      tts.stop();
      speakCurrentSentence();
    }
  }
}

// ─── Event Listeners ──────────────────────────────────────

export function setOnProgress(callback: ProgressCallback | null) {
  onProgress = callback;
}

export function setOnStateChange(callback: StateCallback | null) {
  onStateChange = callback;
}

// ─── Getters ──────────────────────────────────────────────

export function getIsPlaying() {
  return isPlaying;
}

export function getIsPaused() {
  return isPaused;
}

export function getCurrentIndex() {
  return currentIndex;
}

export function getTotalSentences() {
  return currentSentences.length;
}

export function getRate() {
  return playbackRate;
}
