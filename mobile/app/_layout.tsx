/**
 * Root Layout — App shell with auth guard and navigation
 */

import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { supabase } from "../lib/supabase";
import { Colors } from "../lib/theme";
import type { Session } from "@supabase/supabase-js";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  // Listen for auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Auth redirect logic
  useEffect(() => {
    if (session === undefined) return; // Still loading

    const inAuthScreen = segments[0] === "auth";

    if (!session && !inAuthScreen) {
      // Not logged in and not on auth screen → redirect to auth
      // But allow browsing without login (skip button exists)
    }
  }, [session, segments]);

  // Loading state
  if (session === undefined) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" options={{ animation: "fade" }} />
        <Stack.Screen
          name="story/[slug]"
          options={{ animation: "slide_from_right" }}
        />
        <Stack.Screen
          name="reader/[chapterId]"
          options={{ animation: "fade" }}
        />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.bg,
  },
});
