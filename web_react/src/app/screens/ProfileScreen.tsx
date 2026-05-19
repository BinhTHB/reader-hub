import { useState } from "react";
import {
  ChevronRight,
  Moon,
  Sun,
  Settings,
  HelpCircle,
  LogOut,
  User,
  Info,
} from "lucide-react";

interface ProfileScreenProps {
  onNavigate?: (screen: string) => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: (enabled: boolean) => void;
  user?: any;
  onLogout?: () => void;
}

export function ProfileScreen({ onNavigate, isDarkMode = false, onToggleDarkMode, user, onLogout }: ProfileScreenProps) {
  const menuItems = [
    { icon: Settings, label: "Cài đặt ứng dụng", action: "settings" },
    { icon: HelpCircle, label: "Trợ giúp & Hỗ trợ", action: "help" },
    { icon: Info, label: "Về ứng dụng", action: "about" },
  ];

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || "Người dùng";
  const userEmail = user?.email || "Chưa đăng nhập";

  return (
    <div className="min-h-screen pb-24 bg-background">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-secondary px-4 pt-12 pb-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center text-2xl shadow-lg overflow-hidden">
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-primary" />
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-medium text-white mb-1">
              {displayName}
            </h1>
            <p className="text-sm text-white/80">{userEmail}</p>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-6 space-y-6">
        {/* Info Card */}
        {user ? (
          <div className="bg-card rounded-2xl p-6 shadow-lg border border-border text-center">
            <p className="text-muted-foreground mb-4">
              Bạn đang đăng nhập. Lịch sử đọc và truyện yêu thích được đồng bộ hóa với đám mây.
            </p>
            <button 
              onClick={onLogout}
              className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/10"
            >
              <LogOut className="w-5 h-5" />
              Đăng xuất
            </button>
          </div>
        ) : (
          <div className="bg-card rounded-2xl p-6 shadow-lg border border-border text-center">
            <p className="text-muted-foreground mb-4">
              Đăng nhập để đồng bộ dữ liệu và trải nghiệm đầy đủ tính năng
            </p>
            <button 
              onClick={() => onNavigate?.("auth")}
              className="w-full py-3 bg-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity shadow-lg shadow-primary/10"
            >
              Đăng nhập / Đăng ký
            </button>
          </div>
        )}

        {/* Settings */}
        <section>
          <h2 className="text-lg font-medium mb-3">Cài đặt</h2>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                {isDarkMode ? (
                  <Moon className="w-5 h-5 text-primary" />
                ) : (
                  <Sun className="w-5 h-5 text-primary" />
                )}
                <span className="font-medium">Chế độ tối</span>
              </div>
              <button
                onClick={() => onToggleDarkMode?.(!isDarkMode)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  isDarkMode ? "bg-primary" : "bg-muted"
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full flex items-center justify-center transition-transform shadow-md ${
                    isDarkMode ? "translate-x-6" : ""
                  }`}
                >
                  {isDarkMode ? (
                    <Moon className="w-3 h-3 text-primary" />
                  ) : (
                    <Sun className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* Menu */}
        <section>
          <h2 className="text-lg font-medium mb-3">Khác</h2>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {menuItems.map((item, index) => (
              <button
                key={index}
                onClick={() => {
                  // Handle menu item click
                  console.log('Menu item clicked:', item.action);
                }}
                className={`w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors ${
                  index !== menuItems.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5 text-primary" />
                  <span className="font-medium">{item.label}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>

        {/* App Info */}
        <div className="text-center text-sm text-muted-foreground py-4">
          <p className="font-medium">Reader Hub v1.0.0</p>
          <p className="mt-1">React Web App + Capacitor</p>
          <p className="mt-1 text-xs">© 2026 Reader Hub Team</p>
        </div>
      </div>
    </div>
  );
}
