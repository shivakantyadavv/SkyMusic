import React from "react";
import { Home, Library, Search, Settings } from "lucide-react";
import { NavTab } from "../types/music";

interface MobileNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const items: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: "Home", icon: <Home className="h-5 w-5" /> },
    { id: "search", label: "Search", icon: <Search className="h-5 w-5" /> },
    { id: "library", label: "Library", icon: <Library className="h-5 w-5" /> },
    {
      id: "settings",
      label: "Settings",
      icon: <Settings className="h-5 w-5" />,
    },
  ];

  return (
    <nav
      className="sky-surface flex shrink-0 items-center justify-around border-t px-2 py-2 md:hidden"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      {items.map((item) => {
        const active = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className="flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-[11px] font-medium transition-colors"
            style={{
              color: active ? "var(--accent-primary)" : "var(--text-secondary)",
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
