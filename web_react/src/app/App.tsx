import { useState, useEffect, lazy, Suspense } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { BottomNav } from "./components/BottomNav";
import { HomeScreen } from "./screens/HomeScreen";
import { supabase } from "../lib/supabase";
import { fetchIsAdmin } from "../lib/admin";

const DetailScreen = lazy(() =>
  import("./screens/DetailScreen").then((m) => ({ default: m.DetailScreen })),
);
const ScrapeScreen = lazy(() =>
  import("./screens/ScrapeScreen").then((m) => ({ default: m.ScrapeScreen })),
);
const ProfileScreen = lazy(() =>
  import("./screens/ProfileScreen").then((m) => ({ default: m.ProfileScreen })),
);
const AuthScreen = lazy(() =>
  import("./screens/AuthScreen").then((m) => ({ default: m.AuthScreen })),
);

type Screen = "stories" | "scrape" | "profile" | "detail" | "auth";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("stories");
  const [screenData, setScreenData] = useState<any>(null);
  const [navigationHistory, setNavigationHistory] = useState<
    Array<{ screen: Screen; data?: any }>
  >([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(false);

  useEffect(() => {
    const savedDarkMode = localStorage.getItem("darkMode");
    if (savedDarkMode === "true") {
      setIsDarkMode(true);
      document.documentElement.classList.add("dark");
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setIsAdmin(false);
      setIsCheckingAdmin(false);
      return;
    }
    setIsCheckingAdmin(true);
    fetchIsAdmin(user.id)
      .then((ok) => {
        if (!cancelled) setIsAdmin(ok);
      })
      .finally(() => {
        if (!cancelled) setIsCheckingAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setCurrentScreen("profile");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  useEffect(() => {
    let handle: { remove: () => Promise<void> } | null = null;
    let disposed = false;

    CapacitorApp.addListener("backButton", () => {
      if (navigationHistory.length > 0) {
        const previous = navigationHistory[navigationHistory.length - 1];
        setCurrentScreen(previous.screen);
        setScreenData(previous.data || null);
        setNavigationHistory((prev) => prev.slice(0, -1));
      } else if (currentScreen !== "stories") {
        setCurrentScreen("stories");
        setScreenData(null);
      } else {
        CapacitorApp.exitApp();
      }
    }).then((h) => {
      if (disposed) {
        void h.remove();
      } else {
        handle = h;
      }
    });

    return () => {
      disposed = true;
      if (handle) {
        void handle.remove();
      }
    };
  }, [currentScreen, navigationHistory]);

  const handleNavigate = (screen: string, data?: any) => {
    const target = (screen as Screen) || "stories";
    setNavigationHistory((prev) => [
      ...prev,
      { screen: currentScreen, data: screenData },
    ]);
    setCurrentScreen(target);
    if (data !== undefined) setScreenData(data);
  };

  const handleBack = () => {
    if (navigationHistory.length > 0) {
      const previous = navigationHistory[navigationHistory.length - 1];
      setCurrentScreen(previous.screen);
      setScreenData(previous.data || null);
      setNavigationHistory((prev) => prev.slice(0, -1));
    } else {
      setCurrentScreen("stories");
      setScreenData(null);
    }
  };

  const toggleDarkMode = (enabled: boolean) => {
    setIsDarkMode(enabled);
    localStorage.setItem("darkMode", enabled.toString());
    if (enabled) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <div className="max-w-md mx-auto bg-background min-h-screen relative">
      <div className="h-screen overflow-y-auto">
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center text-muted-foreground">
              Đang tải…
            </div>
          }
        >
          {currentScreen === "stories" && (
            <HomeScreen onNavigate={handleNavigate} isAdmin={isAdmin} />
          )}
          {currentScreen === "detail" && (
            <DetailScreen
              book={screenData}
              onBack={handleBack}
              isAdmin={isAdmin}
            />
          )}
          {currentScreen === "scrape" &&
            (isAdmin ? (
              <ScrapeScreen onNavigate={handleNavigate} />
            ) : (
              <div className="flex flex-col items-center justify-center h-screen px-6 pb-24 text-center">
                <h2 className="text-xl font-medium mb-2">
                  Khu vực Quản trị (Admin)
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  {isCheckingAdmin
                    ? "Đang kiểm tra quyền truy cập..."
                    : user
                      ? "Tài khoản hiện tại chưa được cấp quyền Admin để cào hoặc chỉnh sửa truyện."
                      : "Vui lòng đăng nhập bằng tài khoản Admin để sử dụng tính năng quản lý & cào truyện."}
                </p>
                {!user && (
                  <button
                    onClick={() => handleNavigate("auth")}
                    className="px-6 py-2.5 bg-primary text-white rounded-xl font-medium"
                  >
                    Đăng nhập Admin
                  </button>
                )}
              </div>
            ))}
          {currentScreen === "profile" && (
            <ProfileScreen
              onNavigate={handleNavigate}
              isDarkMode={isDarkMode}
              onToggleDarkMode={toggleDarkMode}
              user={user}
              onLogout={handleLogout}
              isAdmin={isAdmin}
            />
          )}
          {currentScreen === "auth" && (
            <AuthScreen
              onBack={handleBack}
              onSuccess={() => {
                handleBack();
              }}
            />
          )}
        </Suspense>
      </div>

      {!["detail", "auth"].includes(currentScreen) && (
        <BottomNav
          activeTab={currentScreen}
          onTabChange={(tab) => handleNavigate(tab)}
        />
      )}
    </div>
  );
}
