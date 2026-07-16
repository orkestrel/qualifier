import type {
	QualificationDefinition,
	QualificationEffect,
	QualificationInput,
	QualificationPass,
	QualifierInterface,
	QualifierOptions,
	Ruling,
	RulingInput,
} from './types.js'
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

/**
 * Build a {@link QualificationDefinition}.
 *
 * @remarks
 * Returns a fresh top-level definition, omitting absent optional keys;
 * `passes` and `rulings` arrays are copied, and record `metadata` is
 * shallow-copied so nested values are not deep-cloned.
 *
 * @param id - The definition id
 * @param name - The display name
 * @param passes - The ordered qualification passes
 * @param input - Optional description, rulings, and metadata
 * @returns A fresh qualification definition
 *
 * @example
 * ```ts
 * import { qualificationDefinition } from '@orkestrel/qualifier'
 *
 * qualificationDefinition('standard', 'Standard', [gates], { rulings: [ruling] })
 * ```
 */
export function qualificationDefinition(
	id: string,
	name: string,
	passes: QualificationPass[],
	input?: QualificationInput,
): QualificationDefinition {
	return {
		id,
		name,
		passes: [...passes],
		...(input?.description === undefined ? {} : { description: input.description }),
		...(input?.rulings === undefined ? {} : { rulings: [...input.rulings] }),
		...(input?.metadata === undefined ? {} : { metadata: { ...input.metadata } }),
	}
}

/**
 * Build a {@link Ruling} — one authored consequence for one rule in one pass.
 *
 * @param id - The ruling id
 * @param pass - The logical pass id the rule lives in
 * @param rule - The rule id whose firing this ruling reacts to
 * @param effect - The eligibility impact when the rule fires
 * @param input - Optional rating scope and message template
 * @returns A fresh ruling
 *
 * @example
 * ```ts
 * import { rulingDefinition } from '@orkestrel/qualifier'
 *
 * rulingDefinition('license', 'gates', 'licensed', 'restriction', { message: 'A license is required' })
 * ```
 */
export function rulingDefinition(
	id: string,
	pass: string,
	rule: string,
	effect: QualificationEffect,
	input?: RulingInput,
): Ruling {
	return {
		id,
		pass,
		rule,
		effect,
		...(input?.scope === undefined ? {} : { scope: input.scope }),
		...(input?.message === undefined ? {} : { message: input.message }),
	}
}
