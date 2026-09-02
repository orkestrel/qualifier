import type { QualifierErrorCode, QualifierErrorContext } from './types.js'

/**
 * A coded programmer error thrown by the qualifier layer.
 *
 * @remarks
 * `DEFINITION` — a qualification definition failed semantic validation, and
 * `context.definition` names it. `MISMATCH` — a subject is not a record or already
 * carries the reserved `qualification` key. `DESTROYED` — use of a destroyed
 * qualifier. `ENGINE` — the underlying reason engine threw while running a pass;
 * `context.pass` names the pass and `context.cause` preserves the original throw.
 * `context` is absent for a throw that carries no payload.
 */
export class QualifierError extends Error {
	readonly code: QualifierErrorCode
	readonly context: QualifierErrorContext | undefined

	constructor(code: QualifierErrorCode, message: string, context?: QualifierErrorContext) {
		super(message)
		this.name = 'QualifierError'
		this.code = code
		this.context = context
	}
}

/**
 * Narrow a caught value to a {@link QualifierError}.
 *
 * @param value - The caught value to test
 * @returns True if `value` is a {@link QualifierError} instance; false otherwise
 */
export function isQualifierError(value: unknown): value is QualifierError {
	return value instanceof QualifierError
}
