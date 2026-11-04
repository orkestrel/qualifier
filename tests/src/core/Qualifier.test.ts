import { describe, expect, it } from 'vitest'
import {
	booleanShape,
	numberShape,
	objectShape,
	optionalShape,
	stringShape,
} from '@orkestrel/contract'
import {
	createQualificationDefinition,
	createQualificationDefinitionContract,
	createQualifier,
	createRuling,
	isQualificationDefinition,
	isQualifierError,
	projectQualificationResult,
	qualificationResultContract,
	QUALIFICATION_KEY,
	QualifierError,
} from '@src/core'
import {
	createAtom,
	createCompound,
	createEvaluator,
	createFactorGroup,
	createFieldFactor,
	createLogicalDefinition,
	createLogicalReasoner,
	createQuantitativeDefinition,
	createQuantitativeReasoner,
	createReason,
	createRule,
	createStaticFactor,
	createTransform,
	isReasonValidationResult,
} from '@orkestrel/reason'
import { captureError, createRecorder, invokeUnchecked } from '@orkestrel/test'
import {
	createCannedEngine,
	createCountingReason,
	buildCapExcessGatesDefinition,
	buildConditionDefinition,
	buildContinuingLogicalDefinition,
	buildDottedFieldDefinition,
	buildEvidenceSnapshotDefinition,
	buildGatesDefinition,
	buildReferralDefinition,
	buildScopedWindDefinition,
	createFailingEngine,
	expectNoForbiddenKeys,
	matchesFieldPath,
} from '../../setup.js'

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
					state: 'met',
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
			const cap = createQuantitativeDefinition('cap', 'Cap', [
				createFactorGroup('limit', 'sum', [createStaticFactor('base', 750_000)]),
			])
			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule(
					'cap-check',
					[createAtom(['qualification', 'cap'], 'above', 500_000)],
					createAtom('blocked', 'equals', true),
				),
			])
			const definition = createQualificationDefinition('property', 'Property', [cap, gates], {
				rulings: [
					createRuling('cap', 'gates', 'cap-check', 'restriction', {
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
					state: 'unmet',
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
			const condition = createQualificationDefinition(
				'condition',
				'Condition',
				[
					createLogicalDefinition('gates', 'Gates', [
						createRule(
							'note',
							[createAtom('note', 'equals', true)],
							createAtom('flagged', 'equals', true),
						),
					]),
				],
				{
					rulings: [
						createRuling('note', 'gates', 'note', 'condition', {
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
		const gates = createLogicalDefinition('gates', 'Gates', [
			createRule(
				'licensed',
				[createAtom('licensed', 'equals', false)],
				createAtom('blocked', 'equals', true),
			),
		])
		const cap = createQuantitativeDefinition('cap', 'Cap', [])

		it('reports missing pass, non-logical pass, missing rule, reserved pass id, and duplicate ids', () => {
			const qualifier = createQualifier()
			const definition = createQualificationDefinition('bad', 'Bad', [cap, gates, gates], {
				rulings: [
					createRuling('dup', 'gates', 'licensed', 'restriction'),
					createRuling('dup', 'gates', 'licensed', 'referral'),
					createRuling('missing-pass', 'absent', 'licensed', 'restriction'),
					createRuling('quant-pass', 'cap', 'base', 'restriction'),
					createRuling('missing-rule', 'gates', 'absent', 'restriction'),
				],
			})
			const reserved = createQualificationDefinition('reserved', 'Reserved', [
				createQuantitativeDefinition(QUALIFICATION_KEY, 'Reserved', []),
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
			const definition = createQualificationDefinition('bad', 'Bad', [cap], {
				rulings: [createRuling('missing-pass', 'absent', 'licensed', 'restriction')],
			})

			expect(() => qualifier.qualify({ id: 'a' }, definition)).toThrow(
				expect.objectContaining({
					code: 'DEFINITION',
					context: { definition: 'bad' },
					name: 'QualifierError',
				}),
			)

			qualifier.destroy()
		})

		it('carries no context on a throw with no payload', () => {
			const qualifier = createQualifier()
			qualifier.destroy()

			expect(() =>
				qualifier.qualify({ id: 'a' }, createQualificationDefinition('empty', 'Empty', [])),
			).toThrow(
				expect.objectContaining({
					code: 'DESTROYED',
					context: undefined,
					name: 'QualifierError',
				}),
			)
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
				engine.reason(
					{ id: 'a', total: 1 },
					createQuantitativeDefinition('cap', 'Cap', [
						createFactorGroup('g', 'sum', [createStaticFactor('s', 1)]),
					]),
				),
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
			const definition = createQualificationDefinition('empty', 'Empty', [])
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
			const referralFirst = createLogicalDefinition('referral-gates', 'Referral gates', [
				createRule(
					'roof',
					[createAtom('roof', 'equals', true)],
					createAtom('flagged', 'equals', true),
				),
			])
			const restrictionSecond = createLogicalDefinition('restriction-gates', 'Restriction gates', [
				createRule(
					'frame',
					[createAtom('frame', 'equals', true)],
					createAtom('blocked', 'equals', true),
				),
			])
			const trailing = createQuantitativeDefinition('trailing', 'Trailing', [
				createFactorGroup('value', 'sum', [createStaticFactor('one', 1)]),
			])

			const referralDefinition = createQualificationDefinition(
				'mixed',
				'Mixed',
				[referralFirst, restrictionSecond, trailing],
				{
					rulings: [
						createRuling('roof', 'referral-gates', 'roof', 'referral'),
						createRuling('frame', 'restriction-gates', 'frame', 'restriction'),
					],
				},
			)

			const restrictionFirst = createQualificationDefinition(
				'terminal',
				'Terminal',
				[
					createLogicalDefinition('stop', 'Stop', [
						createRule(
							'stop',
							[createAtom('stop', 'equals', true)],
							createAtom('blocked', 'equals', true),
						),
					]),
					trailing,
				],
				{
					rulings: [createRuling('stop', 'stop', 'stop', 'restriction')],
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
				createQualificationDefinition('continue', 'Continue', [referralFirst, trailing], {
					rulings: [createRuling('roof', 'referral-gates', 'roof', 'referral')],
				}),
			)
			expect(referralContinues.eligibility).toBe('referral')
			expect(referralContinues.derivations).toHaveLength(1)

			qualifier.destroy()
		})
	})

	describe('scoped-only proofs', () => {
		it('keeps global eligibility eligible and scopes independent', () => {
			const wind = createLogicalDefinition('wind', 'Wind', [
				createRule(
					'coastal',
					[createAtom('distance', 'to', 2)],
					createAtom('blocked', 'equals', true),
				),
			])
			const frame = createLogicalDefinition('frame', 'Frame', [
				createRule(
					'frame',
					[createAtom('construction', 'equals', 'Frame')],
					createAtom('blocked', 'equals', true),
				),
			])
			const definition = createQualificationDefinition('property', 'Property', [wind, frame], {
				rulings: [
					createRuling('coastal', 'wind', 'coastal', 'restriction', { scope: 'wind' }),
					createRuling('frame', 'frame', 'frame', 'referral', { scope: 'frame' }),
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
			const cap = createQuantitativeDefinition('cap', 'Cap', [
				createFactorGroup('limit', 'sum', [createStaticFactor('base', 500_000)]),
			])
			const excess = createQuantitativeDefinition('excess', 'Excess', [
				createFactorGroup('excess', 'sum', [
					createFieldFactor('total', 'total'),
					createFieldFactor('cap', ['qualification', 'cap'], {
						transforms: [createTransform('multiply', -1)],
					}),
				]),
			])
			const definition = createQualificationDefinition('property', 'Property', [cap, excess])
			const subject = { id: 'risk-1', total: 750_000 }

			const qualifier = createQualifier()
			const result = qualifier.qualify(subject, definition)

			expect(subject).toEqual({ id: 'risk-1', total: 750_000 })
			expect('cap' in subject).toBe(false)
			expect('excess' in subject).toBe(false)
			expect('qualification' in subject).toBe(false)
			expect(result.derivations.map((entry) => entry.id)).toEqual(['cap', 'excess'])

			const dotted = buildDottedFieldDefinition()
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
				'defaulted',
				'derivations',
				'eligibility',
				'errors',
				'faults',
				'findings',
				'id',
				'name',
				'repairs',
				'scopes',
				'success',
				'trace',
			])
			expectNoForbiddenKeys(result, (actual) => expect(actual).toBe(false))
			qualifier.destroy()
		})
	})

	describe('evidence-snapshot integrity', () => {
		it('reads premises from what each rule read, so a read of its own pass stays unread', () => {
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

			expect(earlierFinding?.state).toBe('met')
			expect(earlierPremise).toEqual(expect.objectContaining({ state: 'met', actual: 42 }))
			expect(result.eligibility).toBe('referral')
			expect(result.success).toBe(false)
			expect(samePassFinding?.state).toBe('unread')
			expect(samePassPremise).toEqual(
				expect.objectContaining({ state: 'unread', actual: undefined }),
			)
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
		it('maps a missing reasoner to DEFINITION when validating, and to ENGINE when not', () => {
			const engine = createReason({
				reasoners: [createQuantitativeReasoner({ evaluator: createEvaluator() })],
				bail: false,
			})
			const qualifier = createQualifier({ engine })
			const unchecked = createQualifier({ engine, validate: false })
			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule(
					'flag',
					[createAtom('flag', 'equals', true)],
					createAtom('noted', 'equals', true),
				),
			])
			const definition = createQualificationDefinition('bad', 'Bad', [gates])

			expect(() => qualifier.qualify({ id: 'x', flag: true }, definition)).toThrow(
				expect.objectContaining({ code: 'DEFINITION', name: 'QualifierError' }),
			)
			expect(() => unchecked.qualify({ id: 'x', flag: true }, definition)).toThrow(
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
			const cap = createQuantitativeDefinition('cap', 'Cap', [
				createFactorGroup('limit', 'sum', [createStaticFactor('base', 1)]),
			])
			const excess = createQuantitativeDefinition('excess', 'Excess', [
				createFactorGroup('excess', 'sum', [createStaticFactor('base', 1)]),
			])
			const definition = createQualificationDefinition('property', 'Property', [cap, excess])
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
			const definition = createQualificationDefinition('', 'Standard', [])

			expect(qualifier.validate(definition).valid).toBe(false)
			expect(qualifier.validate(definition).errors).toContain('Definition id must not be empty')

			qualifier.destroy()
		})

		it('reports an empty name', () => {
			const qualifier = createQualifier()
			const definition = createQualificationDefinition('standard', '', [])

			expect(qualifier.validate(definition).errors).toContain('Definition name must not be empty')

			qualifier.destroy()
		})

		it('reports valid with no errors or warnings for a well-formed definition', () => {
			const qualifier = createQualifier()
			const validation = qualifier.validate(buildGatesDefinition())

			expect(validation).toEqual({ valid: true, errors: [], warnings: [] })
			expect(isReasonValidationResult(validation)).toBe(true)

			qualifier.destroy()
		})
	})

	describe('validate — empty passes fail-open', () => {
		it('is valid with a no-passes warning, and qualifies as eligible', () => {
			const qualifier = createQualifier()
			const definition = createQualificationDefinition('empty', 'Empty', [])

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
			const gates = createLogicalDefinition('gates', 'Gates', [
				createRule(
					'licensed',
					[createAtom('licensed', 'equals', false)],
					createAtom('blocked', 'equals', true),
				),
			])
			const definition = createQualificationDefinition('standard', 'Standard', [gates])

			const validation = qualifier.validate(definition)
			expect(validation.valid).toBe(true)
			expect(validation.warnings).toContain("Logical pass 'gates' has no rulings")

			qualifier.destroy()
		})

		it('warns on a quantitative pass never read by a later pass', () => {
			const qualifier = createQualifier()
			const cap = createQuantitativeDefinition('cap', 'Cap', [
				createFactorGroup('limit', 'sum', [createStaticFactor('base', 1)]),
			])
			const definition = createQualificationDefinition('standard', 'Standard', [cap])

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

	describe('QualifierError context', () => {
		it('reads each context member off a caught error without narrowing', () => {
			const cause = new Error('engine')
			const definition = new QualifierError('DEFINITION', 'invalid', { definition: 'bad' })
			const engine = new QualifierError('ENGINE', 'failed', { pass: 'gates', cause })

			expect(definition.context?.definition).toBe('bad')
			expect(definition.context?.pass).toBeUndefined()
			expect(engine.context?.pass).toBe('gates')
			expect(engine.context?.cause).toBe(cause)
			expect(new QualifierError('MISMATCH', 'm').context).toBeUndefined()
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

describe('Qualifier — refusing what it cannot read', () => {
	const ask = createAtom('credit', 'above', 600)
	const flagged = createAtom('flagged', 'equals', true)
	const blocked = createAtom('blocked', 'equals', true)
	const gates = createLogicalDefinition('gates', 'Gates', [createRule('credit', [ask], flagged)])
	const refer = createRuling('credit', 'gates', 'credit', 'restriction')

	it('a pass left unread reads referral, names the field, and marks the finding unread', () => {
		const qualifier = createQualifier()
		const definition = createQualificationDefinition('d', 'd', [gates], { rulings: [refer] })
		const result = qualifier.qualify({}, definition)
		expect(result.eligibility).toBe('referral')
		expect(result.success).toBe(false)
		expect(result.errors).toEqual(['Field "credit" is missing'])
		expect(result.faults).toEqual([{ reason: 'missing', path: 'credit', expected: 'number' }])
		expect(result.findings.map((finding) => finding.state)).toEqual(['unread'])
		qualifier.destroy()
	})

	it('the run goes on past an unread pass, so a later restriction outranks its referral', () => {
		const qualifier = createQualifier()
		const later = createLogicalDefinition('later', 'Later', [
			createRule('roof', [createAtom('roof', 'equals', false)], blocked),
		])
		const definition = createQualificationDefinition('d', 'd', [gates, later], {
			rulings: [refer, createRuling('roof', 'later', 'roof', 'restriction')],
		})
		const result = qualifier.qualify({ roof: false }, definition)
		expect(result.eligibility).toBe('ineligible')
		expect(result.success).toBe(false)
		expect(result.faults.map((fault) => fault.path)).toEqual(['credit'])
		qualifier.destroy()
	})

	it('a read of an unread pass names what that pass could not read', () => {
		const qualifier = createQualifier()
		const later = createLogicalDefinition('later', 'Later', [
			createRule(
				'reads',
				[createAtom(['qualification', 'gates', 'flagged'], 'equals', true)],
				blocked,
			),
		])
		const definition = createQualificationDefinition('d', 'd', [gates, later])
		const result = qualifier.qualify({}, definition)
		expect(result.faults).toEqual([{ reason: 'missing', path: 'credit', expected: 'number' }])
		expect(result.errors).toEqual(['Field "credit" is missing'])
		qualifier.destroy()
	})

	it('a missing input never scores as zero: a derived score projects nothing', () => {
		const qualifier = createQualifier()
		const score = createQuantitativeDefinition('score', 'Score', [
			createFactorGroup('g', 'sum', [createFieldFactor('f', 'points')]),
		])
		const denied = createLogicalDefinition('denied', 'Denied', [
			createRule('low', [createAtom(['qualification', 'score'], 'below', 10)], blocked),
		])
		const definition = createQualificationDefinition('d', 'd', [score, denied], {
			rulings: [createRuling('low', 'denied', 'low', 'restriction')],
		})
		const result = qualifier.qualify({}, definition)
		expect(result.eligibility).toBe('referral')
		expect(result.faults).toEqual([{ reason: 'missing', path: 'points', expected: 'number' }])
		qualifier.destroy()
	})

	it('a settled pass projects false for what it did not fire, so a later read settles', () => {
		const qualifier = createQualifier()
		const later = createLogicalDefinition('later', 'Later', [
			createRule(
				'clear',
				[createAtom(['qualification', 'gates', 'flagged'], 'equals', false)],
				blocked,
			),
		])
		const definition = createQualificationDefinition('d', 'd', [gates, later], {
			rulings: [createRuling('clear', 'later', 'clear', 'referral')],
		})
		const result = qualifier.qualify({ credit: 100 }, definition)
		expect(result.success).toBe(true)
		expect(result.findings.map((finding) => finding.state)).toEqual(['met'])
		qualifier.destroy()
	})

	it('an error no fault can say stops the run', () => {
		const qualifier = createQualifier({ validate: false })
		const bad = createLogicalDefinition('bad', 'Bad', [
			createRule('reads', [createAtom('derived', 'above', 1)], createAtom('out', 'equals', true)),
			createRule('never', [createAtom('x', 'equals', 2)], createAtom('derived', 'equals', 1)),
		])
		const later = createLogicalDefinition('later', 'Later', [
			createRule('roof', [createAtom('roof', 'equals', false)], blocked),
		])
		const definition = createQualificationDefinition('d', 'd', [bad, later], {
			rulings: [createRuling('roof', 'later', 'roof', 'restriction')],
		})
		const result = qualifier.qualify({ x: 1, roof: false }, definition)
		expect(result.success).toBe(false)
		expect(result.eligibility).toBe('referral')
		expect(result.findings).toEqual([])
		qualifier.destroy()
	})
})

describe('Qualifier — premises read what the rule read', () => {
	it('a premise on a key derived in the same pass reads the final overlay', () => {
		const qualifier = createQualifier()
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('adult', [createAtom('age', 'from', 18)], createAtom('adult', 'equals', true)),
			createRule('ok', [createAtom('adult', 'equals', true)], createAtom('ok', 'equals', true)),
		])
		const definition = createQualificationDefinition('d', 'd', [pass], {
			rulings: [createRuling('ok', 'gates', 'ok', 'referral')],
		})
		const result = qualifier.qualify({ age: 30 }, definition)
		expect(result.findings[0]?.premises).toEqual([
			{ field: 'adult', comparison: 'equals', expected: true, actual: true, state: 'met' },
		])
		qualifier.destroy()
	})

	it('a premise on an unread input reads unread, which renders as unknown', () => {
		const qualifier = createQualifier()
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('r', [createAtom('age', 'from', 18)], createAtom('ok', 'equals', true)),
		])
		const definition = createQualificationDefinition('d', 'd', [pass], {
			rulings: [createRuling('r', 'gates', 'r', 'referral')],
		})
		const premise = qualifier.qualify({}, definition).findings[0]?.premises[0]
		expect(premise?.state).toBe('unread')
		qualifier.destroy()
	})
})

describe('Qualifier — the door', () => {
	const rule = createRule('r', [createAtom('age', 'from', 18)], createAtom('ok', 'equals', true))
	const pass = createLogicalDefinition('gates', 'Gates', [rule])
	const ruling = createRuling('r', 'gates', 'r', 'restriction')
	const shape = objectShape({ age: numberShape(), licensed: optionalShape(booleanShape()) })
	const definition = createQualificationDefinition('d', 'd', [pass], { rulings: [ruling], shape })

	it('a subject the shape refuses reads referral with its faults, and no pass runs', () => {
		const qualifier = createQualifier()
		const result = qualifier.qualify({ age: 30, agee: 1 }, definition)
		expect(result.eligibility).toBe('referral')
		expect(result.success).toBe(false)
		expect(result.faults).toEqual([{ reason: 'extra', path: ['agee'] }])
		expect(result.errors).toEqual(['Field "agee" is not declared'])
		expect(result.findings).toEqual([])
		qualifier.destroy()
	})

	it('a lossless repair reaches the passes and is reported', () => {
		const qualifier = createQualifier()
		const result = qualifier.qualify({ age: '30' }, definition)
		expect(result.success).toBe(true)
		expect(result.eligibility).toBe('ineligible')
		expect(result.repairs.map((fault) => fault.path)).toEqual([['age']])
		qualifier.destroy()
	})

	it('a default fills through the door and is reported', () => {
		const qualifier = createQualifier()
		const filled = objectShape({
			age: numberShape(),
			licensed: optionalShape(booleanShape(), { default: false }),
		})
		const read = createLogicalDefinition('gates', 'Gates', [
			createRule('r', [createAtom('licensed', 'equals', false)], createAtom('ok', 'equals', true)),
		])
		const result = qualifier.qualify(
			{ age: 30 },
			createQualificationDefinition('d', 'd', [read], { rulings: [ruling], shape: filled }),
		)
		expect(result.success).toBe(true)
		expect(result.defaulted).toEqual([['licensed']])
		qualifier.destroy()
	})
})

describe('Qualifier — validate reads each pass through the engine', () => {
	const okay = createAtom('ok', 'equals', true)

	it('an error in a pass carries its id', () => {
		const qualifier = createQualifier()
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('r', [createCompound('and', [])], okay),
		])
		const validation = qualifier.validate(createQualificationDefinition('d', 'd', [pass]))
		expect(validation.errors).toContain('gates: Connective "and" has 0 operands')
		qualifier.destroy()
	})

	it('qualify refuses it before any pass runs', () => {
		const qualifier = createQualifier()
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('r', [createCompound('not', [])], okay),
		])
		const error = captureError(() =>
			qualifier.qualify({}, createQualificationDefinition('d', 'd', [pass])),
		)
		expect(isQualifierError(error) && error.code).toBe('DEFINITION')
		qualifier.destroy()
	})

	it('a pass may carry no shape, because the subject it reads holds qualification too', () => {
		const qualifier = createQualifier()
		const pass = createLogicalDefinition(
			'gates',
			'Gates',
			[createRule('r', [createAtom('a', 'equals', 1)], okay)],
			{ shape: objectShape({ a: numberShape() }) },
		)
		expect(qualifier.validate(createQualificationDefinition('d', 'd', [pass])).errors).toContain(
			"Pass 'gates' may not carry a shape",
		)
		qualifier.destroy()
	})

	it('a shape on the definition must stand, and declare every message token', () => {
		const qualifier = createQualifier()
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('r', [createAtom('age', 'from', 18)], okay),
		])
		const patterned = createQualificationDefinition('d', 'd', [pass], {
			rulings: [createRuling('r', 'gates', 'r', 'referral', { message: 'Age {{agee}}' })],
			shape: objectShape({ age: numberShape(), code: stringShape({ pattern: /x/ }) }),
		})
		const validation = qualifier.validate(patterned)
		expect(validation.errors).toContain(
			'Field "code" carries a pattern, which does not survive JSON',
		)
		expect(validation.errors).toContain(
			'Ruling \'r\' message reads "agee", and the shape does not declare it',
		)
		qualifier.destroy()
	})

	it('a definition validates once, remembered by identity', () => {
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('r', [createAtom('age', 'from', 18)], okay),
		])
		const definition = createQualificationDefinition('d', 'd', [pass])
		const engine = createCountingReason({ reasoners: [createLogicalReasoner()], bail: false })
		const qualifier = createQualifier({ engine })
		qualifier.qualify({ age: 30 }, definition)
		qualifier.qualify({ age: 40 }, definition)
		expect(engine.validations.count).toBe(1)
		qualifier.destroy()
		engine.destroy()
	})
})

describe('Qualifier — published contracts', () => {
	it('a definition crosses on is', () => {
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('r', [createAtom('a', 'equals', 1)], createAtom('ok', 'equals', true)),
		])
		const definition = createQualificationDefinition('d', 'd', [pass], {
			rulings: [createRuling('r', 'gates', 'r', 'referral')],
		})
		const contract = createQualificationDefinitionContract()
		expect(contract.is(definition)).toBe(true)
		expect(isQualificationDefinition(definition)).toBe(true)
		expect(contract.is({ ...definition, extra: 1 })).toBe(false)
	})

	it('a result crosses as its projection, even over a hostile actual', () => {
		const qualifier = createQualifier()
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('r', [createAtom('a', 'above', 1)], createAtom('ok', 'equals', true)),
		])
		const definition = createQualificationDefinition('d', 'd', [pass], {
			rulings: [createRuling('r', 'gates', 'r', 'referral')],
		})
		for (const a of [undefined, Number.NaN, 5, 'x', 1n, { b: Number.NaN }]) {
			const result = qualifier.qualify({ a }, definition)
			expect(qualificationResultContract.audit(projectQualificationResult(result))).toEqual([])
		}
		qualifier.destroy()
	})
})

describe('Qualifier — what the review broke', () => {
	const okay = createAtom('ok', 'equals', true)

	it('a default cannot forge the reserved namespace', () => {
		const qualifier = createQualifier()
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('a', [createAtom(['qualification', 'gates', 'ok'], 'equals', true)], okay),
		])
		const definition = createQualificationDefinition('d', 'd', [pass], {
			rulings: [createRuling('a', 'gates', 'a', 'restriction')],
			shape: objectShape({
				age: numberShape(),
				qualification: optionalShape(objectShape({ gates: objectShape({ ok: booleanShape() }) }), {
					default: { gates: { ok: true } },
				}),
			}),
		})
		expect(qualifier.validate(definition).errors).toContain(
			"Shape declares the reserved key 'qualification'",
		)
		expect(captureError(() => qualifier.qualify({ age: 20 }, definition))).toMatchObject({
			code: 'DEFINITION',
		})
		const unchecked = createQualifier({ validate: false })
		expect(captureError(() => unchecked.qualify({ age: 20 }, definition))).toMatchObject({
			code: 'MISMATCH',
		})
		unchecked.destroy()
		qualifier.destroy()
	})

	it.each<[string, Record<string, unknown>]>([
		['failed and said nothing', { success: false, errors: [] }],
		[
			'succeeded beside an unread rule',
			{
				success: true,
				errors: [],
				conclusion: 'unread',
				rules: [{ id: 'a', state: 'unread', premises: ['unread'], checks: [] }],
			},
		],
	])('an injected engine whose pass %s reads referral', (_name, overrides) => {
		const engine = createCannedEngine({
			reasoning: 'logical',
			conclusion: 'unmet',
			rules: [],
			count: 0,
			trace: [],
			faults: [],
			repairs: [],
			defaulted: [],
			...overrides,
		})
		const qualifier = createQualifier({ engine, validate: false })
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('a', [createAtom('x', 'equals', 1)], okay),
		])
		const result = qualifier.qualify({ x: 1 }, createQualificationDefinition('d', 'd', [pass]))
		expect(result.eligibility).toBe('referral')
		expect(result.success).toBe(false)
		expect(result.errors).toHaveLength(1)
		qualifier.destroy()
	})

	it('an injected engine returning a malformed result reads referral, never a TypeError', () => {
		const engine = createCannedEngine({ reasoning: 'logical', success: true })
		const qualifier = createQualifier({ engine, validate: false })
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('a', [createAtom('x', 'equals', 1)], okay),
		])
		const result = qualifier.qualify({ x: 1 }, createQualificationDefinition('d', 'd', [pass]))
		expect(result.eligibility).toBe('referral')
		expect(result.errors).toEqual(['gates: The engine returned a malformed result'])
		qualifier.destroy()
	})

	it('a chain of unread passes reaches the input that started it', () => {
		const qualifier = createQualifier()
		const first = createLogicalDefinition('a', 'A', [
			createRule('r', [createAtom('age', 'above', 1)], okay),
		])
		const second = createLogicalDefinition('b', 'B', [
			createRule('r', [createAtom(['qualification', 'a', 'ok'], 'equals', true)], okay),
		])
		const third = createLogicalDefinition('c', 'C', [
			createRule('r', [createAtom(['qualification', 'b', 'ok'], 'equals', true)], okay),
		])
		const result = qualifier.qualify(
			{},
			createQualificationDefinition('d', 'd', [first, second, third]),
		)
		expect(result.faults).toEqual([{ reason: 'missing', path: 'age', expected: 'number' }])
		expect(result.errors).toEqual(['Field "age" is missing'])
		qualifier.destroy()
	})

	it('a pass id holding a dot is one id', () => {
		const qualifier = createQualifier()
		const first = createLogicalDefinition('a.b', 'A', [
			createRule('r', [createAtom('age', 'above', 1)], okay),
		])
		const second = createLogicalDefinition('c', 'C', [
			createRule('r', [createAtom(['qualification', 'a.b', 'ok'], 'equals', true)], okay),
		])
		const result = qualifier.qualify({}, createQualificationDefinition('d', 'd', [first, second]))
		expect(result.faults.map((fault) => fault.path)).toEqual(['age'])
		qualifier.destroy()
	})

	it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
		'a scope named %s reads as any other',
		(scope) => {
			const qualifier = createQualifier()
			const pass = createLogicalDefinition('gates', 'Gates', [
				createRule('a', [createAtom('x', 'equals', 1)], okay),
			])
			const result = qualifier.qualify(
				{ x: 1 },
				createQualificationDefinition('d', 'd', [pass], {
					rulings: [createRuling('a', 'gates', 'a', 'restriction', { scope })],
				}),
			)
			expect(Object.hasOwn(result.scopes, scope)).toBe(true)
			expect(result.scopes[scope]).toBe('ineligible')
			qualifier.destroy()
		},
	)

	it("a rule may not conclude the projection's own conclusion", () => {
		const qualifier = createQualifier()
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('r', [createAtom('x', 'equals', 1)], createAtom('conclusion', 'equals', true)),
		])
		expect(qualifier.validate(createQualificationDefinition('d', 'd', [pass])).errors).toContain(
			"Rule 'r' in pass 'gates' concludes the reserved key 'conclusion'",
		)
		qualifier.destroy()
	})

	it('a conclusion key named __proto__ projects as its own data', () => {
		const qualifier = createQualifier()
		const first = createLogicalDefinition('g', 'G', [
			createRule('r', [createAtom('x', 'equals', 1)], createAtom('__proto__', 'equals', true)),
		])
		const second = createLogicalDefinition('h', 'H', [
			createRule('r', [createAtom(['qualification', 'g', '__proto__'], 'equals', true)], okay),
		])
		const result = qualifier.qualify(
			{ x: 1 },
			createQualificationDefinition('d', 'd', [first, second]),
		)
		expect(result.errors).toEqual([])
		qualifier.destroy()
	})

	it('a refused pass reports its findings unread, not unmet', () => {
		const qualifier = createQualifier()
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('a', [createAtom('x', 'equals', 1)], createAtom('x2', 'equals', true)),
		])
		const result = qualifier.qualify(
			{ x: 1, x2: true },
			createQualificationDefinition('d', 'd', [pass], {
				rulings: [createRuling('a', 'gates', 'a', 'referral')],
			}),
		)
		expect(result.findings.map((finding) => finding.state)).toEqual(['unread'])
		qualifier.destroy()
	})

	it('a disabled rule reads unmet, because that is authored', () => {
		const qualifier = createQualifier()
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('a', [createAtom('x', 'equals', 1)], okay, { enabled: false }),
			createRule('b', [createAtom('x', 'equals', 1)], createAtom('other', 'equals', true)),
		])
		const result = qualifier.qualify(
			{ x: 1 },
			createQualificationDefinition('d', 'd', [pass], {
				rulings: [createRuling('a', 'gates', 'a', 'restriction')],
			}),
		)
		expect(result.findings.map((finding) => finding.state)).toEqual(['unmet'])
		expect(result.success).toBe(true)
		qualifier.destroy()
	})

	it.each<[string, unknown]>([
		['null', null],
		['an empty record', {}],
		['null passes', { id: 'd', name: 'd', passes: null }],
		['a null pass', { id: 'd', name: 'd', passes: [null] }],
		['null rulings', { id: 'd', name: 'd', passes: [], rulings: null }],
		['a null ruling', { id: 'd', name: 'd', passes: [], rulings: [null] }],
		['a null shape', { id: 'd', name: 'd', passes: [], shape: null }],
		['metadata that is no JSON', { id: 'd', name: 'd', passes: [], metadata: { a: Number.NaN } }],
	])('validate and qualify refuse %s with a coded error, never a TypeError', (_name, junk) => {
		const qualifier = createQualifier()
		const validation = invokeUnchecked<{ valid: boolean }>(qualifier, qualifier.validate, [junk])
		expect(validation.valid).toBe(false)
		const error = captureError(() =>
			invokeUnchecked<unknown>(qualifier, qualifier.qualify, [{ x: 1 }, junk]),
		)
		expect(isQualifierError(error)).toBe(true)
		qualifier.destroy()
	})

	it('validate reads each pass against the shape, and leaves projections and conclusions alone', () => {
		const qualifier = createQualifier()
		const pass = createLogicalDefinition('gates', 'Gates', [
			createRule('a', [createAtom('agee', 'above', 1)], okay),
			createRule('b', [createAtom('ok', 'equals', true)], createAtom('z', 'equals', true)),
			createRule(
				'c',
				[createAtom(['qualification', 'gates', 'ok'], 'equals', true)],
				createAtom('y', 'equals', true),
			),
		])
		const definition = createQualificationDefinition('d', 'd', [pass], {
			shape: objectShape({ age: numberShape() }),
		})
		const errors = qualifier.validate(definition).errors
		expect(errors).toContain('Field "agee" is read, and the shape does not declare it')
		expect(errors.filter((error) => error.startsWith('Field "'))).toHaveLength(1)
		qualifier.destroy()
	})

	it('a result is frozen all the way through its channels', () => {
		const qualifier = createQualifier()
		const shape = objectShape({ age: numberShape() })
		const result = qualifier.qualify(
			{ age: '30' },
			createQualificationDefinition('d', 'd', [], { shape }),
		)
		expect(Object.isFrozen(result.repairs)).toBe(true)
		expect(Object.isFrozen(result.defaulted)).toBe(true)
		expect(Object.isFrozen(result.faults)).toBe(true)
		qualifier.destroy()
	})
})
