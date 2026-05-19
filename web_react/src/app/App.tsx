import { useState, useEffect } from "react";
import { App as CapacitorApp } from '@capacitor/app';
import { BottomNav } from "./components/BottomNav";
import { HomeScreen } from "./screens/HomeScreen";
import { ReadingScreen } from "./screens/ReadingScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { DetailScreen } from "./screens/DetailScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { ScrapeScreen } from "./screens/ScrapeScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { supabase } from "../lib/supabase";

type Screen = "home" | "library" | "search" | "profile" | "more" | "reading" | "detail" | "auth";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("home");
  const [screenData, setScreenData] = useState<any>(null);
  const [navigationHistory, setNavigationHistory] = useState<Array<{ screen: Screen; data?: any }>>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Load dark mode preference
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    // Get current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        syncLocalBookmarks(session.user.id);
        syncLocalReadingHistory(session.user.id);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (event === 'SIGNED_IN' && currentUser) {
        syncLocalBookmarks(currentUser.id);
        syncLocalReadingHistory(currentUser.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const syncLocalBookmarks = async (userId: string) => {
    try {
      const saved = localStorage.getItem('bookmarks');
      if (saved) {
        const bookmarkIds = JSON.parse(saved);
        if (bookmarkIds.length > 0) {
          console.log('Syncing local bookmarks for user:', userId);
          const bookmarkInserts = bookmarkIds.map((storyId: number) => ({
            user_id: userId,
            story_id: storyId,
          }));

          const { error } = await supabase
            .from('bookmarks')
            .upsert(bookmarkInserts, { onConflict: 'user_id,story_id' });

          if (error) throw error;
          localStorage.removeItem('bookmarks');
          console.log('Local bookmarks synced');
        }
      }
    } catch (err) {
      console.error('Failed to sync local bookmarks:', err);
    }
  };

  const syncLocalReadingHistory = async (userId: string) => {
    try {
      const saved = localStorage.getItem('reading_history');
      if (saved) {
        const history = JSON.parse(saved);
        if (history.length > 0) {
          console.log('Syncing local history for user:', userId);
          const historyInserts = history.map((h: any) => ({
            user_id: userId,
            story_id: h.story_id,
            last_chapter_number: h.chapter_number,
            last_read_at: h.last_read,
          }));

          const { error } = await supabase
            .from('reading_history')
            .upsert(historyInserts, { onConflict: 'user_id,story_id' });

          if (error) throw error;
          localStorage.removeItem('reading_history');
          console.log('Local reading history synced');
        }
      }
    } catch (err) {
      console.error('Failed to sync local reading history:', err);
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setCurrentScreen("profile");
    } catch (err) {
      console.error('Failed to sign out:', err);
    }
  };

  useEffect(() => {
    const backButtonListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (navigationHistory.length > 0) {
        // Navigate back in app history
        const previous = navigationHistory[navigationHistory.length - 1];
        setCurrentScreen(previous.screen);
        setScreenData(previous.data || null);
        setNavigationHistory(prev => prev.slice(0, -1));
      } else if (currentScreen !== "home") {
        // Go to home if not already there
        setCurrentScreen("home");
        setScreenData(null);
      } else {
        // Exit app if on home screen
        CapacitorApp.exitApp();
      }
    });

    return () => {
      if (backButtonListener && typeof backButtonListener.remove === 'function') {
        backButtonListener.remove();
      }
    };
  }, [currentScreen, navigationHistory]);

  const handleNavigate = (screen: Screen, data?: any) => {
    // Save current screen to history
    setNavigationHistory(prev => [...prev, { screen: currentScreen, data: screenData }]);
    setCurrentScreen(screen);
    if (data) setScreenData(data);
  };

  const handleBack = () => {
    if (navigationHistory.length > 0) {
      const previous = navigationHistory[navigationHistory.length - 1];
      setCurrentScreen(previous.screen);
      setScreenData(previous.data || null);
      setNavigationHistory(prev => prev.slice(0, -1));
    } else {
      setCurrentScreen("home");
      setScreenData(null);
    }
  };

  const toggleDarkMode = (enabled: boolean) => {
    setIsDarkMode(enabled);
    localStorage.setItem('darkMode', enabled.toString());
    if (enabled) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className="max-w-md mx-auto bg-background min-h-screen relative">
      {/* Main Content */}
      <div className="h-screen overflow-y-auto">
        {currentScreen === "home" && <HomeScreen onNavigate={handleNavigate} />}
        {currentScreen === "library" && <LibraryScreen onNavigate={handleNavigate} user={user} />}
        {currentScreen === "profile" && <ProfileScreen onNavigate={handleNavigate} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} user={user} onLogout={handleLogout} />}
        {currentScreen === "reading" && (
          <ReadingScreen chapter={screenData} onBack={handleBack} user={user} />
        )}
        {currentScreen === "detail" && (
          <DetailScreen
            book={screenData}
            onBack={handleBack}
            onStartReading={(chapter) => handleNavigate("reading", chapter)}
            user={user}
          />
        )}
        {currentScreen === "search" && (
          <ScrapeScreen onNavigate={handleNavigate} />
        )}
        {currentScreen === "auth" && (
          <AuthScreen 
            onBack={handleBack} 
            onSuccess={() => {
              handleBack();
            }} 
          />
        )}
        {currentScreen === "more" && (
          <div className="flex flex-col items-center justify-center h-screen px-4 pb-24">
            <h2 className="text-2xl font-medium mb-4">Thêm</h2>
            <p className="text-muted-foreground text-center mb-6">
              Các tính năng bổ sung sẽ được thêm vào đây
            </p>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      {!["reading", "detail", "auth"].includes(currentScreen) && (
        <BottomNav
          activeTab={currentScreen}
          onTabChange={(tab) => handleNavigate(tab as Screen)}
        />
      )}
    </div>
  );
}