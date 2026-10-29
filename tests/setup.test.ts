import { describe, expect, it } from 'vitest'
import { createQuantitativeReasoner } from '@orkestrel/reason'
import { requireValue } from '@orkestrel/test'
import * as setup from './setup.js'

const FIXTURES = setup.collectDefinitionBuilders(setup)

describe('adversarial records', () => {
	it('closes a cycle a structural walk meets', () => {
		const record = setup.buildCyclicRecord()

		expect(record.id).toBe('cycle')
		expect(record.self).toBe(record)
		// `JSON.stringify` finds the cycle by a mechanism the builder does not share.
		expect(() => JSON.stringify(record)).toThrow(TypeError)
	})

	it('nests one level per requested depth above a leaf', () => {
		const deep = setup.buildDeepRecord(setup.GUARD_DEPTH)
		const levels = setup.collectNesting(deep)

		expect(levels.length - 1).toBe(setup.GUARD_DEPTH)
		expect(levels.at(-1)).toEqual({ value: 'leaf' })
		// The serialized form counts the same links without descending them.
		expect(JSON.stringify(deep).split('"nested"').length - 1).toBe(setup.GUARD_DEPTH)
	})

	it('returns the bare leaf at zero depth', () => {
		const shallow = setup.buildDeepRecord(0)

		expect(setup.collectNesting(shallow).length - 1).toBe(0)
		expect(shallow).toEqual({ value: 'leaf' })
	})

	it('builds a prototype-free record without polluting the shared prototype', () => {
		const record = setup.buildHostileRecord()

		expect(record.id).toBe('hostile')
		expect(Object.getPrototypeOf(record)).toBeNull()
		// A guard walking the prototype chain reaches nothing, so `hasOwnProperty` is unreachable.
		expect('toString' in record).toBe(false)
		expect('hasOwnProperty' in record).toBe(false)
		// The builder's `__proto__` literal must stay inert rather than reaching every other suite.
		expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
	})

	it('carries an own `__proto__` key so a guard walking own properties meets it', () => {
		const record = setup.buildHostileRecord()

		// A genuinely hostile record carries `__proto__` as an own key, not as a prototype swap.
		expect(Object.getOwnPropertyNames(record)).toContain('__proto__')
		expect(Object.getPrototypeOf(record)).toBeNull()
	})
})

describe('orderings', () => {
	it('builds every distinct ordering of a list', () => {
		const orderings = setup.buildPermutations(['a', 'b', 'c'])
		const spellings = orderings.map((ordering) => ordering.join(''))

		expect(spellings.sort()).toEqual(['abc', 'acb', 'bac', 'bca', 'cab', 'cba'])
		// Counting the distinct spellings is a second mechanism: it disagrees with the list
		// whenever one ordering is repeated instead of built.
		expect(new Set(spellings).size).toBe(orderings.length)
	})

	it('builds one empty ordering for an empty list and never returns the caller list', () => {
		const list = ['only']
		const orderings = setup.buildPermutations(list)

		expect(setup.buildPermutations([])).toEqual([[]])
		expect(orderings).toEqual([['only']])
		expect(orderings[0]).not.toBe(list)
	})
})

