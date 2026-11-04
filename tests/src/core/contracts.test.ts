import { seededRandom, objectShape, numberShape } from '@orkestrel/contract'
import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
import {
	createQualificationDefinition,
	createQualifier,
	isQualificationDefinition,
	projectQualificationResult,
	qualificationResultContract,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import { buildQualifierContractCases } from '../../setup.js'

describe('standing guard contract table', () => {
	const table = buildQualifierContractCases()
	it('canonical positives and negative controls declare their direction and projection', () => {
		for (const row of table.definitions) {
			expect(row.direction).toBe('is implies guard')
			expect(row.project).toBeUndefined()
			expect(row.wire.is(row.positive)).toBe(true)
			expect(row.guard(row.positive)).toBe(true)
			expect(row.wire.is(row.negative)).toBe(false)
			expect(row.guard(row.negative)).toBe(false)
		}
		for (const row of table.results) {
			expect(row.direction).toBe('producer implies wire after projection')
			expect(row.guard(row.positive)).toBe(true)
			expect(row.wire.is(row.project(row.positive))).toBe(true)
			expect(row.wire.is(row.negative)).toBe(false)
			expect(row.guard(row.negative)).toBe(false)
			expect(row.guard({ ...row.positive, foreign: true })).toBe(true)
		}
		for (const row of table.members) {
			expect(row.direction).toBe('producer implies wire after projection')
			expect(row.guard(row.positive)).toBe(true)
			expect(row.wire.is(row.project(row.positive))).toBe(true)
			expect(row.wire.is(row.negative)).toBe(false)
			expect(row.guard(row.negative)).toBe(false)
			expect(row.guard({ ...row.positive, foreign: true })).toBe(true)
		}
	})
	it.each(table.definitions)('$name: generated admissions imply guard without discards', (row) => {
		const outcomes = Array.from({ length: 100 }, (_, seed) => {
			const value = row.wire.generate(seededRandom(seed))
			return { seed, admitted: row.wire.is(value), guarded: row.guard(value) }
		})
		expect(outcomes.filter((entry) => !entry.admitted)).toEqual([])
		expect(outcomes.filter((entry) => !entry.guarded)).toEqual([])
	})
	it('refuses malformed nested shapes', () => {
		const row = table.definitions[0]
		if (row === undefined) throw new Error('Missing definition row')
		for (const shape of [42, null, {}, { type: 'nonsense' }]) {
			const value = { ...row.positive, shape }
			expect(row.wire.is(value)).toBe(false)
			expect(isQualificationDefinition(value)).toBe(false)
		}
	})
	it('producer success, unread and repaired outcomes cross after projection', () => {
		const pass = createLogicalDefinition('p', 'P', [
			createRule('r', [createAtom('x', 'above', 0)], createAtom('ok', 'equals', true)),
		])
		const qualifier = createQualifier()
		try {
			for (const subject of [{ x: 1 }, {}, { x: NaN }, { x: '2' }]) {
				for (const shape of [undefined, objectShape({ x: numberShape() })]) {
					const definition = createQualificationDefinition(
						'd',
						'D',
						[pass],
						shape === undefined ? {} : { shape },
					)
					const result = qualifier.qualify(subject, definition)
					expect(qualificationResultContract.is(projectQualificationResult(result))).toBe(true)
				}
			}
		} finally {
			qualifier.destroy()
		}
	})
	it('audit fault shape preserves hinted fault fields', () => {
		const row = table.results[0]
		if (row === undefined) throw new Error('Missing result row')
		const fault = { reason: 'variant', path: ['x'], variants: 2, key: 'kind', expected: ['a', 'b'] }
		expect(
			qualificationResultContract.is({ ...row.positive, faults: [fault], repairs: [fault] }),
		).toBe(true)
		expect(
			qualificationResultContract.is({
				...row.positive,
				faults: [{ reason: 'unknown', path: [] }],
			}),
		).toBe(false)
	})
})
