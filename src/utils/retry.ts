export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  exponentialBase: number;
}

export interface RetryPayload<T = any> {
  data: T;
  retryCount: number;
  maxRetries: number;
}

export interface RetryResult {
  shouldRetry: boolean;
  delay: number;
  nextRetryCount: number;
}

export class ExponentialBackoff {
  constructor(
    private config: RetryConfig = {
      maxRetries: 3,
      baseDelay: 10,
      exponentialBase: 2
    }
  ) {}

  calculateDelay(retryCount: number): number {
    return Math.pow(this.config.exponentialBase, retryCount) * this.config.baseDelay;
  }

  shouldRetry(retryCount: number, maxRetries?: number): boolean {
    const limit = maxRetries ?? this.config.maxRetries;
    return retryCount < limit;
  }

  getRetryResult(retryCount: number, maxRetries?: number): RetryResult {
    const limit = maxRetries ?? this.config.maxRetries;
    const shouldRetry = this.shouldRetry(retryCount, limit);
    
    return {
      shouldRetry,
      delay: shouldRetry ? this.calculateDelay(retryCount) : 0,
      nextRetryCount: retryCount + 1
    };
  }

  createRetryPayload<T>(data: T, maxRetries?: number): RetryPayload<T> {
    return {
      data,
      retryCount: 0,
      maxRetries: maxRetries ?? this.config.maxRetries
    };
  }
}

export const defaultBackoff = new ExponentialBackoff();