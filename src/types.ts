import { AgentNamespace } from 'agents';
import type { MyAgent } from './agents/MyAgent';
import type { SupervisorAgent } from './agents/SupervisorAgent';
import type { WorkerAgent } from './agents/WorkerAgent';
import type { HistoryAgent } from './agents/HistoryAgent';
import type { CounterAgent } from './agents/CounterAgent';
import type { MigratingAgent } from './agents/MigratingAgent';
import type { EchoAgent } from './agents/EchoAgent';
import type { StreamingAgent } from './agents/StreamingAgent';
import type { ChattyAgent } from './agents/ChattyAgent';

export interface WorkerEnv {
  MY_AGENT: AgentNamespace<MyAgent>;
  SUPERVISOR: AgentNamespace<SupervisorAgent>;
  WORKER: AgentNamespace<WorkerAgent>;
  HISTORY_AGENT: AgentNamespace<HistoryAgent>;
  COUNTER_AGENT: AgentNamespace<CounterAgent>;
  MIGRATING_AGENT: AgentNamespace<MigratingAgent>;
  ECHO_AGENT: AgentNamespace<EchoAgent>;
  STREAMING_AGENT: AgentNamespace<StreamingAgent>;
  CHATTY_AGENT: AgentNamespace<ChattyAgent>;
  OPENAI_API_KEY: string;
}