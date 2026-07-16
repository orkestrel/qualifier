import { describe, expect, it } from 'vitest'
import type { QualificationPass } from '@src/core'
import { createQualifier, qualificationDefinition, rulingDefinition } from '@src/core'
import { logicalDefinition, quantitativeDefinition, rule, atom } from '@orkestrel/reason'
import { buildGatesDefinition } from '../../setup.js'

const gatesPass = logicalDefinition('gates', 'Gates', [
	rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
])

describe('factories', () => {
	describe('qualificationDefinition', () => {
		it('copies passes and rulings without aliasing inputs', () => {
			const passes: QualificationPass[] = [gatesPass]
			const rulings = [rulingDefinition('license', 'gates', 'licensed', 'restriction')]
			const definition = qualificationDefinition('standard', 'Standard', passes, { rulings })

			passes.push(quantitativeDefinition('extra', 'Extra', []))
			rulings.push(rulingDefinition('other', 'gates', 'licensed', 'referral'))

			expect(definition.passes).toHaveLength(1)
			expect(definition.passes[0]?.id).toBe('gates')
			expect(definition.rulings).toHaveLength(1)
			expect(definition.rulings?.[0]?.id).toBe('license')
		})

		it('shallow-copies record metadata without aliasing the input object', () => {
			const metadata = { tier: 'gold', nested: { x: 1 } }
			const definition = qualificationDefinition('standard', 'Standard', [gatesPass], {
				metadata,
			})

			metadata.tier = 'changed'
			expect(definition.metadata).toEqual({ tier: 'gold', nested: { x: 1 } })
		})

		it('copies record metadata without aliasing the top-level object', () => {
			const metadata = { note: 'review', count: 1 }
			const definition = qualificationDefinition('standard', 'Standard', [gatesPass], {
				metadata,
			})

			expect(definition.metadata).toEqual({ note: 'review', count: 1 })
			expect(definition.metadata).not.toBe(metadata)
		})

		it('omits absent optional keys', () => {
			const definition = qualificationDefinition('standard', 'Standard', [gatesPass])
			expect('description' in definition).toBe(false)
			expect('rulings' in definition).toBe(false)
			expect('metadata' in definition).toBe(false)
		})
	})

	describe('rulingDefinition', () => {
		it('omits absent scope and message keys', () => {
			const ruling = rulingDefinition('license', 'gates', 'licensed', 'restriction')
			expect('scope' in ruling).toBe(false)
			expect('message' in ruling).toBe(false)
		})

		it('includes provided optional keys', () => {
			const ruling = rulingDefinition('license', 'gates', 'licensed', 'restriction', {
				scope: 'wind',
				message: 'Blocked',
			})
			expect(ruling.scope).toBe('wind')
			expect(ruling.message).toBe('Blocked')
		})
	})

	describe('createQualifier', () => {
		it('returns a working qualifier', () => {
			const qualifier = createQualifier()
			const definition = buildGatesDefinition()
			const result = qualifier.qualify({ id: 'risk-1', licensed: false }, definition)
			expect(result.eligibility).toBe('ineligible')
			qualifier.destroy()
		})
	})
})
