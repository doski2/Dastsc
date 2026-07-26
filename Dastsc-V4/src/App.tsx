import { useAgent } from './hooks/useAgent';
import { AgentHeadline } from './components/AgentHeadline';
import { HorizonStrip } from './components/HorizonStrip';
import { MiniHud } from './components/MiniHud';
import { AppShell } from './components/AppShell';

export default function App() {
  const { snapshot, agent, isConnected, useLive } = useAgent('SUGGEST');

  return (
    <AppShell
      trainName={snapshot.train.name}
      profileId={snapshot.train.profileId}
      mode={agent.mode}
      connected={isConnected && (useLive || snapshot.connected)}
    >
      <AgentHeadline tick={agent} speedUnit={snapshot.speedUnit} />
      <HorizonStrip events={agent.horizon} speedUnit={snapshot.speedUnit} />
      <MiniHud
        speed={snapshot.speedDisplay}
        speedUnit={snapshot.speedUnit}
        limit={snapshot.limits.effective}
        tailActive={snapshot.tail.active}
      />
    </AppShell>
  );
}
