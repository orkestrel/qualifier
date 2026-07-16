import { describe, expect, it } from 'vitest'
import type { Finding } from '@src/core'
import {
	assertSubject,
	combineEligibilities,
	deriveFindingEligibility,
	deriveScopeEligibilities,
	describeComparison,
	describePremise,
	describeValue,
	findDuplicateIds,
	findMissingReferences,
	findRule,
	hasReservedKey,
	interpolateMessage,
	mergeQualificationContext,
	qualificationDefinition,
	qualificationToRecord,
	quantitativeResultToDerivation,
	QUALIFICATION_KEY,
	reasonResultToProjection,
	rulingDefinition,
} from '@src/core'
import { atom, logicalDefinition, quantitativeDefinition, rule } from '@orkestrel/reason'

const gatesPass = logicalDefinition('gates', 'Gates', [
	rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
])
const capPass = quantitativeDefinition('cap', 'Cap', [])

function finding(
	overrides: Partial<Finding> & Pick<Finding, 'id' | 'pass' | 'rule' | 'effect' | 'applied'>,
): Finding {
	return {
		premises: [],
		...overrides,
	}
}

describe('helpers', () => {
	describe('combineEligibilities', () => {
		it('returns the most severe eligibility', () => {
			expect(combineEligibilities(['eligible', 'referral'])).toBe('referral')
			expect(combineEligibilities(['eligible', 'ineligible'])).toBe('ineligible')
			expect(combineEligibilities(['referral', 'ineligible'])).toBe('ineligible')
		})

		it('returns eligible for an empty list', () => {
			expect(combineEligibilities([])).toBe('eligible')
		})
	})

	describe('interpolateMessage', () => {
		it('groups thousands in numeric tokens', () => {
			expect(interpolateMessage('Limit is {{limit}}', { limit: 5010 })).toBe('Limit is 5,010')
		})

		it('renders unresolved tokens as empty strings', () => {
			expect(interpolateMessage('Missing {{gone}}', {})).toBe('Missing ')
		})
	})

	describe('describeComparison', () => {
		it('renders comparison verbs', () => {
			expect(describeComparison('equals')).toBe('is')
			expect(describeComparison('above')).toBe('is more than')
			expect(describeComparison('between')).toBe('is between')
		})
	})

	describe('describeValue', () => {
		it('renders arrays', () => {
			expect(describeValue([18, 25, 40])).toBe('18, 25, 40')
		})

		it('renders bounds', () => {
			expect(describeValue({ minimum: 18, maximum: 65 })).toBe('18 and 65')
		})

		it('renders scalars', () => {
			expect(describeValue(42)).toBe('42')
		})
	})

	describe('describePremise', () => {
		it('renders a field premise sentence', () => {
			const sentence = describePremise({
				field: 'age',
				comparison: 'above',
				expected: 18,
				actual: 25,
				met: true,
			})
			expect(sentence).toBe('age is more than 18 → met')
		})
	})

	describe('findRule', () => {
		it('locates a rule by id', () => {
			const ruleEntry = findRule(gatesPass, 'licensed')
			expect(ruleEntry?.id).toBe('licensed')
		})

		it('returns undefined for a missing rule', () => {
			expect(findRule(gatesPass, 'missing')).toBeUndefined()
		})
	})

	describe('findMissingReferences', () => {
		it('reports missing pass, non-logical pass, missing rule, and reserved pass id', () => {
			const definition = qualificationDefinition('bad', 'Bad', [capPass, gatesPass], {
				rulings: [
					rulingDefinition('missing-pass', 'absent', 'licensed', 'restriction'),
					rulingDefinition('quant-pass', 'cap', 'base', 'restriction'),
					rulingDefinition('missing-rule', 'gates', 'absent', 'restriction'),
				],
			})
			const reserved = qualificationDefinition('reserved', 'Reserved', [
				quantitativeDefinition(QUALIFICATION_KEY, 'Reserved', []),
			])
			const errors = findMissingReferences(definition)
			expect(errors).toContain("Ruling 'missing-pass' references missing pass 'absent'")
			expect(errors).toContain("Ruling 'quant-pass' references non-logical pass 'cap'")
			expect(errors).toContain(
				"Ruling 'missing-rule' references missing rule 'absent' in pass 'gates'",
			)
			expect(findMissingReferences(reserved)).toContain(
				`Pass id must not equal reserved key '${QUALIFICATION_KEY}'`,
			)
		})
	})

	describe('findDuplicateIds', () => {
		it('returns each duplicate id once', () => {
			expect(findDuplicateIds(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b'])
		})
	})

	describe('quantitativeResultToDerivation', () => {
		it('projects a quantitative result into a derivation record', () => {
			const derivation = quantitativeResultToDerivation('cap', {
				reasoning: 'quantitative',
				value: 1_010_000,
				groups: [],
				count: 0,
				success: true,
				trace: ['step'],
				errors: [],
			})
			expect(derivation).toEqual({
				id: 'cap',
				value: 1_010_000,
				success: true,
				trace: ['step'],
				errors: [],
			})
		})
	})

	describe('reasonResultToProjection', () => {
		it('projects a quantitative value', () => {
			const projection = reasonResultToProjection(capPass, {
				reasoning: 'quantitative',
				value: 500,
				groups: [],
				count: 0,
				success: true,
				trace: [],
				errors: [],
			})
			expect(projection).toBe(500)
		})

		it('projects a logical conclusion and merged atom leaves', () => {
			const projection = reasonResultToProjection(gatesPass, {
				reasoning: 'logical',
				conclusion: true,
				count: 1,
				success: true,
				trace: [],
				errors: [],
				rules: [{ id: 'licensed', applied: true, premises: [true], conclusion: true }],
			})
			expect(projection).toEqual({ conclusion: true, blocked: true })
		})

		it('returns false for mismatched result shapes', () => {
			expect(
				reasonResultToProjection(capPass, {
					reasoning: 'logical',
					conclusion: true,
					count: 0,
					success: true,
					trace: [],
					errors: [],
					rules: [],
				}),
			).toBe(false)
		})

		it('never pollutes Object.prototype through hostile conclusion keys', () => {
			const polluted = logicalDefinition('pollute', 'Pollute', [
				rule(
					'proto',
					[atom('licensed', 'equals', false)],
					atom(['__proto__', 'polluted'], 'equals', true),
				),
			])
			const before = Object.prototype
			reasonResultToProjection(polluted, {
				reasoning: 'logical',
				conclusion: true,
				count: 1,
				success: true,
				trace: [],
				errors: [],
				rules: [{ id: 'proto', applied: true, premises: [true], conclusion: true }],
			})
			expect(Object.prototype).toBe(before)
			expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
		})
	})

	describe('mergeQualificationContext / qualificationToRecord', () => {
		it('merges projections and wraps them under the reserved key', () => {
			const merged = mergeQualificationContext({}, 'cap', 500)
			expect(qualificationToRecord(merged)).toEqual({ qualification: { cap: 500 } })
		})
	})

	describe('assertSubject / hasReservedKey', () => {
		it('throws MISMATCH for a non-record subject', () => {
			expect(() => assertSubject(null)).toThrow(
				expect.objectContaining({ code: 'MISMATCH', name: 'QualifierError' }),
			)
			expect(() => assertSubject('subject')).toThrow(
				expect.objectContaining({ code: 'MISMATCH', name: 'QualifierError' }),
			)
		})

		it('throws MISMATCH when the subject already owns the reserved key', () => {
			expect(hasReservedKey({ id: 'a', qualification: {} })).toBe(true)
			expect(() => assertSubject({ id: 'a', qualification: {} })).toThrow(
				expect.objectContaining({ code: 'MISMATCH', name: 'QualifierError' }),
			)
		})
	})

	describe('deriveFindingEligibility', () => {
		it('derives global eligibility from unscoped applied findings', () => {
			const findings = [
				finding({
					id: 'a',
					pass: 'gates',
					rule: 'licensed',
					effect: 'referral',
					applied: true,
				}),
				finding({
					id: 'b',
					pass: 'gates',
					rule: 'blocked',
					effect: 'restriction',
					applied: true,
				}),
			]
			expect(deriveFindingEligibility(findings)).toBe('ineligible')
		})

		it('ignores scoped findings for global eligibility', () => {
			const findings = [
				finding({
					id: 'wind',
					pass: 'wind',
					rule: 'coastal',
					effect: 'restriction',
					applied: true,
					scope: 'wind',
				}),
			]
			expect(deriveFindingEligibility(findings)).toBe('eligible')
		})

		it('adds referral when failed is true', () => {
			expect(deriveFindingEligibility([], true)).toBe('referral')
		})
	})

	describe('deriveScopeEligibilities', () => {
		it('groups scoped findings by severity', () => {
			const findings = [
				finding({
					id: 'wind',
					pass: 'wind',
					rule: 'coastal',
					effect: 'restriction',
					applied: true,
					scope: 'wind',
				}),
				finding({
					id: 'ex',
					pass: 'gates',
					rule: 'vacant',
					effect: 'condition',
					applied: true,
					scope: 'exWind',
				}),
			]
			expect(deriveScopeEligibilities(findings)).toEqual({
				wind: 'ineligible',
				exWind: 'eligible',
			})
		})
	})
})
