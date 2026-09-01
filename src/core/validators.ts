import type {
	Derivation,
	Eligibility,
	Finding,
	Premise,
	QualificationDefinition,
	QualificationPass,
	QualificationResult,
	QualificationValidationResult,
	Ruling,
} from './types.js'
import type { Guard } from '@orkestrel/contract'
import {
	arrayOf,
	isBoolean,
	isNumber,
	isRecord,
	isString,
	literalOf,
	objectOf,
	recordOf,
	whereOf,
} from '@orkestrel/contract'
import {
	isComparison,
	isFieldPath,
	isLogicalDefinition,
	isQuantitativeDefinition,
	isReasonValidationResult,
} from '@orkestrel/reason'

/**
 * Determine whether a value is an {@link Eligibility} literal.
 *
 * @param value - The value to test
 * @returns True if `value` is one of the eligibility literals; false otherwise
 */
export const isEligibility = literalOf('eligible', 'ineligible', 'referral')

/**
 * Determine whether a value is a {@link QualificationEffect} literal.
 *
 * @param value - The value to test
 * @returns True if `value` is one of the effect literals; false otherwise
 */
export const isQualificationEffect = literalOf('restriction', 'referral', 'condition')

/**
 * Determine whether a value is an open string-keyed record of {@link Eligibility} values.
 *
 * @remarks
 * Every own string-named property is checked, including non-enumerable properties. Inherited and
 * symbol-named members are left unchecked because they are outside the record this guard certifies.
 *
 * @param value - The value to test
 * @returns `true` when `value` is a non-array object whose own string-named values are eligibilities
 */
export function isEligibilityRecord(
	value: unknown,
): value is Readonly<Record<string, Eligibility>> {
	return whereOf(objectOf({}), (record): record is Readonly<Record<string, Eligibility>> =>
		Object.getOwnPropertyNames(record).every((key) => isEligibility(Reflect.get(record, key))),
	)(value)
}

/**
 * Determine whether a value is an open result-side {@link Premise}.
 *
 * @remarks
 * `expected` is unchecked and may be absent or contain any value because its published type is
 * `unknown`. `actual` is unchecked and may be absent or contain any value for the same reason.
 * Unknown members are admitted.
 *
 * @param value - The value to test
 * @returns `true` when every checked premise member follows its published type
 */
export function isPremise(value: unknown): value is Premise {
	return objectOf(
		{
			field: isFieldPath,
			label: isString,
			description: isString,
			comparison: isComparison,
			met: isBoolean,
		},
		['field', 'label', 'description', 'comparison', 'met'],
	)(value)
}

/**
 * Determine whether a value is an open result-side {@link Finding}.
 *
 * @remarks
 * Unknown members are admitted. Optional `scope` and `message` members may be absent or
 * `undefined`; a present defined value must be a string.
 *
 * @param value - The value to test
 * @returns `true` when every published finding member is valid
 */
export function isFinding(value: unknown): value is Finding {
	return objectOf(
		{
			id: isString,
			pass: isString,
			rule: isString,
			effect: isQualificationEffect,
			scope: isString,
			applied: isBoolean,
			message: isString,
			premises: arrayOf(isPremise),
		},
		['scope', 'message'],
	)(value)
}

/**
 * Determine whether a value is an open result-side {@link Derivation}.
 *
 * @remarks
 * Unknown members are admitted. `value` follows the published `number` type, including `NaN` and
 * infinities.
 *
 * @param value - The value to test
 * @returns `true` when every published derivation member is valid
 */
export function isDerivation(value: unknown): value is Derivation {
	return objectOf({
		id: isString,
		value: isNumber,
		success: isBoolean,
		trace: arrayOf(isString),
		errors: arrayOf(isString),
	})(value)
}

/**
 * Determine whether a value is an open {@link QualificationResult} returned by a qualifier.
 *
 * @remarks
 * This guard is result-postured for values returned through a borrowed qualifier interface. It
 * admits unknown members and class instances while checking the complete published result closure.
 *
 * @param value - The value to test
 * @returns `true` when every published qualification-result member is valid
 */
export function isQualificationResult(value: unknown): value is QualificationResult {
	return objectOf({
		id: isString,
		name: isString,
		eligibility: isEligibility,
		scopes: isEligibilityRecord,
		findings: arrayOf(isFinding),
		derivations: arrayOf(isDerivation),
		success: isBoolean,
		trace: arrayOf(isString),
		errors: arrayOf(isString),
	})(value)
}

/**
 * Determine whether a value is an open {@link QualificationValidationResult} returned by a qualifier.
 *
 * @remarks
 * `QualificationValidationResult` is an alias of reasons' validation-result type, so this IS
 * reasons' published open result guard by delegation — the alias tracks reasons' shape
 * automatically, and a hand-written member list here would silently stop checking a member a
 * later reason release adds.
 *
 * @param value - The value to test
 * @returns `true` when every published qualification-validation-result member is valid
 */
export const isQualificationValidationResult: Guard<QualificationValidationResult> =
	isReasonValidationResult

/**
 * Determine whether a value is a {@link QualificationPass} (a quantitative or logical definition).
 *
 * @param value - The value to test
 * @returns True if `value` is a complete reason quantitative or logical definition; false otherwise
 */
export function isQualificationPass(value: unknown): value is QualificationPass {
	return isQuantitativeDefinition(value) || isLogicalDefinition(value)
}

/**
 * Determine whether a value is an exact {@link Ruling} record.
 *
 * @param value - The value to test
 * @returns True if `value` carries every ruling member and no unknown key; false otherwise
 */
export function isRuling(value: unknown): value is Ruling {
	return recordOf(
		{
			id: isString,
			pass: isString,
			rule: isString,
			effect: isQualificationEffect,
			scope: isString,
			message: isString,
		},
		['scope', 'message'],
	)(value)
}

/**
 * Determine whether a value is an exact {@link QualificationDefinition} record.
 *
 * @param value - The value to test
 * @returns True if `value` carries every definition member and no unknown key; false otherwise
 */
export function isQualificationDefinition(value: unknown): value is QualificationDefinition {
	return recordOf(
		{
			id: isString,
			name: isString,
			description: isString,
			passes: arrayOf(isQualificationPass),
			rulings: arrayOf(isRuling),
			metadata: isRecord,
		},
		['description', 'rulings', 'metadata'],
	)(value)
}
