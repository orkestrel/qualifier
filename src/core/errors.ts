import type { QualifierErrorCode, QualifierErrorContext } from './types.js'
import { holds, INTRINSICS, isObject } from '@orkestrel/contract'

/**
 * Represents a coded programmer error thrown by the qualifier layer, carrying a
 * `QualifierErrorCode` and an optional context record.
 *
 * @remarks
 * `DEFINITION` — a qualification definition failed semantic validation; when
 * `qualify`'s own validation raises it, `context.definition` names the
 * definition, and when an engine throw maps to it, `context.pass` names the pass
 * and `context.cause` preserves the original throw. `MISMATCH` — a subject is
 * not a record or already carries the reserved `qualification` key.
 * `DESTROYED` — use of a destroyed qualifier; an engine-mapped one carries
 * `context.pass` and `context.cause`. `ENGINE` — the underlying reason engine
 * threw while running a pass; `context.pass` names the pass and `context.cause`
 * preserves the original throw. `context` is absent for a throw that carries no
 * payload.
 */
export class QualifierError extends Error {
	readonly code: QualifierErrorCode
	readonly context: QualifierErrorContext | undefined

	constructor(code: QualifierErrorCode, message: string, context?: QualifierErrorContext) {
		super(message)
		INTRINSICS.define(this, Symbol.for('@orkestrel/qualifier.QualifierError'), { value: this })
		this.name = 'QualifierError'
		this.code = code
		this.context = context
	}
}

/**
 * Narrows a caught value to a {@link QualifierError}.
 *
 * @param value - The caught value to test
 * @returns True if the error carries its own identity brand and declared members; false otherwise
 */
export function isQualifierError(value: unknown): value is QualifierError {
	return holds(() => {
		if (!(value instanceof Error) || INTRINSICS.prototype(value) === Error.prototype) return false
		const brand = INTRINSICS.describe(value, Symbol.for('@orkestrel/qualifier.QualifierError'))
		if (brand?.value !== value) return false
		const code: unknown = INTRINSICS.reflect.read(value, 'code')
		if (code !== 'DEFINITION' && code !== 'MISMATCH' && code !== 'DESTROYED' && code !== 'ENGINE')
			return false
		const context: unknown = INTRINSICS.reflect.read(value, 'context')
		if (context === undefined) return true
		if (!isObject(context)) return false
		const pass: unknown = INTRINSICS.reflect.read(context, 'pass')
		const definition: unknown = INTRINSICS.reflect.read(context, 'definition')
		return (
			(pass === undefined || typeof pass === 'string') &&
			(definition === undefined || typeof definition === 'string')
		)
	})
}
