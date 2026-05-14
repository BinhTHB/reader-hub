/**
 * Home Screen — Featured stories and recent updates
 */

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import StoryCard from "../../components/StoryCard";
import { fetchStories } from "../../lib/supabase";
import { Colors, FontSize, Spacing } from "../../lib/theme";

const { width } = Dimensions.get("window");

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStories = useCallback(async () => {
    try {
      const { stories: data } = await fetchStories({ limit: 30 });
      setStories(data);
    } catch (error) {
      console.error("Failed to load stories:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  const onRefresh = () => {
    setRefreshing(true);
    loadStories();
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Xin chào! 👋</Text>
        <Text style={styles.title}>Reader Hub</Text>
        <Text style={styles.subtitle}>Khám phá thế giới truyện</Text>
      </View>

      {/* Story Grid */}
      <FlatList
        data={stories}
        numColumns={2}
        keyExtractor={(item) => item.slug}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <StoryCard story={item} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📚</Text>
            <Text style={styles.emptyText}>Chưa có truyện nào</Text>
            <Text style={styles.emptySubtext}>
              Hãy thêm truyện từ hệ thống scraper
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  greeting: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    marginBottom: 4,
  },
  title: {
    color: Colors.primary,
    fontSize: FontSize.xxxl,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    marginTop: 4,
  },
  row: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  listContent: {
    paddingBottom: Spacing.xxl,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxl * 2,
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: Spacing.md,
  },
  emptyText: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  emptySubtext: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    textAlign: "center",
  },
});
