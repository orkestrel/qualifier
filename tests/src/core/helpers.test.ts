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
	findEmptyLogicalPasses,
	findMissingReferences,
	findRule,
	findUnreadDerivations,
	hasReservedKey,
	interpolateMessage,
	logicalPremises,
	mapEngineError,
	mergeQualificationContext,
	premiseCheck,
	qualificationDefinition,
	qualificationToRecord,
	quantitativeResultToDerivation,
	QUALIFICATION_KEY,
	reasonResultToProjection,
	rulingDefinition,
	rulingToFinding,
} from '@src/core'
import type { Comparison } from '@orkestrel/reason'
import {
	atom,
	check,
	createEvaluator,
	factorGroup,
	fieldFactor,
	logicalDefinition,
	quantitativeDefinition,
	ReasonError,
	rule,
	staticFactor,
} from '@orkestrel/reason'

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

		it('is order-independent over every subset and permutation of the three eligibilities', () => {
			const eligibilities: Array<'eligible' | 'referral' | 'ineligible'> = [
				'eligible',
				'referral',
				'ineligible',
			]
			const severity: Record<string, number> = { eligible: 0, referral: 1, ineligible: 2 }

			function permutations<T>(list: T[]): T[][] {
				if (list.length <= 1) return [list]
				const output: T[][] = []
				for (let index = 0; index < list.length; index += 1) {
					const head = list[index]
					if (head === undefined) continue
					const rest = [...list.slice(0, index), ...list.slice(index + 1)]
					for (const tail of permutations(rest)) output.push([head, ...tail])
				}
				return output
			}

			for (let mask = 0; mask < 8; mask += 1) {
				const subset = eligibilities.filter((_entry, index) => (mask & (1 << index)) !== 0)
				const expected = subset.reduce<'eligible' | 'referral' | 'ineligible'>(
					(most, entry) => ((severity[entry] ?? 0) > (severity[most] ?? 0) ? entry : most),
					'eligible',
				)
				const permutationList = subset.length === 0 ? [[]] : permutations(subset)
				for (const permutation of permutationList) {
					expect(combineEligibilities(permutation)).toBe(expected)
				}
			}
		})
	})

	describe('interpolateMessage', () => {
		it('groups thousands in numeric tokens', () => {
			expect(interpolateMessage('Limit is {{limit}}', { limit: 5010 })).toBe('Limit is 5,010')
		})

		it('renders unresolved tokens as empty strings', () => {
			expect(interpolateMessage('Missing {{gone}}', {})).toBe('Missing ')
		})

		it('resolves a dotted path token', () => {
			expect(interpolateMessage('{{a.b}}', { a: { b: 'x' } })).toBe('x')
		})

		it('String-coerces boolean and string tokens without grouping', () => {
			expect(interpolateMessage('{{flag}}', { flag: true })).toBe('true')
			expect(interpolateMessage('{{name}}', { name: 'Ann' })).toBe('Ann')
		})

		it('resolves two tokens in a single template', () => {
			expect(interpolateMessage('{{a}} and {{b}}', { a: 1, b: 2 })).toBe('1 and 2')
		})

		it('resolves a token with surrounding whitespace', () => {
			expect(interpolateMessage('{{ limit }}', { limit: 5 })).toBe('5')
		})
	})

	describe('describeComparison', () => {
		const table: ReadonlyArray<readonly [Comparison, string]> = [
			['equals', 'is'],
			['not', 'is not'],
			['above', 'is more than'],
			['below', 'is less than'],
			['from', 'is at least'],
			['to', 'is at most'],
			['any', 'is any of'],
			['none', 'is none of'],
			['between', 'is between'],
			['outside', 'is outside'],
		]

		it.each(table)('renders %s as %s', (comparison, phrase) => {
			expect(describeComparison(comparison)).toBe(phrase)
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

		it('renders empty-ish bounds as an empty string', () => {
			expect(describeValue({})).toBe('')
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

		it('renders a description-only premise with met undefined as unknown', () => {
			expect(describePremise({ description: 'Some description', met: undefined })).toBe(
				'Some description → unknown',
			)
		})

		it('falls back to "Premise" when field and description are both absent, met false', () => {
			expect(describePremise({ met: false })).toBe('Premise → not met')
		})

		it('renders a label override instead of the field', () => {
			const sentence = describePremise(
				{ field: 'age', comparison: 'above', expected: 18, actual: 25, met: true },
				{ age: 'Applicant age' },
			)
			expect(sentence).toBe('Applicant age is more than 18 → met')
		})

		it('renders a field premise that was not met', () => {
			const sentence = describePremise({
				field: 'age',
				comparison: 'above',
				expected: 18,
				actual: 10,
				met: false,
			})
			expect(sentence).toBe('age is more than 18 → not met')
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

		it('projects only the conclusion when the applied rule id has no entry in definition.rules', () => {
			const projection = reasonResultToProjection(gatesPass, {
				reasoning: 'logical',
				conclusion: true,
				count: 1,
				success: true,
				trace: [],
				errors: [],
				rules: [{ id: 'ghost', applied: true, premises: [true], conclusion: true }],
			})
			expect(projection).toEqual({ conclusion: true })
		})
	})

	describe('mergeQualificationContext / qualificationToRecord', () => {
		it('merges projections and wraps them under the reserved key', () => {
			const merged = mergeQualificationContext({}, 'cap', 500)
			expect(qualificationToRecord(merged)).toEqual({ qualification: { cap: 500 } })
		})

		it('returns a fresh object, leaving the base unmutated, overwriting an existing key', () => {
			const base = { cap: 100 }
			const merged = mergeQualificationContext(base, 'cap', 200)
			expect(merged).not.toBe(base)
			expect(base).toEqual({ cap: 100 })
			expect(merged).toEqual({ cap: 200 })
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

		it('does not report a reserved key for a plain subject', () => {
			expect(hasReservedKey({ id: 'a' })).toBe(false)
		})

		it('does not throw for a valid subject', () => {
			expect(() => assertSubject({ id: 'a' })).not.toThrow()
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

		it('combines two findings in the same scope by severity', () => {
			const findings = [
				finding({
					id: 'wind-a',
					pass: 'wind',
					rule: 'coastal',
					effect: 'condition',
					applied: true,
					scope: 'wind',
				}),
				finding({
					id: 'wind-b',
					pass: 'wind',
					rule: 'flood',
					effect: 'restriction',
					applied: true,
					scope: 'wind',
				}),
			]
			expect(deriveScopeEligibilities(findings)).toEqual({ wind: 'ineligible' })
		})

		it('ignores a non-applied finding and an unscoped finding', () => {
			const findings = [
				finding({
					id: 'not-applied',
					pass: 'wind',
					rule: 'coastal',
					effect: 'restriction',
					applied: false,
					scope: 'wind',
				}),
				finding({
					id: 'unscoped',
					pass: 'gates',
					rule: 'licensed',
					effect: 'restriction',
					applied: true,
				}),
			]
			expect(deriveScopeEligibilities(findings)).toEqual({})
		})
	})

	describe('logicalPremises / premiseCheck / rulingToFinding', () => {
		it('returns 0 premises for an empty membership value', () => {
			const gates = logicalDefinition('gates', 'Gates', [
				rule('membership', [atom('tag', 'any', [])], atom('flagged', 'equals', true)),
			])
			const evaluator = createEvaluator()
			const membership = findRule(gates, 'membership')
			expect(membership).toBeDefined()
			const rulePremises =
				membership === undefined ? [] : logicalPremises(membership, { tag: 'coastal' }, evaluator)
			expect(rulePremises).toHaveLength(0)
		})

		it('returns 1 premise for a non-empty membership check, met via a real evaluator', () => {
			const gates = logicalDefinition('gates', 'Gates', [
				rule('membership', [atom('tag', 'any', ['coastal'])], atom('flagged', 'equals', true)),
			])
			const evaluator = createEvaluator()
			const membership = findRule(gates, 'membership')
			expect(membership).toBeDefined()
			const rulePremises =
				membership === undefined ? [] : logicalPremises(membership, { tag: 'coastal' }, evaluator)
			expect(rulePremises).toHaveLength(1)
			expect(rulePremises[0]?.met).toBe(true)
		})

		it('premiseCheck includes label only when labels[field] is set', () => {
			const evaluator = createEvaluator()
			const authored = check('age', 'above', 18)
			const withoutLabel = premiseCheck(authored, evaluator.evaluate(authored, { age: 25 }))
			expect('label' in withoutLabel).toBe(false)
			const withLabel = premiseCheck(authored, evaluator.evaluate(authored, { age: 25 }), {
				age: 'Applicant age',
			})
			expect(withLabel.label).toBe('Applicant age')
		})

		it('premiseCheck omits met when result.met is undefined', () => {
			const authored = check('age', 'above', 18)
			const premise = premiseCheck(authored, { field: 'age', actual: 25, met: undefined })
			expect('met' in premise).toBe(false)
		})

		it('rulingToFinding returns premises [] and applied false when the rule is absent', () => {
			const ruling = rulingDefinition('missing', 'gates', 'absent', 'restriction')
			const found = rulingToFinding(
				ruling,
				gatesPass,
				{
					reasoning: 'logical',
					conclusion: true,
					count: 1,
					success: true,
					trace: [],
					errors: [],
					rules: [],
				},
				{ licensed: false },
				createEvaluator(),
			)
			expect(found.premises).toEqual([])
			expect(found.applied).toBe(false)
		})

		it('rulingToFinding omits scope and message when the ruling lacks them', () => {
			const ruling = rulingDefinition('license', 'gates', 'licensed', 'restriction')
			const found = rulingToFinding(
				ruling,
				gatesPass,
				{
					reasoning: 'logical',
					conclusion: true,
					count: 1,
					success: true,
					trace: [],
					errors: [],
					rules: [{ id: 'licensed', applied: true, premises: [true], conclusion: true }],
				},
				{ licensed: false },
				createEvaluator(),
			)
			expect('scope' in found).toBe(false)
			expect('message' in found).toBe(false)
		})
	})

	describe('hasReservedKey/assertSubject', () => {
		it('hasReservedKey returns false for a plain subject', () => {
			expect(hasReservedKey({ id: 'a' })).toBe(false)
		})

		it('assertSubject does not throw for a valid subject', () => {
			expect(() => assertSubject({ id: 'a' })).not.toThrow()
		})
	})

	describe('mapEngineError', () => {
		it('maps ReasonError INVALID to DEFINITION, cause is the original error', () => {
			const original = new ReasonError('INVALID', 'v')
			const mapped = mapEngineError(original, 'p')
			expect(mapped.code).toBe('DEFINITION')
			expect(mapped.context?.cause).toBe(original)
		})

		it('maps ReasonError DESTROYED to DESTROYED', () => {
			const mapped = mapEngineError(new ReasonError('DESTROYED', 'd'), 'p')
			expect(mapped.code).toBe('DESTROYED')
		})

		it('maps ReasonError MISSING to ENGINE', () => {
			const mapped = mapEngineError(new ReasonError('MISSING', 'm'), 'p')
			expect(mapped.code).toBe('ENGINE')
		})

		it('maps a plain Error to ENGINE, message contains the original', () => {
			const mapped = mapEngineError(new Error('boom'), 'p')
			expect(mapped.code).toBe('ENGINE')
			expect(mapped.message).toContain('boom')
		})

		it('maps a non-Error throw to ENGINE, message contains the stringified value', () => {
			const mapped = mapEngineError('oops', 'p')
			expect(mapped.code).toBe('ENGINE')
			expect(mapped.message).toContain('oops')
		})
	})

	describe('findEmptyLogicalPasses', () => {
		it('warns for a logical pass carrying no ruling', () => {
			const definition = qualificationDefinition('standard', 'Standard', [gatesPass])
			expect(findEmptyLogicalPasses(definition)).toEqual(["Logical pass 'gates' has no rulings"])
		})

		it('returns [] when every logical pass has a ruling', () => {
			const definition = qualificationDefinition('standard', 'Standard', [gatesPass], {
				rulings: [rulingDefinition('license', 'gates', 'licensed', 'restriction')],
			})
			expect(findEmptyLogicalPasses(definition)).toEqual([])
		})
	})

	describe('findUnreadDerivations', () => {
		it('returns [] when a quantitative pass is read by a later logical pass', () => {
			const cap = quantitativeDefinition('cap', 'Cap', [
				factorGroup('limit', 'sum', [staticFactor('base', 100)]),
			])
			const gates = logicalDefinition('gates', 'Gates', [
				rule(
					'over',
					[atom(['qualification', 'cap'], 'above', 50)],
					atom('blocked', 'equals', true),
				),
			])
			const definition = qualificationDefinition('standard', 'Standard', [cap, gates])
			expect(findUnreadDerivations(definition)).toEqual([])
		})

		it('does not warn for a quantitative pass read by a later quantitative pass factor field', () => {
			const cap = quantitativeDefinition('cap', 'Cap', [
				factorGroup('limit', 'sum', [staticFactor('base', 100)]),
			])
			const excess = quantitativeDefinition('excess', 'Excess', [
				factorGroup('excess', 'sum', [fieldFactor('cap', ['qualification', 'cap'])]),
			])
			const definition = qualificationDefinition('standard', 'Standard', [cap, excess])
			expect(findUnreadDerivations(definition)).not.toContain(
				"Quantitative pass 'cap' is never read by a later pass",
			)
		})

		it('warns for a trailing quantitative pass read by nobody', () => {
			const cap = quantitativeDefinition('cap', 'Cap', [
				factorGroup('limit', 'sum', [staticFactor('base', 100)]),
			])
			const definition = qualificationDefinition('standard', 'Standard', [cap])
			expect(findUnreadDerivations(definition)).toEqual([
				"Quantitative pass 'cap' is never read by a later pass",
			])
		})
	})
})