describe('qualification fixtures', () => {
	it('exports every qualification definition builder its suites import', () => {
		expect([...FIXTURES.keys()].sort()).toEqual(
			[
				'buildCapExcessGatesDefinition',
				'buildConditionDefinition',
				'buildContinuingLogicalDefinition',
				'buildDottedFieldDefinition',
				'buildEvidenceSnapshotDefinition',
				'buildGatesDefinition',
				'buildReferralDefinition',
				'buildScopedWindDefinition',
			].sort(),
		)
	})

	it('points every ruling at a logical rule its own definition declares', () => {
		expect(setup.countFixtures(FIXTURES, setup.countRulings)).toBeGreaterThan(0)
		expect(
			setup.reportFixtures(FIXTURES, (name, builder) =>
				setup.inspectRulingTargets(setup.buildDefinition(name, builder)),
			),
		).toEqual(setup.buildCleanReport(FIXTURES))
	})

	it('reads a prior pass only after that pass is declared', () => {
		expect(setup.countFixtures(FIXTURES, setup.countQualificationReads)).toBeGreaterThan(0)
		expect(
			setup.reportFixtures(FIXTURES, (name, builder) =>
				setup.inspectPassReads(setup.buildDefinition(name, builder)),
			),
		).toEqual(setup.buildCleanReport(FIXTURES))
	})

	it('names a declared pass in every qualification message placeholder', () => {
		expect(setup.countFixtures(FIXTURES, setup.countQualificationPlaceholders)).toBeGreaterThan(0)
		expect(
			setup.reportFixtures(FIXTURES, (name, builder) =>
				setup.inspectPlaceholderTargets(setup.buildDefinition(name, builder)),
			),
		).toEqual(setup.buildCleanReport(FIXTURES))
	})

	it('returns an equal but unshared definition on every call', () => {
		expect(setup.reportFixtures(FIXTURES, setup.inspectFreshness)).toEqual(
			setup.buildCleanReport(FIXTURES),
		)
	})
})

describe('failing engine', () => {
	it('answers one shared failing result per subject reasoned', () => {
		const pass = requireValue(
			setup.buildGatesDefinition().passes[0],
			'the gates fixture declares a pass',
		)

		expect(setup.FAILING_RESULT).toEqual({
			reasoning: 'quantitative',
			value: 0,
			groups: [],
			count: 0,
			success: false,
			trace: ['engine trace'],
			errors: ['engine boom'],
		})
		expect(setup.reasonFailing({ id: 'subject' }, pass)).toBe(setup.FAILING_RESULT)
		expect(setup.reasonFailing([{ id: 'first' }, { id: 'second' }], pass)).toEqual([
			setup.FAILING_RESULT,
			setup.FAILING_RESULT,
		])
	})

	it('fails every pass with the same trace and error', () => {
		const engine = setup.createFailingEngine()
		const passes = setup.buildCapExcessGatesDefinition().passes
		const quantitative = requireValue(passes[0], 'the cap fixture declares a quantitative pass')
		const logical = requireValue(passes.at(-1), 'the cap fixture declares a logical pass')

		const derived = engine.reason({ id: 'subject' }, quantitative)
		expect(derived.success).toBe(false)
		expect(derived.trace).toEqual(['engine trace'])
		expect(derived.errors).toEqual(['engine boom'])
		// The failure is the engine's, not the definition's, so a logical pass fails identically.
		expect(engine.reason({ id: 'subject' }, logical)).toEqual(derived)

		const subjects = [{ id: 'first' }, { id: 'second' }, { id: 'third' }]
		const batch = engine.reason(subjects, quantitative)
		expect(batch.length).toBe(subjects.length)
		expect(batch.filter((result) => result.success)).toEqual([])

		engine.destroy()
		expect(engine.reason({ id: 'subject' }, quantitative)).toEqual(derived)
	})

	it('claims support and validity while holding no reasoner', () => {
		const engine = setup.createFailingEngine()
		const pass = requireValue(
			setup.buildGatesDefinition().passes[0],
			'the gates fixture declares a pass',
		)

		// A consumer that queries before reasoning is never diverted away from the failure.
		expect(engine.supports('logical')).toBe(true)
		expect(engine.supports('symbolic')).toBe(true)
		expect(engine.validate(pass)).toEqual({ valid: true, errors: [], warnings: [] })

		expect(engine.reasoners()).toEqual([])
		expect(engine.reasoner('quantitative')).toBeUndefined()
		engine.register(createQuantitativeReasoner())
		expect(engine.reasoners()).toEqual([])
		expect(engine.reasoner('quantitative')).toBeUndefined()
	})
})
