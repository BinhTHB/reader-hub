import { useState, useEffect, useRef, useCallback } from "react";

interface TTSOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
  onSentenceChange?: (index: number) => void;
}

// Utility to split text into paragraphs
function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function useTTS(text: string, options: TTSOptions = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRate] = useState(options.rate || 1.0);
  const [pitch, setPitch] = useState(options.pitch || 1.0);
  const [volume, setVolume] = useState(options.volume || 1.0);

  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Split text into paragraphs
  useEffect(() => {
    if (text) {
      const paragraphList = splitIntoParagraphs(text);
      setParagraphs(paragraphList);
    }
  }, [text]);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);

      // Try to select Vietnamese voice or default to first available
      const viVoice = availableVoices.find(
        (voice) => voice.lang.includes("vi") || voice.lang.includes("VI")
      );
      setSelectedVoice(viVoice || availableVoices[0] || null);
    };

    loadVoices();

    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const speakParagraph = useCallback(
    (index: number) => {
      if (!paragraphs[index] || !selectedVoice) return;

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(paragraphs[index]);
      utterance.voice = selectedVoice;
      utterance.rate = Math.min(10, Math.max(0.1, rate));
      utterance.pitch = Math.min(2, Math.max(0, pitch / 5)); // Map 0-10 to 0-2
      utterance.volume = volume;
      utterance.lang = selectedVoice.lang;

      utterance.onstart = () => {
        setIsPlaying(true);
        setIsPaused(false);
        setCurrentParagraphIndex(index);
        if (options.onSentenceChange) {
          options.onSentenceChange(index);
        }
      };

      utterance.onend = () => {
        // Auto-advance to next paragraph
        if (index < paragraphs.length - 1) {
          speakParagraph(index + 1);
        } else {
          setIsPlaying(false);
          setIsPaused(false);
        }
      };

      utterance.onerror = () => {
        setIsPlaying(false);
        setIsPaused(false);
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [paragraphs, selectedVoice, rate, pitch, volume, options]
  );

  const speak = useCallback(() => {
    speakParagraph(currentParagraphIndex);
  }, [currentParagraphIndex, speakParagraph]);

  const pause = useCallback(() => {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentParagraphIndex(0);
  }, []);

  const nextParagraph = useCallback(() => {
    if (currentParagraphIndex < paragraphs.length - 1) {
      const nextIndex = currentParagraphIndex + 1;
      setCurrentParagraphIndex(nextIndex);
      if (isPlaying) {
        speakParagraph(nextIndex);
      }
    }
  }, [currentParagraphIndex, paragraphs.length, isPlaying, speakParagraph]);

  const previousParagraph = useCallback(() => {
    if (currentParagraphIndex > 0) {
      const prevIndex = currentParagraphIndex - 1;
      setCurrentParagraphIndex(prevIndex);
      if (isPlaying) {
        speakParagraph(prevIndex);
      }
    }
  }, [currentParagraphIndex, isPlaying, speakParagraph]);

  const goToParagraph = useCallback(
    (index: number) => {
      if (index >= 0 && index < paragraphs.length) {
        setCurrentParagraphIndex(index);
        if (isPlaying) {
          speakParagraph(index);
        }
      }
    },
    [paragraphs.length, isPlaying, speakParagraph]
  );

  const progress = paragraphs.length > 0
    ? ((currentParagraphIndex + 1) / paragraphs.length) * 100
    : 0;

  return {
    speak,
    pause,
    resume,
    stop,
    nextParagraph,
    previousParagraph,
    goToParagraph,
    isPlaying,
    isPaused,
    voices,
    selectedVoice,
    setSelectedVoice,
    rate,
    setRate,
    pitch,
    setPitch,
    volume,
    setVolume,
    paragraphs,
    currentParagraphIndex,
    totalParagraphs: paragraphs.length,
    progress,
  };
}
