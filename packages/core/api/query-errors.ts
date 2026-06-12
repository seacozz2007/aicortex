import { ApiError } from "../api/client";

export function isApiErrorWithStatus(err: unknown, status: number): boolean {
  return err instanceof ApiError && err.status === status;
}

export function isMissingTaskError(err: unknown): boolean {
  return isApiErrorWithStatus(err, 404);
}

export function isTransientDaemonError(err: unknown): boolean {
  return (
    isApiErrorWithStatus(err, 502) ||
    isApiErrorWithStatus(err, 503) ||
    isApiErrorWithStatus(err, 504)
  );
}

export const TRANSIENT_DAEMON_RETRY_DELAYS = [500, 1000, 2000, 3000, 5000] as const;

export function transientDaemonRetryDelay(attempt: number): number {
  const index = Math.min(attempt, TRANSIENT_DAEMON_RETRY_DELAYS.length - 1);
  return TRANSIENT_DAEMON_RETRY_DELAYS[index] ?? 5000;
}
