import type { Comparison } from '@orkestrel/reason'
import { numberShape, objectShape, stringShape } from '@orkestrel/contract'
import { describe, expect, it } from 'vitest'
import {
	assertSubject,
	checkToPremise,
	combineEligibilities,
	createQualificationDefinition,
	createRuling,
	deriveFindingEligibility,
	deriveScopeEligibilities,
	describeEmptyLogicalPasses,
	describeMissingReferences,
	describeUnknownTokens,
	describeUnreadDerivations,
	expandPassFaults,
	findRule,
	hasReservedKey,
	interpolateMessage,
	mapEngineError,
	mergeQualificationContext,
	QUALIFICATION_KEY,
	qualificationToRecord,
	quantitativeResultToDerivation,
	reasonResultToProjection,
	renderComparison,
	renderPremise,
	renderValue,
	ruleToPremises,
	rulingToFinding,
} from '@src/core'
import {
	createAtom,
	createCompound,
	createCheck,
	createEvaluator,
	createFactorGroup,
	createFieldFactor,
	createLogicalDefinition,
	createQuantitativeDefinition,
	createRule,
	createStaticFactor,
	ReasonError,
} from '@orkestrel/reason'
import { buildFinding, buildPermutations } from '../../setup.js'

const gatesPass = createLogicalDefinition('gates', 'Gates', [
	createRule(
		'licensed',
		[createAtom('licensed', 'equals', false)],
		createAtom('blocked', 'equals', true),
	),
])
const capPass = createQuantitativeDefinition('cap', 'Cap', [])

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

			for (const mask of Array.from({ length: 8 }, (_, index) => index)) {
				const subset = eligibilities.filter((_entry, index) => (mask & (1 << index)) !== 0)
				const expected = subset.reduce<'eligible' | 'referral' | 'ineligible'>(
					(most, entry) => ((severity[entry] ?? 0) > (severity[most] ?? 0) ? entry : most),
					'eligible',
				)
				const permutationList = subset.length === 0 ? [[]] : buildPermutations(subset)
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

	describe('renderComparison', () => {
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
			expect(renderComparison(comparison)).toBe(phrase)
		})
	})

	describe('renderValue', () => {
		it('renders arrays', () => {
			expect(renderValue([18, 25, 40])).toBe('18, 25, 40')
		})

		it('renders bounds', () => {
			expect(renderValue({ minimum: 18, maximum: 65 })).toBe('18 and 65')
		})

		it('renders scalars', () => {
			expect(renderValue(42)).toBe('42')
		})

		it('renders empty-ish bounds as an empty string', () => {
			expect(renderValue({})).toBe('')
		})
	})

	describe('renderPremise', () => {
		it('renders a field premise sentence', () => {
			const sentence = renderPremise({
				field: 'age',
				comparison: 'above',
				expected: 18,
				actual: 25,
				state: 'met',
			})
			expect(sentence).toBe('age is more than 18 → met')
		})

		it('renders a description-only premise without met as unknown', () => {
			expect(renderPremise({ description: 'Some description' })).toBe('Some description → unknown')
		})

		it('falls back to "Premise" when field and description are both absent, met false', () => {
			expect(renderPremise({ state: 'unmet' })).toBe('Premise → not met')
		})

		it('renders a label override instead of the field', () => {
			const sentence = renderPremise(
				{ field: 'age', comparison: 'above', expected: 18, actual: 25, state: 'met' },
				{ age: 'Applicant age' },
			)
			expect(sentence).toBe('Applicant age is more than 18 → met')
		})

		it('renders a field premise that was not met', () => {
			const sentence = renderPremise({
				field: 'age',
				comparison: 'above',
				expected: 18,
				actual: 10,
				state: 'unmet',
			})
			expect(sentence).toBe('age is more than 18 → not met')
		})

		it('renders a described premise with met absent as unknown', () => {
			expect(renderPremise({ description: 'Applicant is enrolled' })).toBe(
				'Applicant is enrolled → unknown',
			)
		})

		it('renders a described premise with met false as not met', () => {
			expect(renderPremise({ description: 'Applicant is enrolled', state: 'unmet' })).toBe(
				'Applicant is enrolled → not met',
			)
		})

		it('renders the checked form when field, comparison, and description are all present, description unused', () => {
			const sentence = renderPremise({
				field: 'age',
				comparison: 'above',
				expected: 18,
				actual: 25,
				state: 'met',
				description: 'Applicant is enrolled',
			})
			expect(sentence).toBe('age is more than 18 → met')
		})

		it('renders the described form when field is present without comparison, field name unused', () => {
			const sentence = renderPremise({
				field: 'age',
				description: 'Applicant is enrolled',
				state: 'met',
			})
			expect(sentence).toBe('Applicant is enrolled → met')
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

	describe('describeMissingReferences', () => {
		it('reports missing pass, non-logical pass, missing rule, and reserved pass id', () => {
			const definition = createQualificationDefinition('bad', 'Bad', [capPass, gatesPass], {
				rulings: [
					createRuling('missing-pass', 'absent', 'licensed', 'restriction'),
					createRuling('quant-pass', 'cap', 'base', 'restriction'),
					createRuling('missing-rule', 'gates', 'absent', 'restriction'),
				],
			})
			const reserved = createQualificationDefinition('reserved', 'Reserved', [
				createQuantitativeDefinition(QUALIFICATION_KEY, 'Reserved', []),
			])
			const errors = describeMissingReferences(definition)
			expect(errors).toContain("Ruling 'missing-pass' references missing pass 'absent'")
			expect(errors).toContain("Ruling 'quant-pass' references non-logical pass 'cap'")
			expect(errors).toContain(
				"Ruling 'missing-rule' references missing rule 'absent' in pass 'gates'",
			)
			expect(describeMissingReferences(reserved)).toContain(
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
				faults: [],
				repairs: [],
				defaulted: [],
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
				faults: [],
				repairs: [],
				defaulted: [],
			})
			expect(projection).toBe(500)
		})

		it('projects a logical conclusion and merged atom leaves', () => {
			const projection = reasonResultToProjection(gatesPass, {
				reasoning: 'logical',
				conclusion: 'met',
				count: 1,
				success: true,
				trace: [],
				errors: [],
				faults: [],
				repairs: [],
				defaulted: [],
				rules: [{ id: 'licensed', state: 'met', premises: ['met'], checks: [] }],
			})
			expect(projection).toEqual({ conclusion: true, blocked: true })
		})

		it('returns false for mismatched result shapes', () => {
			expect(
				reasonResultToProjection(capPass, {
					reasoning: 'logical',
					conclusion: 'met',
					count: 0,
					success: true,
					trace: [],
					errors: [],
					faults: [],
					repairs: [],
					defaulted: [],
					rules: [],
				}),
			).toBe(false)
		})

		it('never pollutes Object.prototype through hostile conclusion keys', () => {
			const polluted = createLogicalDefinition('pollute', 'Pollute', [
				createRule(
					'proto',
					[createAtom('licensed', 'equals', false)],
					createAtom(['__proto__', 'polluted'], 'equals', true),
				),
			])
			const before = Object.prototype
			reasonResultToProjection(polluted, {
				reasoning: 'logical',
				conclusion: 'met',
				count: 1,
				success: true,
				trace: [],
				errors: [],
				faults: [],
				repairs: [],
				defaulted: [],
				rules: [{ id: 'proto', state: 'met', premises: ['met'], checks: [] }],
			})
			expect(Object.prototype).toBe(before)
			expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
		})

		it('projects only the conclusion when the applied rule id has no entry in definition.rules', () => {
			const projection = reasonResultToProjection(gatesPass, {
				reasoning: 'logical',
				conclusion: 'met',
				count: 1,
				success: true,
				trace: [],
				errors: [],
				faults: [],
				repairs: [],
				defaulted: [],
				rules: [{ id: 'ghost', state: 'met', premises: ['met'], checks: [] }],
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
				buildFinding({
					id: 'a',
					pass: 'gates',
					rule: 'licensed',
					effect: 'referral',
					state: 'met',
				}),
				buildFinding({
					id: 'b',
					pass: 'gates',
					rule: 'blocked',
					effect: 'restriction',
					state: 'met',
				}),
			]
			expect(deriveFindingEligibility(findings)).toBe('ineligible')
		})

		it('ignores scoped findings for global eligibility', () => {
			const findings = [
				buildFinding({
					id: 'wind',
					pass: 'wind',
					rule: 'coastal',
					effect: 'restriction',
					state: 'met',
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
				buildFinding({
					id: 'wind',
					pass: 'wind',
					rule: 'coastal',
					effect: 'restriction',
					state: 'met',
					scope: 'wind',
				}),
				buildFinding({
					id: 'ex',
					pass: 'gates',
					rule: 'vacant',
					effect: 'condition',
					state: 'met',
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
				buildFinding({
					id: 'wind-a',
					pass: 'wind',
					rule: 'coastal',
					effect: 'condition',
					state: 'met',
					scope: 'wind',
				}),
				buildFinding({
					id: 'wind-b',
					pass: 'wind',
					rule: 'flood',
					effect: 'restriction',
					state: 'met',
					scope: 'wind',
				}),
			]
			expect(deriveScopeEligibilities(findings)).toEqual({ wind: 'ineligible' })
		})

		it('ignores a non-applied finding and an unscoped finding', () => {
			const findings = [
				buildFinding({
					id: 'not-applied',
					pass: 'wind',
					rule: 'coastal',
					effect: 'restriction',
					state: 'unmet',
					scope: 'wind',
				}),
				buildFinding({
					id: 'unscoped',
					pass: 'gates',
					rule: 'licensed',
					effect: 'restriction',
					state: 'met',
				}),
			]
			expect(deriveScopeEligibilities(findings)).toEqual({})
		})
	})

	describe('ruleToPremises / checkToPremise / rulingToFinding', () => {
		it('reads each premise from what the rule read, in extraction order', () => {
			const rule = createRule(
				'membership',
				[
					createCompound('and', [
						createAtom('tag', 'any', ['coastal']),
						createAtom('age', 'above', 1),
					]),
				],
				createAtom('flagged', 'equals', true),
			)
			const premises = ruleToPremises(rule, {
				id: 'membership',
				state: 'unread',
				premises: ['unread'],
				checks: [
					{ field: 'tag', state: 'met', actual: 'coastal' },
					{ field: 'age', state: 'unread', actual: undefined },
				],
			})
			expect(premises.map((premise) => premise.state)).toEqual(['met', 'unread'])
			expect(premises[0]?.actual).toBe('coastal')
		})

		it('a rule that never ran has premises with no state, which render as unknown', () => {
			const rule = createRule(
				'membership',
				[createAtom('tag', 'any', ['coastal'])],
				createAtom('flagged', 'equals', true),
			)
			const premises = ruleToPremises(rule, undefined)
			expect(premises).toHaveLength(1)
			expect(premises[0]?.state).toBeUndefined()
			expect(premises[0]?.actual).toBeUndefined()
			expect(premises[0]?.field).toBe('tag')
		})

		it('checkToPremise includes label only when labels[field] is set', () => {
			const evaluator = createEvaluator()
			const authored = createCheck('age', 'above', 18)
			const withoutLabel = checkToPremise(authored, evaluator.evaluate(authored, { age: 25 }))
			expect('label' in withoutLabel).toBe(false)
			const withLabel = checkToPremise(authored, evaluator.evaluate(authored, { age: 25 }), {
				age: 'Applicant age',
			})
			expect(withLabel.label).toBe('Applicant age')
		})

		it('checkToPremise carries met and actual through for an unmet check', () => {
			const evaluator = createEvaluator()
			const authored = createCheck('age', 'above', 18)
			const premise = checkToPremise(authored, evaluator.evaluate(authored, { age: 12 }))
			expect(premise.state).toBe('unmet')
			expect(premise.actual).toBe(12)
		})

		it('rulingToFinding returns premises [] and reads unread when the rule is absent', () => {
			const ruling = createRuling('missing', 'gates', 'absent', 'restriction')
			const found = rulingToFinding(
				ruling,
				gatesPass,
				{
					reasoning: 'logical',
					conclusion: 'met',
					count: 1,
					success: true,
					trace: [],
					errors: [],
					faults: [],
					repairs: [],
					defaulted: [],
					rules: [],
				},
				{ licensed: false },
			)
			expect(found.premises).toEqual([])
			expect(found.state).toBe('unread')
		})

		it('rulingToFinding omits scope and message when the ruling lacks them', () => {
			const ruling = createRuling('license', 'gates', 'licensed', 'restriction')
			const found = rulingToFinding(
				ruling,
				gatesPass,
				{
					reasoning: 'logical',
					conclusion: 'met',
					count: 1,
					success: true,
					trace: [],
					errors: [],
					faults: [],
					repairs: [],
					defaulted: [],
					rules: [{ id: 'licensed', state: 'met', premises: ['met'], checks: [] }],
				},
				{ licensed: false },
			)
			expect('scope' in found).toBe(false)
			expect('message' in found).toBe(false)
		})
	})

	describe('mapEngineError', () => {
		it('maps ReasonError INVALID to DEFINITION, cause is the original error', () => {
			const original = new ReasonError('INVALID', 'v')
			const mapped = mapEngineError(original, 'p')
			expect(mapped.code).toBe('DEFINITION')
			expect(mapped.context?.cause).toBe(original)
			expect(mapped.context?.pass).toBe('p')
		})

		it('maps ReasonError DESTROYED to DESTROYED', () => {
			const original = new ReasonError('DESTROYED', 'd')
			const mapped = mapEngineError(original, 'p')
			expect(mapped.code).toBe('DESTROYED')
			expect(mapped.context).toEqual({ pass: 'p', cause: original })
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
			expect(mapped.context).toEqual({ pass: 'p', cause: 'oops' })
		})
	})

	describe('describeEmptyLogicalPasses', () => {
		it('warns for a logical pass carrying no ruling', () => {
			const definition = createQualificationDefinition('standard', 'Standard', [gatesPass])
			expect(describeEmptyLogicalPasses(definition)).toEqual([
				"Logical pass 'gates' has no rulings",
			])
		})

		it('returns [] when every logical pass has a ruling', () => {
			const definition = createQualificationDefinition('standard', 'Standard', [gatesPass], {
				rulings: [createRuling('license', 'gates', 'licensed', 'restriction')],
			})
			expect(describeEmptyLogicalPasses(definition)).toEqual([])
		})
	})

	describe('describeUnreadDerivations', () => {
		it('returns [] when a quantitative pass is read by a later logical pass', () => {
			const cap = createQuantitativeDefinition('cap', 'Cap', [
				createFactorGroup('limit', 'sum', [createStaticFactor('base', 100)]),
			])
			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule(
					'over',
					[createAtom(['qualification', 'cap'], 'above', 50)],
					createAtom('blocked', 'equals', true),
				),
			])
			const definition = createQualificationDefinition('standard', 'Standard', [cap, gates])
			expect(describeUnreadDerivations(definition)).toEqual([])
		})

		it('does not warn for a quantitative pass read by a later quantitative pass factor field', () => {
			const cap = createQuantitativeDefinition('cap', 'Cap', [
				createFactorGroup('limit', 'sum', [createStaticFactor('base', 100)]),
			])
			const excess = createQuantitativeDefinition('excess', 'Excess', [
				createFactorGroup('excess', 'sum', [createFieldFactor('cap', ['qualification', 'cap'])]),
			])
			const definition = createQualificationDefinition('standard', 'Standard', [cap, excess])
			expect(describeUnreadDerivations(definition)).not.toContain(
				"Quantitative pass 'cap' is never read by a later pass",
			)
		})

		it('warns for a trailing quantitative pass read by nobody', () => {
			const cap = createQuantitativeDefinition('cap', 'Cap', [
				createFactorGroup('limit', 'sum', [createStaticFactor('base', 100)]),
			])
			const definition = createQualificationDefinition('standard', 'Standard', [cap])
			expect(describeUnreadDerivations(definition)).toEqual([
				"Quantitative pass 'cap' is never read by a later pass",
			])
		})
	})
})

describe('expandPassFaults', () => {
	const leaf = { reason: 'missing', path: 'age', expected: 'number' } as const
	const read = {
		reason: 'missing',
		path: ['qualification', 'gates', 'ok'],
		expected: 'boolean',
	} as const

	it('replaces a read of an unread pass with what that pass could not read', () => {
		expect(expandPassFaults([read], new Map([['gates', [leaf]]]))).toEqual([leaf])
	})

	it('names one field once, however many passes reached it', () => {
		expect(expandPassFaults([leaf, read], new Map([['gates', [leaf]]]))).toEqual([leaf])
	})

	it('keeps a read of a pass that settled, and any other fault', () => {
		expect(expandPassFaults([read, leaf], new Map())).toEqual([read, leaf])
	})
})

describe('describeUnknownTokens', () => {
	const shape = objectShape({ age: numberShape(), address: objectShape({ city: stringShape() }) })

	it('names a token no field answers, and no more', () => {
		const definition = createQualificationDefinition('d', 'd', [], {
			shape,
			rulings: [
				createRuling('a', 'p', 'r', 'referral', { message: 'Age {{age}} in {{address.city}}' }),
				createRuling('b', 'p', 'r', 'referral', { message: 'Pass {{qualification.p.x}}' }),
				createRuling('c', 'p', 'r', 'referral', { message: 'Bad {{agee}}' }),
			],
		})
		expect(describeUnknownTokens(definition)).toEqual([
			'Ruling \'c\' message reads "agee", and the shape does not declare it',
		])
	})

	it('says nothing with no shape', () => {
		const definition = createQualificationDefinition('d', 'd', [], {
			rulings: [createRuling('c', 'p', 'r', 'referral', { message: 'Bad {{agee}}' })],
		})
		expect(describeUnknownTokens(definition)).toEqual([])
	})
})
