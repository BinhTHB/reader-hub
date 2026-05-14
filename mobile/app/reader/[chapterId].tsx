/**
 * Reader Screen — Read chapter text with on-device TTS controls
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchChapterContent, prefetchChapter } from "../../lib/r2";
import * as tts from "../../lib/tts";
import { Colors, FontSize, Spacing, BorderRadius } from "../../lib/theme";

const { width } = Dimensions.get("window");

type ReaderTheme = "dark" | "sepia" | "white";

const THEMES: Record<ReaderTheme, { bg: string; text: string; label: string }> = {
  dark: { bg: "#1A1A2E", text: "#E0E0F0", label: "Tối" },
  sepia: { bg: "#F4ECD8", text: "#5B4636", label: "Sepia" },
  white: { bg: "#FEFEFE", text: "#1A1A1A", label: "Sáng" },
};

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export default function ReaderScreen() {
  const params = useLocalSearchParams<{
    chapterId: string;
    r2Url: string;
    storyTitle: string;
    chapterTitle: string;
    chapterNumber: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  // Content state
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reader settings
  const [theme, setTheme] = useState<ReaderTheme>("dark");
  const [fontSize, setFontSize] = useState(18);
  const [showSettings, setShowSettings] = useState(false);
  const [showHeader, setShowHeader] = useState(true);

  // TTS state
  const [ttsReady, setTtsReady] = useState(false);
  const [ttsState, setTtsState] = useState<"playing" | "paused" | "stopped">("stopped");
  const [ttsProgress, setTtsProgress] = useState({ current: 0, total: 0 });
  const [speed, setSpeed] = useState(1.0);

  // Initialize TTS
  useEffect(() => {
    tts.initTTS().then(setTtsReady);

    tts.setOnStateChange((state) => setTtsState(state));
    tts.setOnProgress((current, total) => setTtsProgress({ current, total }));

    return () => {
      tts.stop();
      tts.setOnStateChange(null);
      tts.setOnProgress(null);
    };
  }, []);

  // Load chapter content
  useEffect(() => {
    if (!params.r2Url) return;
    loadContent();
  }, [params.r2Url]);

  async function loadContent() {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchChapterContent(params.r2Url!);
      setParagraphs(data.paragraphs);
    } catch (e: any) {
      setError(e.message || "Không thể tải nội dung");
    } finally {
      setLoading(false);
    }
  }

  // TTS Controls
  const toggleTTS = useCallback(() => {
    if (ttsState === "playing") {
      tts.pause();
    } else if (ttsState === "paused") {
      tts.play();
    } else {
      tts.play(paragraphs);
    }
  }, [ttsState, paragraphs]);

  const stopTTS = useCallback(() => {
    tts.stop();
  }, []);

  const cycleSpeed = useCallback(() => {
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setSpeed(next);
    tts.setRate(next);
  }, [speed]);

  const toggleHeader = () => setShowHeader((v) => !v);

  const currentTheme = THEMES[theme];

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: currentTheme.bg }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={[styles.loadingText, { color: currentTheme.text }]}>
          Đang tải chương...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: currentTheme.bg }]}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={[styles.errorText, { color: currentTheme.text }]}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadContent}>
          <Text style={styles.retryText}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: currentTheme.bg }]}>
      {/* Header */}
      {showHeader && (
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <TouchableOpacity onPress={() => { tts.stop(); router.back(); }}>
            <Text style={styles.headerBtn}>← Quay lại</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {params.storyTitle || ""}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              Chương {params.chapterNumber}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setShowSettings((v) => !v)}>
            <Text style={styles.headerBtn}>⚙️</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <View style={styles.settingsPanel}>
          {/* Font Size */}
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Cỡ chữ</Text>
            <View style={styles.settingsControls}>
              <TouchableOpacity
                style={styles.settingsBtn}
                onPress={() => setFontSize((s) => Math.max(12, s - 2))}
              >
                <Text style={styles.settingsBtnText}>A-</Text>
              </TouchableOpacity>
              <Text style={styles.settingsValue}>{fontSize}</Text>
              <TouchableOpacity
                style={styles.settingsBtn}
                onPress={() => setFontSize((s) => Math.min(32, s + 2))}
              >
                <Text style={styles.settingsBtnText}>A+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Theme */}
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Nền</Text>
            <View style={styles.settingsControls}>
              {(Object.keys(THEMES) as ReaderTheme[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.themeBtn,
                    { backgroundColor: THEMES[t].bg },
                    t === theme && styles.themeBtnActive,
                  ]}
                  onPress={() => setTheme(t)}
                >
                  <Text style={[styles.themeBtnText, { color: THEMES[t].text }]}>
                    {THEMES[t].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Content */}
      <ScrollView
        ref={scrollRef}
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        onTouchEnd={toggleHeader}
      >
        <Text style={[styles.chapterHeading, { color: currentTheme.text }]}>
          Chương {params.chapterNumber}
        </Text>
        {params.chapterTitle && (
          <Text style={[styles.chapterSubheading, { color: currentTheme.text + "99" }]}>
            {params.chapterTitle}
          </Text>
        )}

        {paragraphs.map((p, i) => (
          <Text
            key={i}
            style={[
              styles.paragraph,
              { color: currentTheme.text, fontSize, lineHeight: fontSize * 1.8 },
            ]}
          >
            {p}
          </Text>
        ))}
      </ScrollView>

      {/* TTS Control Bar */}
      {ttsReady && (
        <View style={[styles.ttsBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
          {ttsState !== "stopped" && (
            <Text style={styles.ttsProgress}>
              {ttsProgress.current + 1}/{ttsProgress.total}
            </Text>
          )}

          <View style={styles.ttsControls}>
            <TouchableOpacity style={styles.ttsBtn} onPress={() => tts.skipBackward()}>
              <Text style={styles.ttsBtnText}>⏮</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.ttsPlayBtn} onPress={toggleTTS}>
              <Text style={styles.ttsPlayText}>
                {ttsState === "playing" ? "⏸" : "▶️"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.ttsBtn} onPress={() => tts.skipForward()}>
              <Text style={styles.ttsBtnText}>⏭</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.ttsBtn} onPress={stopTTS}>
              <Text style={styles.ttsBtnText}>⏹</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.speedBtn} onPress={cycleSpeed}>
              <Text style={styles.speedText}>{speed}x</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md },
  loadingText: { fontSize: FontSize.md, marginTop: Spacing.md },
  errorIcon: { fontSize: 48 },
  errorText: { fontSize: FontSize.md, textAlign: "center", paddingHorizontal: Spacing.xl },
  retryBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg, marginTop: Spacing.md,
  },
  retryText: { color: Colors.textInverse, fontWeight: "700" },

  // Header
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    backgroundColor: Colors.bgOverlay, position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
  },
  headerBtn: { color: Colors.primary, fontSize: FontSize.md, fontWeight: "600", padding: Spacing.sm },
  headerCenter: { flex: 1, alignItems: "center", marginHorizontal: Spacing.sm },
  headerTitle: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: "600" },
  headerSubtitle: { color: Colors.textMuted, fontSize: FontSize.xs },

  // Settings
  settingsPanel: {
    backgroundColor: Colors.bgCard, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border, marginTop: 80, zIndex: 5,
  },
  settingsRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  settingsLabel: { color: Colors.textSecondary, fontSize: FontSize.md },
  settingsControls: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  settingsBtn: {
    backgroundColor: Colors.bgElevated, width: 36, height: 36,
    borderRadius: BorderRadius.sm, justifyContent: "center", alignItems: "center",
  },
  settingsBtnText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: "700" },
  settingsValue: { color: Colors.primary, fontSize: FontSize.md, fontWeight: "600", minWidth: 30, textAlign: "center" },
  themeBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border,
  },
  themeBtnActive: { borderColor: Colors.primary, borderWidth: 2 },
  themeBtnText: { fontSize: FontSize.sm, fontWeight: "500" },

  // Content
  content: { flex: 1 },
  contentContainer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl * 2 },
  chapterHeading: { fontSize: FontSize.xxl, fontWeight: "800", textAlign: "center", marginBottom: Spacing.sm },
  chapterSubheading: { fontSize: FontSize.md, textAlign: "center", marginBottom: Spacing.xl, fontStyle: "italic" },
  paragraph: { marginBottom: Spacing.lg, textAlign: "justify" },

  // TTS Bar
  ttsBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.bgCard + "F0", paddingTop: Spacing.sm, paddingHorizontal: Spacing.lg,
    borderTopWidth: 1, borderTopColor: Colors.border,
    alignItems: "center",
  },
  ttsProgress: { color: Colors.textMuted, fontSize: FontSize.xs, marginBottom: 4 },
  ttsControls: { flexDirection: "row", alignItems: "center", gap: Spacing.lg },
  ttsBtn: { padding: Spacing.sm },
  ttsBtnText: { fontSize: 24 },
  ttsPlayBtn: {
    backgroundColor: Colors.primary, width: 52, height: 52,
    borderRadius: 26, justifyContent: "center", alignItems: "center",
  },
  ttsPlayText: { fontSize: 24 },
  speedBtn: {
    backgroundColor: Colors.bgElevated, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  speedText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: "700" },
});
