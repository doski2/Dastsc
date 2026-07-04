import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTelemetry } from './v3/core/TelemetryContext';
import { AppHeader } from './v3/components/shell/AppHeader';
import { AppTabBar } from './v3/components/shell/AppTabBar';
import { ConfigTab } from './v3/components/shell/ConfigTab';
import { PilotHudTab } from './v3/components/shell/PilotHudTab';
import { isImplementedTab, type AppTabId } from './v3/components/shell/appUtils';

function PlaceholderTab({ tab }: { tab: AppTabId }) {
  return (
    <div className="h-full flex items-center justify-center">
      <span className="text-[10px] font-mono text-white/10 uppercase tracking-[1em]">
        Initialising {tab} Module...
      </span>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTabId>('PILOT');
  const { data, isConnected, activeProfile } = useTelemetry();

  return (
    <div className="h-screen w-screen flex flex-col bg-nexus-surface text-nexus-fg overflow-hidden leading-none font-sans">
      <AppHeader data={data} isConnected={isConnected} activeProfile={activeProfile} />

      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            {activeTab === 'PILOT' && (
              <PilotHudTab data={data} isConnected={isConnected} />
            )}
            {activeTab === 'CONFIG' && (
              <ConfigTab data={data} isConnected={isConnected} />
            )}
            {!isImplementedTab(activeTab) && <PlaceholderTab tab={activeTab} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <AppTabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
