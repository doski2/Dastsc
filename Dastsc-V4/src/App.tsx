import { useState } from 'react';
import { useAgent } from './hooks/useAgent';
import { useStationDistanceDebug } from './hooks/useStationDistanceDebug';
import { AgentHeadline } from './components/AgentHeadline';
import { ArmActionBar } from './components/ArmActionBar';
import { AppShell, type AppView } from './components/AppShell';
import { BrakePlanPanel } from './components/BrakePlanPanel';
import { ConfigView } from './components/ConfigView';
import { HorizonStrip } from './components/HorizonStrip';
import { MiniHud } from './components/MiniHud';
import { ProfileCompletenessPanel } from './components/ProfileCompletenessPanel';

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
    cabOverride,
    setCabOverride,
    sendCommand,
    lastCommandAck,
    profileCompleteness,
    profileAlertVisible,
    dismissProfileAlert,
  } = useAgent();

  const connected = isConnected && (useLive || snapshot.connected);
  const stationApproach =
    snapshot.station.distanceM >= 0 && snapshot.station.distanceM < 2000;
  const stationDebug = useStationDistanceDebug(connected && stationApproach);

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
          {profileAlertVisible && profileCompleteness && activeProfile?.id && (
            <ProfileCompletenessPanel
              profileId={activeProfile.id}
              completeness={profileCompleteness}
              onDismiss={dismissProfileAlert}
            />
          )}
          <AgentHeadline tick={agent} speedUnit={snapshot.speedUnit} />
          <ArmActionBar
            action={agent.suggestedAction}
            mode={policyMode}
            connected={connected}
            lastAck={lastCommandAck}
            onConfirm={sendCommand}
          />
          <BrakePlanPanel
            tick={agent}
            snapshot={snapshot}
            speedUnit={snapshot.speedUnit}
            brakeStats={brakeStats}
            stationDebug={stationDebug}
            cabOverride={cabOverride}
            onCabOverrideChange={setCabOverride}
          />
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
          brakeStats={brakeStats}
          onSelectProfile={selectProfile}
          onPolicyModeChange={setPolicyMode}
        />
      )}
    </AppShell>
  );
}
