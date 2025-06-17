import { AgentNamespace } from 'agents';
import type { ChattyAgent } from './agents/ChattyAgent';
import type { CounterAgent } from './agents/CounterAgent';
import type { EchoAgent } from './agents/EchoAgent';
import type { HistoryAgent } from './agents/HistoryAgent';
import type { MigratingAgent } from './agents/MigratingAgent';
import type { MyAgent } from './agents/MyAgent';
import type { StreamingAgent } from './agents/StreamingAgent';
import type { SupervisorAgent } from './agents/SupervisorAgent';
import type { WorkerAgent } from './agents/WorkerAgent';

export interface WorkerEnv {
  CHATTY_AGENT: AgentNamespace<ChattyAgent>;
  COUNTER_AGENT: AgentNamespace<CounterAgent>;
  ECHO_AGENT: AgentNamespace<EchoAgent>;
  HISTORY_AGENT: AgentNamespace<HistoryAgent>;
  MIGRATING_AGENT: AgentNamespace<MigratingAgent>;
  MY_AGENT: AgentNamespace<MyAgent>;
  STREAMING_AGENT: AgentNamespace<StreamingAgent>;
  SUPERVISOR_AGENT: AgentNamespace<SupervisorAgent>;
  WORKER_AGENT: AgentNamespace<WorkerAgent>;
  OPENAI_API_KEY: string;
}