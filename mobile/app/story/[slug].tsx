/**
 * Story Detail Screen — Story info, chapter list, and actions
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fetchStoryBySlug,
  fetchChapters,
  incrementViewCount,
} from "../../lib/supabase";
import { Colors, FontSize, Spacing, BorderRadius } from "../../lib/theme";

export default function StoryDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [story, setStory] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    loadStory();
  }, [slug]);

  async function loadStory() {
    try {
      const storyData = await fetchStoryBySlug(slug!);
      setStory(storyData);
      if (storyData) {
        incrementViewCount(storyData.id).catch(() => {});
        const chapterData = await fetchChapters(storyData.id);
        setChapters(chapterData);
      }
    } catch (error) {
      console.error("Failed to load story:", error);
    } finally {
      setLoading(false);
    }
  }

  function openChapter(chapter: any) {
    router.push({
      pathname: "/reader/[chapterId]",
      params: {
        chapterId: chapter.id,
        storyId: story.id,
        chapterNumber: chapter.chapter_number,
        r2Url: chapter.text_r2_url,
        storyTitle: story.title,
        chapterTitle: chapter.title,
      },
    });
  }

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!story) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Không tìm thấy truyện</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Back Button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← Quay lại</Text>
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <View style={styles.hero}>
          <Image
            source={
              story.cover_url
                ? { uri: story.cover_url }
                : require("../../assets/icon.png")
            }
            style={styles.cover}
          />
          <View style={styles.heroInfo}>
            <Text style={styles.storyTitle}>{story.title}</Text>
            {story.author && (
              <Text style={styles.author}>✍️ {story.author}</Text>
            )}
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{chapters.length}</Text>
                <Text style={styles.statLabel}>Chương</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{story.view_count || 0}</Text>
                <Text style={styles.statLabel}>Lượt xem</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {story.status === "completed" ? "Hoàn" : "Đang ra"}
                </Text>
                <Text style={styles.statLabel}>Trạng thái</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Genres */}
        {story.genres?.length > 0 && (
          <View style={styles.genresRow}>
            {story.genres.map((g: string) => (
              <View key={g} style={styles.genreBadge}>
                <Text style={styles.genreText}>{g}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Description */}
        {story.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Giới thiệu</Text>
            <Text style={styles.description}>{story.description}</Text>
          </View>
        )}

        {/* Read Button */}
        {chapters.length > 0 && (
          <TouchableOpacity
            style={styles.readBtn}
            activeOpacity={0.8}
            onPress={() => openChapter(chapters[0])}
          >
            <Text style={styles.readBtnText}>📖 Bắt đầu đọc</Text>
          </TouchableOpacity>
        )}

        {/* Chapter List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Danh sách chương ({chapters.length})
          </Text>
          {chapters.map((chapter) => (
            <TouchableOpacity
              key={chapter.id}
              style={styles.chapterItem}
              activeOpacity={0.7}
              onPress={() => openChapter(chapter)}
            >
              <Text style={styles.chapterNumber}>
                Chương {chapter.chapter_number}
              </Text>
              <Text style={styles.chapterTitle} numberOfLines={1}>
                {chapter.title}
              </Text>
              <Text style={styles.chapterMeta}>
                {chapter.word_count ? `${chapter.word_count} từ` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.bg },
  errorText: { color: Colors.textMuted, fontSize: FontSize.lg },
  backBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  backText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: "600" },

  hero: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.lg,
  },
  cover: {
    width: 120,
    height: 170,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgElevated,
  },
  heroInfo: { flex: 1, justifyContent: "center", gap: Spacing.sm },
  storyTitle: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: "800", lineHeight: 28 },
  author: { color: Colors.textSecondary, fontSize: FontSize.md },
  statsRow: { flexDirection: "row", alignItems: "center", marginTop: Spacing.sm },
  stat: { alignItems: "center", flex: 1 },
  statValue: { color: Colors.primary, fontSize: FontSize.lg, fontWeight: "700" },
  statLabel: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: Colors.border },

  genresRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  genreBadge: {
    backgroundColor: Colors.accent + "20",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  genreText: { color: Colors.accentLight, fontSize: FontSize.sm, fontWeight: "500" },

  section: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  sectionTitle: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: "700", marginBottom: Spacing.md },
  description: { color: Colors.textSecondary, fontSize: FontSize.md, lineHeight: 24 },

  readBtn: {
    backgroundColor: Colors.primary,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  readBtnText: { color: Colors.textInverse, fontSize: FontSize.lg, fontWeight: "700" },

  chapterItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: Spacing.md,
  },
  chapterNumber: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: "600", width: 80 },
  chapterTitle: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md },
  chapterMeta: { color: Colors.textMuted, fontSize: FontSize.xs },
});
