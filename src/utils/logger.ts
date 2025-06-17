interface LogData {
  [key: string]: any;
}

interface BaseLogEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  eventType: string;
  message: string;
  data?: LogData;
}

interface AgentLogEvent extends BaseLogEvent {
  agentClass: string;
  agentId: string;
  traceId?: string;
}

interface WorkflowLogEvent extends BaseLogEvent {
  workflowClass: string;
  workflowId: string;
  traceId?: string;
}

export class Logger {
  private static generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static logAgent(config: {
    agentClass: string;
    agentId: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    eventType: string;
    message: string;
    data?: LogData;
    traceId?: string;
  }): void {
    const logEvent: AgentLogEvent = {
      timestamp: new Date().toISOString(),
      agentClass: config.agentClass,
      agentId: config.agentId,
      traceId: config.traceId || this.generateTraceId(),
      eventType: config.eventType,
      level: config.level,
      message: config.message,
      ...(config.data && { data: config.data })
    };

    console.log(JSON.stringify(logEvent));
  }

  static logWorkflow(config: {
    workflowClass: string;
    workflowId: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    eventType: string;
    message: string;
    data?: LogData;
    traceId?: string;
  }): void {
    const logEvent: WorkflowLogEvent = {
      timestamp: new Date().toISOString(),
      workflowClass: config.workflowClass,
      workflowId: config.workflowId,
      traceId: config.traceId || this.generateTraceId(),
      eventType: config.eventType,
      level: config.level,
      message: config.message,
      ...(config.data && { data: config.data })
    };

    console.log(JSON.stringify(logEvent));
  }

  static log(config: {
    level: 'info' | 'warn' | 'error' | 'debug';
    eventType: string;
    message: string;
    data?: LogData;
    traceId?: string;
  }): void {
    const logEvent: BaseLogEvent = {
      timestamp: new Date().toISOString(),
      level: config.level,
      eventType: config.eventType,
      message: config.message,
      ...(config.traceId && { traceId: config.traceId }),
      ...(config.data && { data: config.data })
    };

    console.log(JSON.stringify(logEvent));
  }

  // Convenience methods for common use cases
  static info(eventType: string, message: string, data?: LogData): void {
    this.log({ level: 'info', eventType, message, data });
  }

  static warn(eventType: string, message: string, data?: LogData): void {
    this.log({ level: 'warn', eventType, message, data });
  }

  static error(eventType: string, message: string, data?: LogData): void {
    this.log({ level: 'error', eventType, message, data });
  }

  static debug(eventType: string, message: string, data?: LogData): void {
    this.log({ level: 'debug', eventType, message, data });
  }
}

// Agent-specific logger helper
export class AgentLogger {
  constructor(
    private agentClass: string,
    private agentId: string,
    private traceId?: string
  ) {}

  log(level: 'info' | 'warn' | 'error' | 'debug', eventType: string, message: string, data?: LogData): void {
    Logger.logAgent({
      agentClass: this.agentClass,
      agentId: this.agentId,
      level,
      eventType,
      message,
      data,
      traceId: this.traceId
    });
  }

  info(eventType: string, message: string, data?: LogData): void {
    this.log('info', eventType, message, data);
  }

  warn(eventType: string, message: string, data?: LogData): void {
    this.log('warn', eventType, message, data);
  }

  error(eventType: string, message: string, data?: LogData): void {
    this.log('error', eventType, message, data);
  }

  debug(eventType: string, message: string, data?: LogData): void {
    this.log('debug', eventType, message, data);
  }
}

// Workflow-specific logger helper
export class WorkflowLogger {
  constructor(
    private workflowClass: string,
    private workflowId: string,
    private traceId?: string
  ) {}

  log(level: 'info' | 'warn' | 'error' | 'debug', eventType: string, message: string, data?: LogData): void {
    Logger.logWorkflow({
      workflowClass: this.workflowClass,
      workflowId: this.workflowId,
      level,
      eventType,
      message,
      data,
      traceId: this.traceId
    });
  }

  info(eventType: string, message: string, data?: LogData): void {
    this.log('info', eventType, message, data);
  }

  warn(eventType: string, message: string, data?: LogData): void {
    this.log('warn', eventType, message, data);
  }

  error(eventType: string, message: string, data?: LogData): void {
    this.log('error', eventType, message, data);
  }

  debug(eventType: string, message: string, data?: LogData): void {
    this.log('debug', eventType, message, data);
  }
}