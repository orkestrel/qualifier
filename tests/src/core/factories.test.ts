import { describe, expect, it } from 'vitest'
import { createQualificationDefinition, createQualifier, createRuling } from '@src/core'
import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
import { buildGatesDefinition } from '../../setup.js'

const gatesPass = createLogicalDefinition('gates', 'Eligibility gates', [
	createRule(
		'licensed',
		[createAtom('licensed', 'equals', false)],
		createAtom('blocked', 'equals', true),
	),
])

describe('factories', () => {
	describe('createQualifier', () => {
		it('returns a working qualifier', () => {
			const qualifier = createQualifier()
			const definition = buildGatesDefinition()
			const result = qualifier.qualify({ id: 'risk-1', licensed: false }, definition)
			expect(result.eligibility).toBe('ineligible')
			qualifier.destroy()
		})
	})

	describe('createQualificationDefinition', () => {
		it('returns an equal but unshared definition on every call', () => {
			const first = createQualificationDefinition('standard', 'Standard', [gatesPass])
			const second = createQualificationDefinition('standard', 'Standard', [gatesPass])

			expect(first).toEqual(second)
			expect(first).not.toBe(second)
		})

		it('copies the passes, rulings, and metadata the caller supplies', () => {
			const passes = [gatesPass]
			const rulings = [createRuling('license', 'gates', 'licensed', 'restriction')]
			const metadata = { line: 'property' }
			const definition = createQualificationDefinition('standard', 'Standard', passes, {
				rulings,
				metadata,
			})

			expect(definition.passes).toEqual(passes)
			expect(definition.passes).not.toBe(passes)
			expect(definition.rulings).toEqual(rulings)
			expect(definition.rulings).not.toBe(rulings)
			expect(definition.metadata).toEqual(metadata)
			expect(definition.metadata).not.toBe(metadata)
		})

		it('omits every optional key the input leaves absent', () => {
			const definition = createQualificationDefinition('standard', 'Standard', [gatesPass])

			expect(Object.keys(definition).sort()).toEqual(['id', 'name', 'passes'])
		})

		it('carries the description the input supplies', () => {
			const definition = createQualificationDefinition('standard', 'Standard', [gatesPass], {
				description: 'Standard eligibility',
			})

			expect(definition.description).toBe('Standard eligibility')
		})
	})

	describe('createRuling', () => {
		it('returns an equal but unshared ruling on every call', () => {
			const first = createRuling('license', 'gates', 'licensed', 'restriction')
			const second = createRuling('license', 'gates', 'licensed', 'restriction')

			expect(first).toEqual(second)
			expect(first).not.toBe(second)
		})

		it('omits scope and message when the input leaves them absent', () => {
			const ruling = createRuling('license', 'gates', 'licensed', 'restriction')

			expect(Object.keys(ruling).sort()).toEqual(['effect', 'id', 'pass', 'rule'])
		})

		it('carries the scope and message the input supplies', () => {
			const ruling = createRuling('coastal', 'wind', 'coastal', 'restriction', {
				scope: 'wind',
				message: 'Wind coverage is unavailable within two miles of saltwater',
			})

			expect(ruling.scope).toBe('wind')
			expect(ruling.message).toBe('Wind coverage is unavailable within two miles of saltwater')
		})
	})
})
