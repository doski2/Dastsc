import { APP_TABS, type AppTabId } from './appUtils';

interface AppTabBarProps {
  activeTab: AppTabId;
  onTabChange: (tab: AppTabId) => void;
}

export function AppTabBar({ activeTab, onTabChange }: AppTabBarProps) {
  return (
    <footer className="h-16 border-t border-white/5 flex justify-center bg-nexus-raised shrink-0">
      <div className="flex gap-2 p-2">
        {APP_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`
                flex flex-col items-center justify-center w-24 gap-1.5 transition-all duration-300
                ${isActive ? 'text-cyan-400 bg-white/5 border-t-2 border-cyan-500' : 'text-white/30 hover:text-white/60'}
              `}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.5} />
              <span className="text-[11px] font-bold tracking-tighter uppercase">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </footer>
  );
}
