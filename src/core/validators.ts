import type { QualificationDefinition, QualificationPass, Ruling } from './types.js'
import { arrayOf, isRecord, isString, literalOf, recordOf } from '@orkestrel/contract'
import { isLogicalDefinition, isQuantitativeDefinition } from '@orkestrel/reason'

/** Determine whether a value is an {@link Eligibility} literal. */
export const isEligibility = literalOf('eligible', 'ineligible', 'referral')

/** Determine whether a value is a {@link QualificationEffect} literal. */
export const isQualificationEffect = literalOf('restriction', 'referral', 'condition')

/** Determine whether a value is a {@link QualificationPass} (a quantitative or logical definition). */
export function isQualificationPass(value: unknown): value is QualificationPass {
	return isQuantitativeDefinition(value) || isLogicalDefinition(value)
}

/** Determine whether a value is an exact {@link Ruling} record. */
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

/** Determine whether a value is an exact {@link QualificationDefinition} record. */
export function isQualificationDefinition(value: unknown): value is QualificationDefinition {
	if (!isRecord(value)) return false
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
