import { describe, expect, it } from 'vitest'
import {
	createQualifier,
	isDerivation,
	isEligibility,
	isEligibilityRecord,
	isFinding,
	isPremise,
	isQualificationDefinition,
	isQualificationEffect,
	isQualificationPass,
	isQualificationResult,
	isRuling,
} from '@src/core'
import {
	createAtom,
	createLogicalDefinition,
	createQuantitativeDefinition,
	createRule,
} from '@orkestrel/reason'
import {
	buildCyclicRecord,
	buildCapExcessGatesDefinition,
	buildDeepRecord,
	buildHostileRecord,
	buildGatesDefinition,
} from '../../setup.js'

const gatesPass = createLogicalDefinition('gates', 'Gates', [
	createRule(
		'licensed',
		[createAtom('licensed', 'equals', false)],
		createAtom('blocked', 'equals', true),
	),
])
const capPass = createQuantitativeDefinition('cap', 'Cap', [])

describe('validators', () => {
	describe('isEligibility', () => {
		it('accepts each eligibility literal', () => {
			expect(isEligibility('eligible')).toBe(true)
			expect(isEligibility('ineligible')).toBe(true)
			expect(isEligibility('referral')).toBe(true)
		})

		it('rejects wrong types and unknown literals', () => {
			expect(isEligibility('pending')).toBe(false)
			expect(isEligibility(1)).toBe(false)
			expect(isEligibility(null)).toBe(false)
		})

		it('returns false without throwing on hostile input', () => {
			expect(() => isEligibility(buildCyclicRecord())).not.toThrow()
			expect(isEligibility(buildCyclicRecord())).toBe(false)
			expect(isEligibility(buildDeepRecord(200))).toBe(false)
			expect(isEligibility(buildHostileRecord())).toBe(false)
		})
	})

	describe('isQualificationEffect', () => {
		it('accepts each effect literal', () => {
			expect(isQualificationEffect('restriction')).toBe(true)
			expect(isQualificationEffect('referral')).toBe(true)
			expect(isQualificationEffect('condition')).toBe(true)
		})

		it('rejects wrong types and unknown literals', () => {
			expect(isQualificationEffect('notice')).toBe(false)
			expect(isQualificationEffect({})).toBe(false)
		})

		it('returns false without throwing on hostile input', () => {
			expect(() => isQualificationEffect(buildCyclicRecord())).not.toThrow()
			expect(isQualificationEffect(buildCyclicRecord())).toBe(false)
		})
	})

	describe('isEligibilityRecord', () => {
		it('accepts own string-named eligibility members and inherited extras', () => {
			const value = Object.assign(Object.create({ note: true }), {
				wind: 'eligible',
				exWind: 'referral',
			})
			expect(isEligibilityRecord(value)).toBe(true)
		})

		it('accepts a class instance', () => {
			const value = new (class {
				readonly wind = 'ineligible'
			})()
			expect(isEligibilityRecord(value)).toBe(true)
		})

		it('rejects each wrong own string-named member', () => {
			expect(isEligibilityRecord({ wind: 'pending' })).toBe(false)
			expect(isEligibilityRecord({ wind: true })).toBe(false)
			const nonEnumerable = Object.defineProperty({}, 'wind', { value: 'pending' })
			expect(isEligibilityRecord(nonEnumerable)).toBe(false)
		})

		it('rejects arrays', () => {
			expect(isEligibilityRecord([])).toBe(false)
		})

		it('returns false without throwing on adversarial objects', () => {
			const cyclic: Record<string, unknown> = {}
			cyclic.self = cyclic
			const nullPrototype = Object.assign(Object.create(null), { wind: 'pending' })
			const throwing = Object.defineProperty({}, 'wind', {
				get() {
					throw new Error('blocked read')
				},
			})
			const revocable = Proxy.revocable({}, {})
			revocable.revoke()

			for (const value of [cyclic, nullPrototype, throwing, revocable.proxy]) {
				expect(() => isEligibilityRecord(value)).not.toThrow()
				expect(isEligibilityRecord(value)).toBe(false)
			}
		})

		it('rejects values outside the own-string-keyed eligibility-record membership rule', () => {
			expect(isEligibilityRecord('wind')).toBe(false)
		})
	})

	describe('isPremise', () => {
		const valid = {
			field: 'age',
			label: 'Age',
			description: 'Applicant age',
			comparison: 'above',
			expected: 20,
			actual: 30,
			met: true,
		}

		it('accepts extra members and leaves unknown-typed members unchecked', () => {
			expect(isPremise({ ...valid, expected: Symbol('expected'), extra: true })).toBe(true)
			const unread = Object.defineProperty({}, 'actual', {
				get() {
					throw new Error('must remain unread')
				},
			})
			expect(isPremise(unread)).toBe(true)
		})

		it('accepts a class instance', () => {
			const value = new (class {
				readonly field = 'age'
				readonly met = true
			})()
			expect(isPremise(value)).toBe(true)
		})

		it('accepts absent and undefined optional members', () => {
			expect(isPremise({})).toBe(true)
			expect(
				isPremise({
					field: undefined,
					label: undefined,
					description: undefined,
					comparison: undefined,
					expected: undefined,
					actual: undefined,
					met: undefined,
				}),
			).toBe(true)
		})

		it('rejects each wrong checked optional member', () => {
			expect(isPremise({ ...valid, field: 1 })).toBe(false)
			expect(isPremise({ ...valid, label: 1 })).toBe(false)
			expect(isPremise({ ...valid, description: 1 })).toBe(false)
			expect(isPremise({ ...valid, comparison: 'near' })).toBe(false)
			expect(isPremise({ ...valid, met: 'yes' })).toBe(false)
		})

		it('rejects arrays', () => {
			expect(isPremise([])).toBe(false)
		})

		it('returns false without throwing on adversarial objects', () => {
			const cyclic: Record<string, unknown> = { met: 'yes' }
			cyclic.self = cyclic
			const nullPrototype = Object.assign(Object.create(null), { met: 'yes' })
			const throwing = Object.defineProperty({}, 'met', {
				get() {
					throw new Error('blocked read')
				},
			})
			const revocable = Proxy.revocable({}, {})
			revocable.revoke()

			for (const value of [cyclic, nullPrototype, throwing, revocable.proxy]) {
				expect(() => isPremise(value)).not.toThrow()
				expect(isPremise(value)).toBe(false)
			}
		})

		it('rejects values outside the optional premise-member contract', () => {
			expect(isPremise('age is above 20')).toBe(false)
		})
	})

	describe('isFinding', () => {
		const valid = {
			id: 'license',
			pass: 'gates',
			rule: 'licensed',
			effect: 'restriction',
			scope: 'wind',
			applied: true,
			message: 'A license is required',
			premises: [{ field: 'licensed', comparison: 'equals', expected: false, met: true }],
		}

		it('accepts extra members', () => {
			expect(isFinding({ ...valid, extra: true })).toBe(true)
		})

		it('accepts a class instance', () => {
			const value = new (class {
				readonly id = valid.id
				readonly pass = valid.pass
				readonly rule = valid.rule
				readonly effect = valid.effect
				readonly applied = valid.applied
				readonly premises = valid.premises
			})()
			expect(isFinding(value)).toBe(true)
		})

		it('accepts absent and undefined optional members', () => {
			const minimal = {
				id: valid.id,
				pass: valid.pass,
				rule: valid.rule,
				effect: valid.effect,
				applied: valid.applied,
				premises: valid.premises,
			}
			expect(isFinding(minimal)).toBe(true)
			expect(isFinding({ ...minimal, scope: undefined, message: undefined })).toBe(true)
		})

		it('rejects each wrong member', () => {
			expect(isFinding({ ...valid, id: 1 })).toBe(false)
			expect(isFinding({ ...valid, pass: 1 })).toBe(false)
			expect(isFinding({ ...valid, rule: 1 })).toBe(false)
			expect(isFinding({ ...valid, effect: 'notice' })).toBe(false)
			expect(isFinding({ ...valid, scope: 1 })).toBe(false)
			expect(isFinding({ ...valid, applied: 'yes' })).toBe(false)
			expect(isFinding({ ...valid, message: 1 })).toBe(false)
			expect(isFinding({ ...valid, premises: [false] })).toBe(false)
		})

		it('rejects arrays', () => {
			expect(isFinding([])).toBe(false)
		})

		it('returns false without throwing on adversarial objects', () => {
			const cyclic: Record<string, unknown> = { id: 1 }
			cyclic.self = cyclic
			const nullPrototype = Object.assign(Object.create(null), { id: 1 })
			const throwing = Object.defineProperty({}, 'id', {
				get() {
					throw new Error('blocked read')
				},
			})
			const revocable = Proxy.revocable({}, {})
			revocable.revoke()

			for (const value of [cyclic, nullPrototype, throwing, revocable.proxy]) {
				expect(() => isFinding(value)).not.toThrow()
				expect(isFinding(value)).toBe(false)
			}
		})

		it('rejects authored rulings outside the resolved-finding membership rule', () => {
			expect(isFinding({ id: 'r', pass: 'p', rule: 'x', effect: 'restriction' })).toBe(false)
		})
	})

	describe('isDerivation', () => {
		const valid = {
			id: 'cap',
			value: 1_000_000,
			success: true,
			trace: ['cap: 1000000'],
			errors: [],
		}

		it('accepts extra members', () => {
			expect(isDerivation({ ...valid, extra: true })).toBe(true)
		})

		it('accepts a class instance and every JavaScript number', () => {
			const value = new (class {
				readonly id = valid.id
				readonly value = Number.NaN
				readonly success = valid.success
				readonly trace = valid.trace
				readonly errors = valid.errors
			})()
			expect(isDerivation(value)).toBe(true)
		})

		it('rejects each wrong member', () => {
			expect(isDerivation({ ...valid, id: 1 })).toBe(false)
			expect(isDerivation({ ...valid, value: '1000000' })).toBe(false)
			expect(isDerivation({ ...valid, success: 1 })).toBe(false)
			expect(isDerivation({ ...valid, trace: [1] })).toBe(false)
			expect(isDerivation({ ...valid, errors: [false] })).toBe(false)
		})

		it('rejects arrays', () => {
			expect(isDerivation([])).toBe(false)
		})

		it('returns false without throwing on adversarial objects', () => {
			const cyclic: Record<string, unknown> = { id: 1 }
			cyclic.self = cyclic
			const nullPrototype = Object.assign(Object.create(null), { id: 1 })
			const throwing = Object.defineProperty({}, 'id', {
				get() {
					throw new Error('blocked read')
				},
			})
			const revocable = Proxy.revocable({}, {})
			revocable.revoke()

			for (const value of [cyclic, nullPrototype, throwing, revocable.proxy]) {
				expect(() => isDerivation(value)).not.toThrow()
				expect(isDerivation(value)).toBe(false)
			}
		})

		it('rejects reason results outside the qualification-derivation membership rule', () => {
			expect(
				isDerivation({
					reasoning: 'quantitative',
					value: 1,
					groups: [],
					count: 0,
					success: true,
					trace: [],
					errors: [],
				}),
			).toBe(false)
		})
	})

	describe('isQualificationResult', () => {
		const valid = {
			id: 'standard',
			name: 'Standard eligibility',
			eligibility: 'ineligible',
			scopes: { wind: 'referral' },
			findings: [
				{
					id: 'license',
					pass: 'gates',
					rule: 'licensed',
					effect: 'restriction',
					applied: true,
					premises: [],
				},
			],
			derivations: [{ id: 'cap', value: 1, success: true, trace: [], errors: [] }],
			success: true,
			trace: ['qualified'],
			errors: [],
		}

		it('accepts extra members', () => {
			expect(isQualificationResult({ ...valid, extra: true })).toBe(true)
		})

		it('accepts a class instance with prototype-accessor members', () => {
			const value = new (class {
				get id() {
					return valid.id
				}
				get name() {
					return valid.name
				}
				get eligibility() {
					return valid.eligibility
				}
				get scopes() {
					return valid.scopes
				}
				get findings() {
					return valid.findings
				}
				get derivations() {
					return valid.derivations
				}
				get success() {
					return valid.success
				}
				get trace() {
					return valid.trace
				}
				get errors() {
					return valid.errors
				}
			})()
			expect(isQualificationResult(value)).toBe(true)
		})

		it('rejects each wrong member', () => {
			expect(isQualificationResult({ ...valid, id: 1 })).toBe(false)
			expect(isQualificationResult({ ...valid, name: 1 })).toBe(false)
			expect(isQualificationResult({ ...valid, eligibility: 'pending' })).toBe(false)
			expect(isQualificationResult({ ...valid, scopes: { wind: 'pending' } })).toBe(false)
			expect(isQualificationResult({ ...valid, findings: [false] })).toBe(false)
			expect(isQualificationResult({ ...valid, derivations: [false] })).toBe(false)
			expect(isQualificationResult({ ...valid, success: 1 })).toBe(false)
			expect(isQualificationResult({ ...valid, trace: [1] })).toBe(false)
			expect(isQualificationResult({ ...valid, errors: [false] })).toBe(false)
		})

		it('rejects arrays', () => {
			expect(isQualificationResult([])).toBe(false)
		})

		it('returns false without throwing on adversarial objects', () => {
			const cyclic: Record<string, unknown> = { id: 1 }
			cyclic.self = cyclic
			const nullPrototype = Object.assign(Object.create(null), { id: 1 })
			const throwing = Object.defineProperty({}, 'id', {
				get() {
					throw new Error('blocked read')
				},
			})
			const revocable = Proxy.revocable({}, {})
			revocable.revoke()

			for (const value of [cyclic, nullPrototype, throwing, revocable.proxy]) {
				expect(() => isQualificationResult(value)).not.toThrow()
				expect(isQualificationResult(value)).toBe(false)
			}
		})

		it('accepts the package engine populated qualification result', () => {
			const instance = createQualifier()
			try {
				const result = instance.qualify({ total: 1_250_000 }, buildCapExcessGatesDefinition())
				expect(result.derivations.length).toBeGreaterThan(0)
				expect(result.findings.length).toBeGreaterThan(0)
				expect(result.findings[0]?.premises.length).toBeGreaterThan(0)
				expect(isQualificationResult(result)).toBe(true)
			} finally {
				instance.destroy()
			}
		})

		it('rejects validation results outside the qualification-result membership rule', () => {
			expect(isQualificationResult({ valid: true, errors: [], warnings: [] })).toBe(false)
		})
	})

	describe('isRuling', () => {
		const valid = {
			id: 'license',
			pass: 'gates',
			rule: 'licensed',
			effect: 'restriction',
			message: 'Required',
		}

		it('accepts a minimal exact ruling', () => {
			expect(isRuling({ id: 'r', pass: 'p', rule: 'x', effect: 'referral' })).toBe(true)
		})

		it('accepts optional scope and message', () => {
			expect(isRuling({ ...valid, scope: 'wind' })).toBe(true)
		})

		it('rejects extra keys', () => {
			expect(isRuling({ ...valid, extra: true })).toBe(false)
		})

		it('rejects wrong member types', () => {
			expect(isRuling({ ...valid, effect: 'notice' })).toBe(false)
			expect(isRuling({ ...valid, id: 1 })).toBe(false)
		})

		it('rejects missing required keys', () => {
			expect(isRuling({ pass: 'gates', rule: 'licensed', effect: 'restriction' })).toBe(false)
		})

		it('returns false without throwing on hostile input', () => {
			expect(() => isRuling(buildCyclicRecord())).not.toThrow()
			expect(isRuling(buildCyclicRecord())).toBe(false)
			expect(isRuling(buildDeepRecord(200))).toBe(false)
			expect(isRuling(buildHostileRecord())).toBe(false)
		})

		it('rejects a malformed ruling value', () => {
			const malformed: unknown = { id: 'r', pass: 'p', effect: 'restriction' }
			expect(isRuling(malformed)).toBe(false)
		})
	})

	describe('isQualificationPass', () => {
		it('accepts quantitative and logical definitions', () => {
			expect(isQualificationPass(capPass)).toBe(true)
			expect(isQualificationPass(gatesPass)).toBe(true)
		})

		it('rejects non-pass values', () => {
			expect(isQualificationPass({ id: 'x' })).toBe(false)
			expect(isQualificationPass('quantitative')).toBe(false)
		})

		it('returns false without throwing on hostile input', () => {
			expect(() => isQualificationPass(buildCyclicRecord())).not.toThrow()
			expect(isQualificationPass(buildCyclicRecord())).toBe(false)
		})

		it('rejects a malformed pass value', () => {
			const malformed: unknown = { id: 'cap', name: 'Cap', reasoning: 'quantitative' }
			expect(isQualificationPass(malformed)).toBe(false)
		})
	})

	describe('isQualificationDefinition', () => {
		const valid = buildGatesDefinition()

		it('accepts a complete definition', () => {
			expect(isQualificationDefinition(valid)).toBe(true)
		})

		it('rejects a number and null after the pre-guard removal', () => {
			expect(isQualificationDefinition(42)).toBe(false)
			expect(isQualificationDefinition(null)).toBe(false)
		})

		it('accepts optional description, rulings, and record metadata', () => {
			expect(
				isQualificationDefinition({
					...valid,
					description: 'desc',
					metadata: { tier: 'gold' },
				}),
			).toBe(true)
		})

		it('rejects extra keys', () => {
			expect(isQualificationDefinition({ ...valid, extra: true })).toBe(false)
		})

		it('rejects wrong member types', () => {
			expect(isQualificationDefinition({ ...valid, id: 1 })).toBe(false)
			expect(isQualificationDefinition({ ...valid, passes: 'x' })).toBe(false)
			expect(isQualificationDefinition({ ...valid, metadata: 'note' })).toBe(false)
		})

		it('rejects missing required keys', () => {
			expect(isQualificationDefinition({ name: 'n', passes: [gatesPass] })).toBe(false)
		})

		it('returns false without throwing on hostile input', () => {
			expect(() => isQualificationDefinition(buildCyclicRecord())).not.toThrow()
			expect(isQualificationDefinition(buildCyclicRecord())).toBe(false)
			expect(isQualificationDefinition(buildDeepRecord(200))).toBe(false)
			expect(isQualificationDefinition(buildHostileRecord())).toBe(false)
		})
	})
})
