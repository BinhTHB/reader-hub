import { Database, Download, ShieldCheck } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs = [
    { id: "stories", label: "Truyện", icon: Database },
    { id: "scrape", label: "Cào & Jobs", icon: Download },
    { id: "profile", label: "Tài khoản", icon: ShieldCheck },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-area-bottom z-30">
      <div className="max-w-md mx-auto flex items-center justify-around px-4 py-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex flex-col items-center gap-1 min-w-[72px] group"
            >
              <Icon
                className={`w-5 h-5 transition-colors ${
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
