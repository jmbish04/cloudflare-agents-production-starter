import { AgentNamespace } from 'agents';
import type { MyAgent } from './agents/MyAgent';
import type { SupervisorAgent } from './agents/SupervisorAgent';
import type { WorkerAgent } from './agents/WorkerAgent';
import type { HistoryAgent } from './agents/HistoryAgent';
import type { CounterAgent } from './agents/CounterAgent';
import type { MigratingAgent } from './agents/MigratingAgent';

export interface WorkerEnv {
  MY_AGENT: AgentNamespace<MyAgent>;
  SUPERVISOR: AgentNamespace<SupervisorAgent>;
  WORKER: AgentNamespace<WorkerAgent>;
  HISTORY_AGENT: AgentNamespace<HistoryAgent>;
  COUNTER_AGENT: AgentNamespace<CounterAgent>;
  MIGRATING_AGENT: AgentNamespace<MigratingAgent>;
}