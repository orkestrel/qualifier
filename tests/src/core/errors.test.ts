import type { QualifierErrorContext } from '@src/core'
import { QualifierError, isQualifierError } from '@src/core'
import { describe, expect, it } from 'vitest'

describe('isQualifierError', () => {
	it('accepts a class-instance context', () => {
		class Context {
			readonly [key: string]: unknown
			readonly pass = 'gate'
			readonly definition = 'sample'
			readonly cause = 'failure'
		}

		const context: QualifierErrorContext = new Context()
		const error = new QualifierError('ENGINE', 'failure', context)
		expect(isQualifierError(error)).toBe(true)
	})

	it('accepts a callable context', () => {
		const members: QualifierErrorContext = {
			pass: 'gate',
			definition: 'sample',
			cause: 'failure',
		}
		const context = Object.assign(() => undefined, members)
		const error = new QualifierError('ENGINE', 'failure', context)
		expect(isQualifierError(error)).toBe(true)
	})
})
