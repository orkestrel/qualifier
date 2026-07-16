import { describe, expect, it } from 'vitest'
import { createQualifier } from '@src/core'
import { buildGatesDefinition } from '../../setup.js'

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
})
