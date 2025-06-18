export class InstanceLockedError extends Error {
  constructor(public agentId: string, message?: string) {
    super(message || `Agent instance ${agentId} is locked due to a migration failure.`);
    this.name = 'InstanceLockedError';
  }
}