import { useState } from 'react';
import { useAgent } from './hooks/useAgent';
import { useStationDistanceDebug } from './hooks/useStationDistanceDebug';
import { AgentHeadline } from './components/AgentHeadline';
import { ArmActionBar } from './components/ArmActionBar';
import { AppShell, type AppView } from './components/AppShell';
import { BrakePlanPanel } from './components/BrakePlanPanel';
import { ConfigView } from './components/ConfigView';
import { DriveHudBar } from './components/DriveHudBar';
import { HorizonStrip } from './components/HorizonStrip';
import { ProfileCompletenessPanel } from './components/ProfileCompletenessPanel';

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('agent');
  const {
    snapshot,
    agent,
    isBackendConnected,
    isGameLinked,
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

  const stationApproach =
    snapshot.station.distanceM >= 0 && snapshot.station.distanceM < 2000;
  const stationDebug = useStationDistanceDebug(isGameLinked && stationApproach);

  return (
    <AppShell
      trainName={snapshot.train.name}
      profileId={snapshot.train.profileId}
      mode={agent.mode}
      backendConnected={isBackendConnected}
      gameLinked={isGameLinked}
      activeView={activeView}
      onViewChange={setActiveView}
      driveHud={activeView === 'agent' ? <DriveHudBar snapshot={snapshot} /> : undefined}
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
            backendConnected={isBackendConnected}
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
        </>
      ) : (
        <ConfigView
          snapshot={snapshot}
          isBackendConnected={isBackendConnected}
          isGameLinked={isGameLinked}
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
