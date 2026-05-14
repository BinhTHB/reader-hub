/**
 * Search Screen — Multi-source story search
 *
 * Searches across all enabled source websites (truyenfull.vision, metruyenchu.com.vn, etc.)
 * Results are grouped by source. User can select a source to start scraping.
 */

import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import {
  searchSources,
  type MultiSearchResponse,
  type SearchResult,
  type SourceResults,
} from "../../lib/search";
import { Colors, FontSize, Spacing, BorderRadius } from "../../lib/theme";

interface Section {
  title: string;
  sourceName: string;
  sourceDisplay: string;
  data: SearchResult[];
  error?: string;
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [scrapingSource, setScrapingSource] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);

    // Debounce: wait 600ms after typing stops
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (text.trim().length < 2) {
      setSections([]);
      setSearched(false);
      setTotalResults(0);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      setSearched(true);

      try {
        const response = await searchSources(text.trim());
        setTotalResults(response.total_results);

        // Convert to SectionList format
        const newSections: Section[] = response.sources.map((source) => ({
          title: `${source.source_display} (${source.results.length} kết quả)`,
          sourceName: source.source_name,
          sourceDisplay: source.source_display,
          data: source.results,
          error: source.error,
        }));

        setSections(newSections);
      } catch (error: any) {
        console.error("Search failed:", error);
        Alert.alert("Lỗi tìm kiếm", error.message || "Không thể tìm kiếm");
      } finally {
        setLoading(false);
      }
    }, 600);
  }, []);

  const handleScrape = useCallback(
    async (result: SearchResult) => {
      setScrapingSource(result.sourceName);

      try {
        // Call the trigger-scraper Edge Function
        const { data, error } = await supabase.functions.invoke(
          "trigger-scraper",
          {
            body: {
              story_id: null, // Will be created by scraper
              source_url: result.sourceUrl,
              chapter_start: 1,
              chapter_end: 50, // First 50 chapters
            },
          }
        );

        if (error) throw error;

        Alert.alert(
          "✅ Đã gửi yêu cầu cào!",
          `Truyện "${result.title}" từ ${result.sourceDisplay} đang được xử lý.\n\nJob ID: ${data?.job_id}\n\nVui lòng đợi vài phút rồi quay lại trang chủ.`,
          [{ text: "OK" }]
        );
      } catch (error: any) {
        Alert.alert(
          "❌ Lỗi",
          error.message || "Không thể gửi yêu cầu cào"
        );
      } finally {
        setScrapingSource(null);
      }
    },
    []
  );

  const renderItem = ({ item }: { item: SearchResult }) => (
    <View style={styles.resultCard}>
      <View style={styles.resultContent}>
        {item.coverUrl ? (
          <Image source={{ uri: item.coverUrl }} style={styles.coverImg} />
        ) : (
          <View style={[styles.coverImg, styles.coverPlaceholder]}>
            <Text style={styles.coverPlaceholderText}>📖</Text>
          </View>
        )}

        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.author && (
            <Text style={styles.resultAuthor} numberOfLines={1}>
              ✍️ {item.author}
            </Text>
          )}
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceLabel}>{item.sourceDisplay}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.scrapeBtn,
          scrapingSource === item.sourceName && styles.scrapeBtnDisabled,
        ]}
        onPress={() => handleScrape(item)}
        disabled={scrapingSource !== null}
        activeOpacity={0.7}
      >
        {scrapingSource === item.sourceName ? (
          <ActivityIndicator color={Colors.textInverse} size="small" />
        ) : (
          <Text style={styles.scrapeBtnText}>📥 Cào</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderSectionHeader = ({
    section,
  }: {
    section: Section;
  }) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionDot} />
      <Text style={styles.sectionTitle}>{section.title}</Text>
      {section.error && (
        <Text style={styles.sectionError}>⚠️ {section.error}</Text>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Tìm & Cào truyện</Text>
        <Text style={styles.subtitle}>
          Tìm kiếm từ nhiều nguồn, chọn web để cào
        </Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Nhập tên truyện..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={handleSearch}
          autoCorrect={false}
          returnKeyType="search"
        />
        {loading && (
          <ActivityIndicator
            size="small"
            color={Colors.primary}
            style={styles.searchSpinner}
          />
        )}
      </View>

      {/* Results Summary */}
      {searched && !loading && (
        <Text style={styles.resultsSummary}>
          {totalResults > 0
            ? `Tìm thấy ${totalResults} kết quả từ ${sections.length} nguồn`
            : `Không tìm thấy kết quả cho "${query}"`}
        </Text>
      )}

      {/* Results */}
      <SectionList
        sections={sections}
        keyExtractor={(item, index) =>
          `${item.sourceName}-${item.sourceUrl}-${index}`
        }
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          !loading && searched ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>
                Không tìm thấy kết quả
              </Text>
              <Text style={styles.emptySubtext}>
                Thử tìm với tên khác hoặc bớt từ khóa
              </Text>
            </View>
          ) : !searched ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>✨</Text>
              <Text style={styles.emptyText}>Nhập tên truyện</Text>
              <Text style={styles.emptySubtext}>
                Sẽ tìm trên TruyenFull, MeTruyenChu và nhiều nguồn khác
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.title,
    fontWeight: "800",
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginTop: 4,
  },

  // Search bar
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: { fontSize: 18, marginRight: Spacing.sm },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    paddingVertical: 14,
  },
  searchSpinner: { marginLeft: Spacing.sm },

  // Results summary
  resultsSummary: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: "700",
    flex: 1,
  },
  sectionError: {
    color: Colors.warning,
    fontSize: FontSize.xs,
  },

  // Result card
  resultCard: {
    backgroundColor: Colors.bgCard,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultContent: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  coverImg: {
    width: 55,
    height: 75,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.bgElevated,
  },
  coverPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  coverPlaceholderText: { fontSize: 24 },
  resultInfo: {
    flex: 1,
    justifyContent: "center",
    gap: 4,
  },
  resultTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: "600",
    lineHeight: 22,
  },
  resultAuthor: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  sourceBadge: {
    backgroundColor: Colors.accent + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  sourceLabel: {
    color: Colors.accentLight,
    fontSize: FontSize.xs,
    fontWeight: "600",
  },

  // Scrape button
  scrapeBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  scrapeBtnDisabled: { opacity: 0.5 },
  scrapeBtnText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: "700",
  },

  // List
  listContent: { paddingBottom: Spacing.xxl * 2 },

  // Empty states
  emptyContainer: {
    alignItems: "center",
    paddingTop: Spacing.xxl * 2,
  },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  emptySubtext: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
});
