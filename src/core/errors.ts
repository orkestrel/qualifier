import type { QualifierErrorCode } from './types.js'

/**
 * A coded programmer error thrown by the qualifier layer.
 *
 * @remarks
 * `DEFINITION` — a qualification definition failed semantic validation.
 * `MISMATCH` — a subject is not a record or already carries the reserved
 * `qualification` key. `DESTROYED` — use of a destroyed qualifier.
 * `ENGINE` — the underlying reason engine threw while running a pass (the
 * original throw is preserved as `context.cause`).
 */
export class QualifierError extends Error {
	readonly code: QualifierErrorCode
	readonly context: unknown

	constructor(code: QualifierErrorCode, message: string, context?: unknown) {
		super(message)
		this.name = 'QualifierError'
		this.code = code
		this.context = context
	}
}

/** Narrow a caught value to a {@link QualifierError}. */
export function isQualifierError(value: unknown): value is QualifierError {
	return value instanceof QualifierError
}
