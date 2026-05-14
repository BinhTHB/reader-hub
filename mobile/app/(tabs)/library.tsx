/**
 * Library Screen — Reading history and bookmarks
 */

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import StoryCard from "../../components/StoryCard";
import { supabase, getReadingHistory, getBookmarks } from "../../lib/supabase";
import { Colors, FontSize, Spacing, BorderRadius } from "../../lib/theme";

type Tab = "history" | "bookmarks";

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("history");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      if (activeTab === "history") {
        const data = await getReadingHistory(userId);
        setItems(data.map((h: any) => ({ ...h.stories, _lastChapter: h.last_chapter_number })));
      } else {
        const data = await getBookmarks(userId);
        setItems(data.map((b: any) => b.stories));
      }
    } catch (error) {
      console.error("Failed to load library:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, activeTab]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Thư viện</Text>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "history" && styles.tabActive]}
          onPress={() => setActiveTab("history")}
        >
          <Text style={[styles.tabText, activeTab === "history" && styles.tabTextActive]}>
            📖 Lịch sử
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "bookmarks" && styles.tabActive]}
          onPress={() => setActiveTab("bookmarks")}
        >
          <Text style={[styles.tabText, activeTab === "bookmarks" && styles.tabTextActive]}>
            ⭐ Yêu thích
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {!userId ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔐</Text>
          <Text style={styles.emptyText}>Đăng nhập để xem thư viện</Text>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => router.push("/auth")}
          >
            <Text style={styles.loginBtnText}>Đăng nhập</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => item?.slug || String(i)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) =>
            item ? <StoryCard story={item} variant="horizontal" /> : null
          }
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
              <Text style={styles.emptyIcon}>
                {activeTab === "history" ? "📖" : "⭐"}
              </Text>
              <Text style={styles.emptyText}>
                {activeTab === "history"
                  ? "Chưa có lịch sử đọc"
                  : "Chưa có truyện yêu thích"}
              </Text>
            </View>
          }
        />
      )}
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
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.title,
    fontWeight: "800",
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: BorderRadius.md,
  },
  tabActive: {
    backgroundColor: Colors.primary + "20",
  },
  tabText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    fontWeight: "500",
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: Spacing.xxl * 2,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    textAlign: "center",
  },
  loginBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.lg,
  },
  loginBtnText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: "700",
  },
});
