import { AgentNamespace } from 'agents';
import type { MyAgent } from './agents/MyAgent';
import type { SupervisorAgent } from './agents/SupervisorAgent';
import type { WorkerAgent } from './agents/WorkerAgent';

export interface WorkerEnv {
  MY_AGENT: AgentNamespace<MyAgent>;
  SUPERVISOR: AgentNamespace<SupervisorAgent>;
  WORKER: AgentNamespace<WorkerAgent>;
}