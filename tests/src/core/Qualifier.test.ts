import { describe, expect, it } from 'vitest'
import {
	createQualifier,
	isQualifierError,
	QualifierError,
	qualificationDefinition,
	QUALIFICATION_KEY,
	rulingDefinition,
} from '@src/core'
import {
	atom,
	createEvaluator,
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
	factorGroup,
	fieldFactor,
	logicalDefinition,
	quantitativeDefinition,
	rule,
	staticFactor,
	transform,
} from '@orkestrel/reason'
import {
	buildCapExcessGatesDefinition,
	buildConditionDefinition,
	buildContinuingLogicalDefinition,
	buildEvidenceSnapshotDefinition,
	buildGatesDefinition,
	buildReferralDefinition,
	buildScopedWindDefinition,
	createFailingEngine,
	createRecorder,
} from '../../setup'

const FORBIDDEN_RESULT_KEYS: readonly string[] = [
	'amount',
	'authority',
	'aggregate',
	'outcome',
	'worksheet',
	'total',
	'notice',
	'status',
	'decision',
]

function expectNoForbiddenKeys(value: unknown, path = 'result'): void {
	if (value === null || typeof value !== 'object') return
	for (const key of FORBIDDEN_RESULT_KEYS) {
		expect(Object.hasOwn(value, key), `${path}.${key}`).toBe(false)
	}
	if (Array.isArray(value)) {
		for (const [index, entry] of value.entries()) {
			expectNoForbiddenKeys(entry, `${path}[${index}]`)
		}
		return
	}
	for (const [key, entry] of Object.entries(value)) {
		expectNoForbiddenKeys(entry, `${path}.${key}`)
	}
}

