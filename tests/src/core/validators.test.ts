import { describe, expect, it } from 'vitest'
import {
	isEligibility,
	isQualificationDefinition,
	isQualificationEffect,
	isQualificationPass,
	isRuling,
} from '@src/core'
import { logicalDefinition, quantitativeDefinition, rule, atom } from '@orkestrel/reason'
import {
	buildCyclicRecord,
	buildDeepRecord,
	buildHostileRecord,
	buildGatesDefinition,
} from '../../setup.js'

const gatesPass = logicalDefinition('gates', 'Gates', [
	rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
])
const capPass = quantitativeDefinition('cap', 'Cap', [])

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
	})

	describe('isQualificationDefinition', () => {
		const valid = buildGatesDefinition()

		it('accepts a complete definition', () => {
			expect(isQualificationDefinition(valid)).toBe(true)
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
