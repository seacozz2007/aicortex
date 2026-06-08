/** Read HTTP status from an ApiError without relying on instanceof (HMR-safe). */
export function apiErrorStatus(err: unknown): number | undefined {
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    return (err as { status: number }).status;
  }
  return undefined;
}

export function isChatSessionNotFound(err: unknown): boolean {
  if (apiErrorStatus(err) === 404) return true;
  return (
    err instanceof Error &&
    err.message.toLowerCase().includes("chat session not found")
  );
}
