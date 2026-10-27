export class ServiceDeskError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The service answered with a business or access error (4xx, or a 5xx that retrying will not fix). */
export class ServiceDeskApiError extends ServiceDeskError {}

/** The service could not be reached, or stayed unavailable through every retry. */
export class ServiceDeskUnavailableError extends ServiceDeskError {}

/** The service answered, but not in the shape this client was written against. */
export class ServiceDeskContractError extends ServiceDeskError {}

export function isNotFound(error: unknown): boolean {
  return error instanceof ServiceDeskApiError && error.status === 404;
}
