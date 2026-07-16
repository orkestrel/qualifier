import type { QualifierInterface, QualifierOptions } from './types.js'
import { Qualifier } from './Qualifier.js'

/**
 * Create one qualifier over a reason engine.
 *
 * @remarks
 * A standalone qualifier creates and OWNS one shared quantitative-plus-logical
 * reason engine, destroying it on `destroy()`. An injected `options.engine`
 * remains caller-owned and is never destroyed. Validation is on by default.
 *
 * @param options - Optional injected engine, validation, labels, and emitter hooks
 * @returns A {@link QualifierInterface}
 *
 * @example
 * ```ts
 * import { createQualifier } from '@orkestrel/qualifier'
 *
 * const qualifier = createQualifier()
 * qualifier.qualify({ id: 'risk-1' }, definition)
 * qualifier.destroy()
 * ```
 */
export function createQualifier(options?: QualifierOptions): QualifierInterface {
	return new Qualifier(options)
}
