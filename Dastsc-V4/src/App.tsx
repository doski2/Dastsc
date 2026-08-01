import { useState } from 'react';
import { useAgent } from './hooks/useAgent';
import { AgentHeadline } from './components/AgentHeadline';
import { ArmActionBar } from './components/ArmActionBar';
import { AppShell, type AppView } from './components/AppShell';
import { BrakePlanPanel } from './components/BrakePlanPanel';
import { ConfigView } from './components/ConfigView';
import { HorizonStrip } from './components/HorizonStrip';
import { MiniHud } from './components/MiniHud';

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('agent');
  const {
    snapshot,
    agent,
    isConnected,
    useLive,
    brakeStats,
    activeProfile,
    availableProfiles,
    policyMode,
    profileSelection,
    setPolicyMode,
    selectProfile,
    sendCommand,
    lastCommandAck,
  } = useAgent();

  const connected = isConnected && (useLive || snapshot.connected);

  return (
    <AppShell
      trainName={snapshot.train.name}
      profileId={snapshot.train.profileId}
      mode={agent.mode}
      connected={connected}
      activeView={activeView}
      onViewChange={setActiveView}
    >
      {activeView === 'agent' ? (
        <>
          <AgentHeadline tick={agent} speedUnit={snapshot.speedUnit} />
          <ArmActionBar
            action={agent.suggestedAction}
            mode={policyMode}
            connected={connected}
            lastAck={lastCommandAck}
            onConfirm={sendCommand}
          />
          <BrakePlanPanel tick={agent} speedUnit={snapshot.speedUnit} brakeStats={brakeStats} />
          <HorizonStrip events={agent.horizon} speedUnit={snapshot.speedUnit} />
          <MiniHud
            speed={snapshot.speedDisplay}
            speedUnit={snapshot.speedUnit}
            limit={snapshot.limits.effective}
            tailActive={snapshot.tail.active}
          />
        </>
      ) : (
        <ConfigView
          snapshot={snapshot}
          isConnected={isConnected}
          useLive={useLive}
          availableProfiles={availableProfiles}
          activeProfile={activeProfile}
          profileSelection={profileSelection}
          policyMode={policyMode}
          onSelectProfile={selectProfile}
          onPolicyModeChange={setPolicyMode}
        />
      )}
    </AppShell>
  );
}
