/** Upstream GitHub crash reporting is unavailable in this fork.
 * Exceptions continue to be handled and logged locally by the caller.
 */
export async function reportError(
  _error: Error,
  _extra?: { [key: string]: string },
  _nonFatal?: boolean
): Promise<void> {}