describe('Qualifier', () => {
	describe('referral finding and message interpolation', () => {
		it('produces an applied referral finding with interpolated premises', () => {
			const qualifier = createQualifier()
			const definition = buildReferralDefinition()
			const result = qualifier.qualify({ id: 'risk-1', coastal: true, seats: 10 }, definition)

			const finding = result.findings.find((entry) => entry.id === 'flag-coastal')
			expect(finding).toEqual(
				expect.objectContaining({
					effect: 'referral',
					applied: true,
					message: 'Coastal surcharge on 10 seats',
				}),
			)
			expect(finding?.premises.length).toBeGreaterThan(0)
			qualifier.destroy()
		})
	})

	describe('quantitative pre-pass projection', () => {
		it('lands under qualification, surfaces in derivations, and feeds later logical passes', () => {
			const qualifier = createQualifier()
			const cap = quantitativeDefinition('cap', 'Cap', [
				factorGroup('limit', 'sum', [staticFactor('base', 750_000)]),
			])
			const gates = logicalDefinition('gates', 'Gates', [
				rule(
					'cap-check',
					[atom(['qualification', 'cap'], 'above', 500_000)],
					atom('blocked', 'equals', true),
				),
			])
			const definition = qualificationDefinition('property', 'Property', [cap, gates], {
				rulings: [
					rulingDefinition('cap', 'gates', 'cap-check', 'restriction', {
						message: 'Cap exceeded',
					}),
				],
			})

			const subject = { id: 'risk-1', total: 1_000_000 }
			const result = qualifier.qualify(subject, definition)

			expect(subject).toEqual({ id: 'risk-1', total: 1_000_000 })
			expect('cap' in subject).toBe(false)
			expect('qualification' in subject).toBe(false)
			expect(result.derivations).toEqual([
				expect.objectContaining({ id: 'cap', value: 750_000, success: true }),
			])
			expect(result.eligibility).toBe('ineligible')
			qualifier.destroy()
		})
	})

	describe('ruling routing and non-applied evidence', () => {
		it('uses the ruling scope and keeps non-applied rulings with re-evaluated premises', () => {
			const qualifier = createQualifier()
			const definition = buildScopedWindDefinition()
			const result = qualifier.qualify({ id: 'risk-1', distance: 5 }, definition)

			const finding = result.findings.find((entry) => entry.id === 'coastal')
			expect(finding).toEqual(
				expect.objectContaining({
					applied: false,
					scope: 'wind',
				}),
			)
			expect(finding?.premises.length).toBeGreaterThan(0)
			expect(result.eligibility).toBe('eligible')
			qualifier.destroy()
		})
	})

	describe('unscoped effect mapping', () => {
		it('maps restriction, referral, and condition to global eligibility', () => {
			const restriction = buildGatesDefinition()
			const referral = buildReferralDefinition()
			const condition = qualificationDefinition(
				'condition',
				'Condition',
				[
					logicalDefinition('gates', 'Gates', [
						rule('note', [atom('note', 'equals', true)], atom('flagged', 'equals', true)),
					]),
				],
				{
					rulings: [
						rulingDefinition('note', 'gates', 'note', 'condition', {
							message: 'Advisory only',
						}),
					],
				},
			)

			const qualifier = createQualifier()
			expect(qualifier.qualify({ id: 'a', licensed: false }, restriction).eligibility).toBe(
				'ineligible',
			)
			expect(qualifier.qualify({ id: 'b', coastal: true, seats: 1 }, referral).eligibility).toBe(
				'referral',
			)
			expect(qualifier.qualify({ id: 'c', note: true }, condition).eligibility).toBe('eligible')
			qualifier.destroy()
		})
	})

	describe('subject safety', () => {
		it('throws MISMATCH for a reserved qualification key and non-record subjects', () => {
			const qualifier = createQualifier()
			const definition = buildGatesDefinition()

			expect(() => qualifier.qualify({ id: 'a', qualification: {} }, definition)).toThrow(
				expect.objectContaining({ code: 'MISMATCH', name: 'QualifierError' }),
			)
			const nonRecord: unknown = 'subject'
			expect(() => Reflect.apply(qualifier.qualify, qualifier, [nonRecord, definition])).toThrow(
				expect.objectContaining({ code: 'MISMATCH', name: 'QualifierError' }),
			)
			expect(() => qualifier.qualify({ id: 'a', [QUALIFICATION_KEY]: {} }, definition)).toThrow(
				expect.objectContaining({ code: 'MISMATCH', name: 'QualifierError' }),
			)

			qualifier.destroy()
		})
	})

	describe('semantic validation', () => {
		const gates = logicalDefinition('gates', 'Gates', [
			rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
		])
		const cap = quantitativeDefinition('cap', 'Cap', [])

		it('reports missing pass, non-logical pass, missing rule, reserved pass id, and duplicate ids', () => {
			const qualifier = createQualifier()
			const definition = qualificationDefinition('bad', 'Bad', [cap, gates, gates], {
				rulings: [
					rulingDefinition('dup', 'gates', 'licensed', 'restriction'),
					rulingDefinition('dup', 'gates', 'licensed', 'referral'),
					rulingDefinition('missing-pass', 'absent', 'licensed', 'restriction'),
					rulingDefinition('quant-pass', 'cap', 'base', 'restriction'),
					rulingDefinition('missing-rule', 'gates', 'absent', 'restriction'),
				],
			})
			const reserved = qualificationDefinition('reserved', 'Reserved', [
				quantitativeDefinition(QUALIFICATION_KEY, 'Reserved', []),
			])

			const badValidation = qualifier.validate(definition)
			expect(badValidation.valid).toBe(false)
			expect(badValidation.errors).toEqual(
				expect.arrayContaining([
					"Duplicate pass id 'gates'",
					"Duplicate ruling id 'dup'",
					"Ruling 'missing-pass' references missing pass 'absent'",
					"Ruling 'quant-pass' references non-logical pass 'cap'",
					"Ruling 'missing-rule' references missing rule 'absent' in pass 'gates'",
				]),
			)

			const reservedValidation = qualifier.validate(reserved)
			expect(reservedValidation.errors).toContain(
				`Pass id must not equal reserved key '${QUALIFICATION_KEY}'`,
			)

			qualifier.destroy()
		})

		it('throws DEFINITION before the engine runs when validation is enabled', () => {
			const qualifier = createQualifier()
			const definition = qualificationDefinition('bad', 'Bad', [cap], {
				rulings: [rulingDefinition('missing-pass', 'absent', 'licensed', 'restriction')],
			})

			expect(() => qualifier.qualify({ id: 'a' }, definition)).toThrow(
				expect.objectContaining({
					code: 'DEFINITION',
					context: 'bad',
					name: 'QualifierError',
				}),
			)

			qualifier.destroy()
		})
	})

	describe('determinism and non-mutation', () => {
		it('returns deep-equal fresh results without mutating the caller subject', () => {
			const qualifier = createQualifier()
			const definition = buildCapExcessGatesDefinition()
			const subject = { id: 'risk-1', total: 1_250_000 }

			const first = qualifier.qualify(subject, definition)
			const second = qualifier.qualify(subject, definition)

			expect(first).toEqual(second)
			expect(first).not.toBe(second)
			expect(first.findings).not.toBe(second.findings)
			expect(first.derivations).not.toBe(second.derivations)
			expect(subject).toEqual({ id: 'risk-1', total: 1_250_000 })
			qualifier.destroy()
		})
	})

	describe('engine ownership and destroy lifecycle', () => {
		it('preserves injected engines, destroys owned engines once, and rejects use after destroy', () => {
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			const injected = createQualifier({ engine })
			injected.destroy()
			expect(() =>
				engine.reason({ id: 'a', total: 1 }, quantitativeDefinition('cap', 'Cap', [])),
			).not.toThrow()
			engine.destroy()

			const owned = createQualifier()
			owned.destroy()
			owned.destroy()
			expect(() => owned.qualify({ id: 'a' }, buildGatesDefinition())).toThrow(
				expect.objectContaining({ code: 'DESTROYED', name: 'QualifierError' }),
			)
			expect(() => owned.validate(buildGatesDefinition())).toThrow(
				expect.objectContaining({ code: 'DESTROYED', name: 'QualifierError' }),
			)
		})
	})

	describe('empty definition', () => {
		it('qualifies as eligible with no findings or derivations', () => {
			const qualifier = createQualifier()
			const definition = qualificationDefinition('empty', 'Empty', [])
			const result = qualifier.qualify({ id: 'risk-1' }, definition)

			expect(result).toEqual(
				expect.objectContaining({
					eligibility: 'eligible',
					success: true,
					findings: [],
					derivations: [],
				}),
			)
			qualifier.destroy()
		})
	})

	describe('terminal-global proofs', () => {
		it('stops after an unscoped restriction, continues after referral, and lets later restrictions outrank referral', () => {
			const referralFirst = logicalDefinition('referral-gates', 'Referral gates', [
				rule('roof', [atom('roof', 'equals', true)], atom('flagged', 'equals', true)),
			])
			const restrictionSecond = logicalDefinition('restriction-gates', 'Restriction gates', [
				rule('frame', [atom('frame', 'equals', true)], atom('blocked', 'equals', true)),
			])
			const trailing = quantitativeDefinition('trailing', 'Trailing', [
				factorGroup('value', 'sum', [staticFactor('one', 1)]),
			])

			const referralDefinition = qualificationDefinition(
				'mixed',
				'Mixed',
				[referralFirst, restrictionSecond, trailing],
				{
					rulings: [
						rulingDefinition('roof', 'referral-gates', 'roof', 'referral'),
						rulingDefinition('frame', 'restriction-gates', 'frame', 'restriction'),
					],
				},
			)

			const restrictionFirst = qualificationDefinition(
				'terminal',
				'Terminal',
				[
					logicalDefinition('stop', 'Stop', [
						rule('stop', [atom('stop', 'equals', true)], atom('blocked', 'equals', true)),
					]),
					trailing,
				],
				{
					rulings: [rulingDefinition('stop', 'stop', 'stop', 'restriction')],
				},
			)

			const qualifier = createQualifier()
			const referralThenRestriction = qualifier.qualify(
				{ id: 'a', roof: true, frame: true },
				referralDefinition,
			)
			expect(referralThenRestriction.eligibility).toBe('ineligible')
			expect(referralThenRestriction.findings.map((entry) => entry.id)).toEqual(
				expect.arrayContaining(['roof', 'frame']),
			)
			expect(referralThenRestriction.derivations).toHaveLength(0)

			const restrictionStops = qualifier.qualify({ id: 'b', stop: true }, restrictionFirst)
			expect(restrictionStops.eligibility).toBe('ineligible')
			expect(restrictionStops.derivations).toHaveLength(0)

			const referralContinues = qualifier.qualify(
				{ id: 'c', roof: true },
				qualificationDefinition('continue', 'Continue', [referralFirst, trailing], {
					rulings: [rulingDefinition('roof', 'referral-gates', 'roof', 'referral')],
				}),
			)
			expect(referralContinues.eligibility).toBe('referral')
			expect(referralContinues.derivations).toHaveLength(1)

			qualifier.destroy()
		})
	})

	describe('scoped-only proofs', () => {
		it('keeps global eligibility eligible and scopes independent', () => {
			const wind = logicalDefinition('wind', 'Wind', [
				rule('coastal', [atom('distance', 'to', 2)], atom('blocked', 'equals', true)),
			])
			const frame = logicalDefinition('frame', 'Frame', [
				rule('frame', [atom('construction', 'equals', 'Frame')], atom('blocked', 'equals', true)),
			])
			const definition = qualificationDefinition('property', 'Property', [wind, frame], {
				rulings: [
					rulingDefinition('coastal', 'wind', 'coastal', 'restriction', { scope: 'wind' }),
					rulingDefinition('frame', 'frame', 'frame', 'referral', { scope: 'frame' }),
				],
			})

			const qualifier = createQualifier()
			const result = qualifier.qualify(
				{ id: 'risk-1', distance: 1.5, construction: 'Frame' },
				definition,
			)

			expect(result.eligibility).toBe('eligible')
			expect(result.scopes).toEqual({
				wind: 'ineligible',
				frame: 'referral',
			})
			expect(result.scopes.exWind).toBeUndefined()

			const conditionResult = qualifier.qualify(
				{ id: 'risk-2', vacant: true },
				buildConditionDefinition(),
			)
			expect(conditionResult.eligibility).toBe('eligible')
			expect(conditionResult.scopes.exWind).toBe('eligible')

			qualifier.destroy()
		})
	})

	describe('projection proof', () => {
		it('never projects derived values onto the caller subject root or other pass keys', () => {
			const cap = quantitativeDefinition('cap', 'Cap', [
				factorGroup('limit', 'sum', [staticFactor('base', 500_000)]),
			])
			const excess = quantitativeDefinition('excess', 'Excess', [
				factorGroup('excess', 'sum', [
					fieldFactor('total', 'total'),
					fieldFactor('cap', ['qualification', 'cap'], {
						transforms: [transform('multiply', -1)],
					}),
				]),
			])
			const definition = qualificationDefinition('property', 'Property', [cap, excess])
			const subject = { id: 'risk-1', total: 750_000 }

			const qualifier = createQualifier()
			const result = qualifier.qualify(subject, definition)

			expect(subject).toEqual({ id: 'risk-1', total: 750_000 })
			expect('cap' in subject).toBe(false)
			expect('excess' in subject).toBe(false)
			expect('qualification' in subject).toBe(false)
			expect(result.derivations.map((entry) => entry.id)).toEqual(['cap', 'excess'])

			const dotted = qualitativeDefinitionWithDottedField()
			const dottedResult = qualifier.qualify(
				{ id: 'risk-2', total: 10, 'qualification.cap': 99 },
				dotted,
			)
			expect(dottedResult.derivations[0]?.value).not.toBe(99)
			qualifier.destroy()
		})
	})

	describe('no amounts or worksheets', () => {
		it('exposes only the qualification result contract', () => {
			const qualifier = createQualifier()
			const result = qualifier.qualify(
				{ id: 'risk-1', total: 1_250_000 },
				buildCapExcessGatesDefinition(),
			)

			expect(Object.keys(result).sort()).toEqual([
				'derivations',
				'eligibility',
				'errors',
				'findings',
				'id',
				'name',
				'scopes',
				'success',
				'trace',
			])
			expectNoForbiddenKeys(result)
			qualifier.destroy()
		})
	})

	describe('evidence-snapshot integrity', () => {
		it('re-evaluates premises against the pre-projection snapshot', () => {
			const qualifier = createQualifier()
			const definition = buildEvidenceSnapshotDefinition()
			const result = qualifier.qualify({ id: 'risk-1' }, definition)

			const earlierFinding = result.findings.find((entry) => entry.id === 'r1-finding')
			const samePassFinding = result.findings.find((entry) => entry.id === 'r2-finding')
			const earlierPremise = earlierFinding?.premises.find((premise) =>
				matchesFieldPath(premise.field, ['qualification', 'p1']),
			)
			const samePassPremise = samePassFinding?.premises.find((premise) =>
				matchesFieldPath(premise.field, ['qualification', 'p2', 'ready']),
			)

			expect(earlierFinding?.applied).toBe(true)
			expect(earlierPremise).toEqual(expect.objectContaining({ met: true, actual: 42 }))
			expect(samePassFinding?.applied).toBe(false)
			expect(samePassPremise).toEqual(expect.objectContaining({ met: false, actual: undefined }))
			qualifier.destroy()
		})
	})

	describe('events', () => {
		it('fires derive and finding before qualify and destroy last', () => {
			const order = createRecorder<readonly [string]>()
			const throwing = createRecorder<readonly [string]>()
			const sibling = createRecorder<readonly [string]>()

			const qualifier = createQualifier({
				on: {
					derive: () => order.handler('derive'),
					finding: () => order.handler('finding'),
					qualify: () => order.handler('qualify'),
					destroy: () => order.handler('destroy'),
				},
				error: () => {},
			})

			qualifier.emitter.on('finding', () => {
				throwing.handler('finding')
				throw new Error('finding listener failed')
			})
			qualifier.emitter.on('finding', () => sibling.handler('finding'))
			qualifier.emitter.on('qualify', () => sibling.handler('qualify'))

			const result = qualifier.qualify({ id: 'risk-1', licensed: false }, buildGatesDefinition())
			qualifier.destroy()

			expect(result.eligibility).toBe('ineligible')
			expect(order.calls.map(([event]) => event)).toEqual(['finding', 'qualify', 'destroy'])
			expect(throwing.count).toBe(1)
			expect(sibling.calls.map(([event]) => event)).toEqual(['finding', 'qualify'])
		})

		it('emits derive for quantitative passes before qualify', () => {
			const order = createRecorder<readonly [string]>()
			const qualifier = createQualifier({
				on: {
					derive: () => order.handler('derive'),
					finding: () => order.handler('finding'),
					qualify: () => order.handler('qualify'),
				},
			})

			qualifier.qualify({ id: 'risk-1', total: 1_250_000 }, buildCapExcessGatesDefinition())
			qualifier.destroy()

			expect(order.calls.map(([event]) => event)).toEqual([
				'derive',
				'derive',
				'finding',
				'qualify',
			])
		})
	})

	describe('reentry', () => {
		it('throws DESTROYED when a derive listener destroys the qualifier mid-run', () => {
			const qualifier: ReturnType<typeof createQualifier> = createQualifier({
				on: {
					derive: () => qualifier?.destroy(),
				},
			})
			const definition = buildCapExcessGatesDefinition()

			expect(() => qualifier?.qualify({ id: 'risk-1', total: 1 }, definition)).toThrow(
				expect.objectContaining({ code: 'DESTROYED', name: 'QualifierError' }),
			)
		})

		it('throws DESTROYED when a finding listener destroys the qualifier mid-run', () => {
			const qualifier: ReturnType<typeof createQualifier> = createQualifier({
				on: {
					finding: () => qualifier?.destroy(),
				},
			})
			const definition = buildContinuingLogicalDefinition()

			expect(() => qualifier?.qualify({ id: 'risk-1', flag: true }, definition)).toThrow(
				expect.objectContaining({ code: 'DESTROYED', name: 'QualifierError' }),
			)
		})
	})

	describe('errors', () => {
		it('maps a missing-reasoner engine throw to ENGINE', () => {
			const engine = createReason({
				reasoners: [createQuantitativeReasoner({ evaluator: createEvaluator() })],
				bail: false,
			})
			const qualifier = createQualifier({ engine })
			const gates = logicalDefinition('gates', 'Gates', [
				rule('flag', [atom('flag', 'equals', true)], atom('noted', 'equals', true)),
			])
			const definition = qualificationDefinition('bad', 'Bad', [gates])

			expect(() => qualifier.qualify({ id: 'x', flag: true }, definition)).toThrow(
				expect.objectContaining({ code: 'ENGINE', name: 'QualifierError' }),
			)

			engine.destroy()
		})

		it('maps an already-destroyed injected engine to DESTROYED', () => {
			const engine = createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
			engine.destroy()
			const qualifier = createQualifier({ engine })

			expect(() => qualifier.qualify({ id: 'x' }, buildGatesDefinition())).toThrow(
				expect.objectContaining({ code: 'DESTROYED', name: 'QualifierError' }),
			)
		})
	})

	describe('fail-closed on operational failure', () => {
		it('stops after the first pass, prefixes trace/errors with the pass id, and reports referral', () => {
			const cap = quantitativeDefinition('cap', 'Cap', [
				factorGroup('limit', 'sum', [staticFactor('base', 1)]),
			])
			const excess = quantitativeDefinition('excess', 'Excess', [
				factorGroup('excess', 'sum', [staticFactor('base', 1)]),
			])
			const definition = qualificationDefinition('property', 'Property', [cap, excess])
			const qualifier = createQualifier({ engine: createFailingEngine() })

			const result = qualifier.qualify({ id: 'risk-1' }, definition)

			expect(result.success).toBe(false)
			expect(result.eligibility).toBe('referral')
			expect(result.trace).toEqual(['cap: engine trace'])
			expect(result.errors).toEqual(['cap: engine boom'])
			expect(result.derivations).toHaveLength(1)
			expect(result.derivations[0]?.id).toBe('cap')

			qualifier.destroy()
		})
	})

	describe('validate — id/name/warnings channel', () => {
		it('reports an empty id', () => {
			const qualifier = createQualifier()
			const definition = qualificationDefinition('', 'Standard', [])

			expect(qualifier.validate(definition).valid).toBe(false)
			expect(qualifier.validate(definition).errors).toContain('Definition id must not be empty')

			qualifier.destroy()
		})

		it('reports an empty name', () => {
			const qualifier = createQualifier()
			const definition = qualificationDefinition('standard', '', [])

			expect(qualifier.validate(definition).errors).toContain('Definition name must not be empty')

			qualifier.destroy()
		})

		it('reports valid with no errors or warnings for a well-formed definition', () => {
			const qualifier = createQualifier()
			const validation = qualifier.validate(buildGatesDefinition())

			expect(validation).toEqual({ valid: true, errors: [], warnings: [] })

			qualifier.destroy()
		})
	})

	describe('validate — empty passes fail-open', () => {
		it('is valid with a no-passes warning, and qualifies as eligible', () => {
			const qualifier = createQualifier()
			const definition = qualificationDefinition('empty', 'Empty', [])

			expect(qualifier.validate(definition)).toEqual({
				valid: true,
				errors: [],
				warnings: ['Definition has no passes'],
			})

			const result = qualifier.qualify({ id: 'risk-1' }, definition)
			expect(result.eligibility).toBe('eligible')
			expect(result.findings).toEqual([])
			expect(result.derivations).toEqual([])

			qualifier.destroy()
		})
	})

	describe('validate — new warnings', () => {
		it('warns on a logical pass with no rulings', () => {
			const qualifier = createQualifier()
			const gates = logicalDefinition('gates', 'Gates', [
				rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
			])
			const definition = qualificationDefinition('standard', 'Standard', [gates])

			const validation = qualifier.validate(definition)
			expect(validation.valid).toBe(true)
			expect(validation.warnings).toContain("Logical pass 'gates' has no rulings")

			qualifier.destroy()
		})

		it('warns on a quantitative pass never read by a later pass', () => {
			const qualifier = createQualifier()
			const cap = quantitativeDefinition('cap', 'Cap', [
				factorGroup('limit', 'sum', [staticFactor('base', 1)]),
			])
			const definition = qualificationDefinition('standard', 'Standard', [cap])

			const validation = qualifier.validate(definition)
			expect(validation.valid).toBe(true)
			expect(validation.warnings).toContain("Quantitative pass 'cap' is never read by a later pass")

			qualifier.destroy()
		})
	})

	describe('immutability', () => {
		it('freezes the result and its arrays', () => {
			const qualifier = createQualifier()
			const result = qualifier.qualify({ id: 'risk-1' }, buildGatesDefinition())

			expect(Object.isFrozen(result)).toBe(true)
			expect(Object.isFrozen(result.findings)).toBe(true)
			expect(Object.isFrozen(result.derivations)).toBe(true)
			expect(Object.isFrozen(result.scopes)).toBe(true)
			expect(Object.isFrozen(result.trace)).toBe(true)
			expect(Object.isFrozen(result.errors)).toBe(true)

			const findings: unknown = result.findings
			expect(() => {
				if (Array.isArray(findings)) findings.push({})
			}).toThrow(TypeError)

			qualifier.destroy()
		})
	})

	describe('isQualifierError guard', () => {
		it('narrows QualifierError and rejects everything else', () => {
			expect(isQualifierError(new QualifierError('MISMATCH', 'm'))).toBe(true)
			expect(isQualifierError(new QualifierError('ENGINE', 'e'))).toBe(true)
			expect(isQualifierError(new Error('x'))).toBe(false)
			expect(isQualifierError(null)).toBe(false)
		})
	})

	describe('destroy emits exactly once', () => {
		it('fires the destroy event exactly once across repeated calls', () => {
			const destroyed = createRecorder<readonly []>()
			const qualifier = createQualifier({ on: { destroy: () => destroyed.handler() } })

			qualifier.destroy()
			qualifier.destroy()

			expect(destroyed.count).toBe(1)
		})
	})
})

function matchesFieldPath(
	field: string | readonly string[] | undefined,
	expected: readonly string[],
): boolean {
	if (field === undefined) return false
	if (Array.isArray(field)) {
		return (
			field.length === expected.length && field.every((part, index) => part === expected[index])
		)
	}
	return field === expected.join('.')
}

function qualitativeDefinitionWithDottedField() {
	const cap = quantitativeDefinition('cap', 'Cap', [
		factorGroup('limit', 'sum', [fieldFactor('total', 'total')]),
	])
	const gates = logicalDefinition('gates', 'Gates', [
		rule('cap-check', [atom('qualification.cap', 'above', 50)], atom('blocked', 'equals', true)),
	])
	return qualificationDefinition('property', 'Property', [cap, gates])
}
