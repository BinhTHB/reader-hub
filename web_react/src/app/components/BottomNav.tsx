import {
  Home,
  Library,
  Download,
  User,
  MoreHorizontal,
} from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function BottomNav({
  activeTab,
  onTabChange,
}: BottomNavProps) {
  const tabs = [
    { id: "home", label: "Trang chủ", icon: Home },
    { id: "library", label: "Thư viện", icon: Library },
    { id: "search", label: "Cào", icon: Download },
    { id: "profile", label: "Cá nhân", icon: User },
    { id: "more", label: "Thêm", icon: MoreHorizontal },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-area-bottom">
      <div className="max-w-md mx-auto flex items-center justify-around px-4 py-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex flex-col items-center gap-1 min-w-[60px] group"
            >
              <Icon
                className={`w-6 h-6 transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground"
                }`}
              />
              <span
                className={`text-xs transition-colors ${
                  isActive
                    ? "text-primary font-medium"
                    : "text-muted-foreground group-hover:text-foreground"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}