import { useState, useEffect } from "react";
import { App as CapacitorApp } from '@capacitor/app';
import { BottomNav } from "./components/BottomNav";
import { HomeScreen } from "./screens/HomeScreen";
import { ReadingScreen } from "./screens/ReadingScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { DetailScreen } from "./screens/DetailScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { ScrapeScreen } from "./screens/ScrapeScreen";

type Screen = "home" | "library" | "search" | "profile" | "more" | "reading" | "detail";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("home");
  const [screenData, setScreenData] = useState<any>(null);
  const [navigationHistory, setNavigationHistory] = useState<Array<{ screen: Screen; data?: any }>>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Load dark mode preference
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

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
      backButtonListener.remove();
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
        {currentScreen === "library" && <LibraryScreen onNavigate={handleNavigate} />}
        {currentScreen === "profile" && <ProfileScreen onNavigate={handleNavigate} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />}
        {currentScreen === "reading" && (
          <ReadingScreen chapter={screenData} onBack={handleBack} />
        )}
        {currentScreen === "detail" && (
          <DetailScreen
            book={screenData}
            onBack={handleBack}
            onStartReading={(chapter) => handleNavigate("reading", chapter)}
          />
        )}
        {currentScreen === "search" && (
          <ScrapeScreen onNavigate={handleNavigate} />
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
      {!["reading", "detail"].includes(currentScreen) && (
        <BottomNav
          activeTab={currentScreen}
          onTabChange={(tab) => handleNavigate(tab as Screen)}
        />
      )}
    </div>
  );
}