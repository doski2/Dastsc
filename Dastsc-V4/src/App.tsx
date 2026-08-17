import { useState } from 'react';
import { useManualOcrCapture } from './hooks/useManualOcrCapture';
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
    gradientSign,
    setGradientSign,
    sendCommand,
    lastCommandAck,
    profileCompleteness,
    profileAlertVisible,
    dismissProfileAlert,
  } = useAgent();

  const stationApproach =
    snapshot.station.distanceM >= 0 && snapshot.station.distanceM < 2000;
  const stationDebug = useStationDistanceDebug(isGameLinked && stationApproach);
  const {
    capture: captureOcr,
    busy: ocrCaptureBusy,
    feedback: ocrCaptureFeedback,
  } = useManualOcrCapture(isGameLinked);

  return (
    <AppShell
      trainName={snapshot.train.name}
      profileId={snapshot.train.profileId}
      mode={agent.mode}
      backendConnected={isBackendConnected}
      gameLinked={isGameLinked}
      activeView={activeView}
      onViewChange={setActiveView}
      driveHud={activeView === 'agent' ? (
        <DriveHudBar
          snapshot={snapshot}
          gameLinked={isGameLinked}
          onOcrCapture={() => { void captureOcr(); }}
          ocrCaptureBusy={ocrCaptureBusy}
          ocrCaptureFeedback={ocrCaptureFeedback}
        />
      ) : undefined}
    >
      {activeView === 'agent' ? (
        <div className="flex flex-1 min-h-0 gap-4 flex-col xl:flex-row xl:overflow-hidden overflow-y-auto">
          <div className="flex flex-col gap-4 min-w-0 xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
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
            <HorizonStrip events={agent.horizon} speedUnit={snapshot.speedUnit} />
          </div>
          <aside className="w-full xl:w-[min(540px,48%)] xl:shrink-0 xl:min-h-0 xl:overflow-y-auto">
            <BrakePlanPanel
              tick={agent}
              snapshot={snapshot}
              speedUnit={snapshot.speedUnit}
              brakeStats={brakeStats}
              stationDebug={stationDebug}
              gradientSign={gradientSign}
              onGradientSignChange={setGradientSign}
              layout="sidebar"
            />
          </aside>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
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
        </div>
      )}
    </AppShell>
  );
}
