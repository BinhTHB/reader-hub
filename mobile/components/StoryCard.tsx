/**
 * StoryCard Component — Displays a story in a card layout
 */

import { View, Text, Image, StyleSheet, TouchableOpacity, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { Colors, FontSize, BorderRadius, Spacing } from "../lib/theme";

const CARD_WIDTH = (Dimensions.get("window").width - Spacing.lg * 2 - Spacing.md) / 2;

interface StoryCardProps {
  story: {
    slug: string;
    title: string;
    author?: string;
    cover_url?: string;
    genres?: string[];
    total_chapters?: number;
    status?: string;
    view_count?: number;
  };
  variant?: "grid" | "horizontal";
}

export default function StoryCard({ story, variant = "grid" }: StoryCardProps) {
  const router = useRouter();

  if (variant === "horizontal") {
    return (
      <TouchableOpacity
        style={styles.horizontalCard}
        activeOpacity={0.8}
        onPress={() => router.push(`/story/${story.slug}`)}
      >
        <Image
          source={
            story.cover_url
              ? { uri: story.cover_url }
              : require("../assets/icon.png")
          }
          style={styles.horizontalCover}
        />
        <View style={styles.horizontalInfo}>
          <Text style={styles.horizontalTitle} numberOfLines={2}>
            {story.title}
          </Text>
          {story.author && (
            <Text style={styles.author} numberOfLines={1}>
              {story.author}
            </Text>
          )}
          <View style={styles.metaRow}>
            {story.total_chapters ? (
              <Text style={styles.metaText}>
                {story.total_chapters} chương
              </Text>
            ) : null}
            {story.status === "completed" && (
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>Hoàn</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.gridCard}
      activeOpacity={0.8}
      onPress={() => router.push(`/story/${story.slug}`)}
    >
      <View style={styles.coverContainer}>
        <Image
          source={
            story.cover_url
              ? { uri: story.cover_url }
              : require("../assets/icon.png")
          }
          style={styles.gridCover}
        />
        {story.status === "completed" && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedText}>Hoàn</Text>
          </View>
        )}
      </View>
      <Text style={styles.gridTitle} numberOfLines={2}>
        {story.title}
      </Text>
      {story.author && (
        <Text style={styles.gridAuthor} numberOfLines={1}>
          {story.author}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Grid variant
  gridCard: {
    width: CARD_WIDTH,
    marginBottom: Spacing.lg,
  },
  coverContainer: {
    position: "relative",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  gridCover: {
    width: "100%",
    height: CARD_WIDTH * 1.4,
    backgroundColor: Colors.bgElevated,
    borderRadius: BorderRadius.md,
  },
  completedBadge: {
    position: "absolute",
    top: Spacing.xs,
    right: Spacing.xs,
    backgroundColor: Colors.success,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  completedText: {
    color: Colors.textInverse,
    fontSize: FontSize.xs,
    fontWeight: "700",
  },
  gridTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: "600",
    lineHeight: 20,
  },
  gridAuthor: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },

  // Horizontal variant
  horizontalCard: {
    flexDirection: "row",
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  horizontalCover: {
    width: 70,
    height: 100,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.bgElevated,
  },
  horizontalInfo: {
    flex: 1,
    justifyContent: "center",
    gap: 4,
  },
  horizontalTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: "600",
    lineHeight: 22,
  },
  author: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 4,
  },
  metaText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
  statusBadge: {
    backgroundColor: Colors.success + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: "600",
  },
});
