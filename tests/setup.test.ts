// The `setup` project's proof of `tests/setup.ts` — the exported test infrastructure this
// workspace's suites are built on, asserted on its own terms. What the guards and the qualifier
// do WITH these fixtures belongs to `tests/src/core/validators.test.ts` and
// `tests/src/core/Qualifier.test.ts`; nothing here re-proves that production behavior.
//
// `tests/setup.ts` is host-independent, so every contract it exports is reachable from the
// `setup` project's Node environment with the browser disabled.

import type { FieldPath } from '@orkestrel/contract'
import type { QualificationDefinition, QualificationPass } from '@src/core'
import { describe, expect, it } from 'vitest'
import { isQualificationDefinition, QUALIFICATION_KEY } from '@src/core'
import { createQuantitativeReasoner, extractAtoms, isLogicalDefinition } from '@orkestrel/reason'
import { requireValue } from '@orkestrel/test'
import * as setup from './setup.js'

/** One `{{path}}` interpolation placeholder in a ruling message. */
const PLACEHOLDER = /\{\{([^{}]+)\}\}/g

/** The nesting depth `tests/src/core/validators.test.ts` drives the guards with. */
const GUARD_DEPTH = 200

/** Whether a value is a record this proof can walk. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null
}

/** Whether an export takes no argument, so this proof can call it and classify what it returns. */
function isBuilder(value: unknown): value is () => unknown {
	return typeof value === 'function' && value.length === 0
}

/** Every export of `tests/setup.ts` that builds a qualification definition, keyed by its name. */
function collectDefinitionBuilders(): ReadonlyMap<string, () => unknown> {
	const builders = new Map<string, () => unknown>()
	for (const [name, value] of Object.entries(setup)) {
		if (!isBuilder(value)) continue
		if (isQualificationDefinition(value())) builders.set(name, value)
	}
	return builders
}

/** Call a collected builder and refuse anything that stopped being a qualification definition. */
function buildDefinition(name: string, builder: () => unknown): QualificationDefinition {
	const built = builder()
	if (!isQualificationDefinition(built)) {
		throw new Error(`${name} no longer builds a qualification definition`)
	}
	return built
}

/** Walk a record's `nested` links and return each level from the record down to its leaf. */
function collectNesting(record: Readonly<Record<string, unknown>>): readonly unknown[] {
	const levels: unknown[] = [record]
	let current: unknown = record
	while (isRecord(current) && 'nested' in current) {
		current = current.nested
		levels.push(current)
	}
	return levels
}

/** Every field path a pass reads, from its atoms' checks and its factors' field sources. */
function collectPassFields(pass: QualificationPass): readonly FieldPath[] {
	if (isLogicalDefinition(pass)) {
		return pass.rules.flatMap((entry) =>
			[...entry.premises, entry.conclusion].flatMap((expression) =>
				extractAtoms(expression).map((leaf) => leaf.check.field),
			),
		)
	}
	return pass.groups.flatMap((group) =>
		group.factors.flatMap((factor) =>
			factor.source.origin === 'field' ? [factor.source.field] : [],
		),
	)
}

/** Every path a definition's ruling messages interpolate. */
function collectPlaceholders(definition: QualificationDefinition): readonly string[] {
	const paths: string[] = []
	for (const ruling of definition.rulings ?? []) {
		for (const match of (ruling.message ?? '').matchAll(PLACEHOLDER)) {
			const path = match[1]
			if (path !== undefined) paths.push(path)
		}
	}
	return paths
}

/** Report each ruling naming a logical rule its own definition does not declare. */
function inspectRulingTargets(definition: QualificationDefinition): readonly string[] {
	const problems: string[] = []
	for (const ruling of definition.rulings ?? []) {
		const pass = definition.passes.find((candidate) => candidate.id === ruling.pass)
		if (pass === undefined) {
			problems.push(`ruling ${ruling.id} names absent pass ${ruling.pass}`)
			continue
		}
		if (!isLogicalDefinition(pass)) {
			problems.push(`ruling ${ruling.id} names quantitative pass ${ruling.pass}`)
			continue
		}
		if (!pass.rules.some((entry) => entry.id === ruling.rule)) {
			problems.push(`ruling ${ruling.id} names absent rule ${ruling.rule} in pass ${ruling.pass}`)
		}
	}
	return problems
}

/** Report each qualification-namespace read naming a pass the definition declares no earlier. */
function inspectPassReads(definition: QualificationDefinition): readonly string[] {
	const problems: string[] = []
	definition.passes.forEach((pass, index) => {
		const earlier = definition.passes.slice(0, index).map((entry) => entry.id)
		for (const field of collectPassFields(pass)) {
			if (typeof field === 'string' || field[0] !== QUALIFICATION_KEY) continue
			const target = field[1]
			if (target === undefined) {
				problems.push(`pass ${pass.id} reads the bare qualification namespace`)
				continue
			}
			if (target === pass.id || earlier.includes(target)) continue
			problems.push(`pass ${pass.id} reads pass ${target} before it is declared`)
		}
	})
	return problems
}

/** Report each qualification-rooted message placeholder naming a pass the definition lacks. */
function inspectPlaceholderTargets(definition: QualificationDefinition): readonly string[] {
	const declared = definition.passes.map((pass) => pass.id)
	const problems: string[] = []
	for (const path of collectPlaceholders(definition)) {
		const [head, target] = path.split('.')
		if (head !== QUALIFICATION_KEY) continue
		if (target === undefined || !declared.includes(target)) {
			problems.push(`placeholder ${path} names no declared pass`)
		}
	}
	return problems
}

/** Report each way one builder failed to return an equal but unshared definition per call. */
function inspectFreshness(name: string, builder: () => unknown): readonly string[] {
	const first = buildDefinition(name, builder)
	const second = buildDefinition(name, builder)
	const problems: string[] = []
	if (first === second) problems.push('returns one shared definition to every caller')
	if (first.passes === second.passes)
		problems.push('returns one shared passes array to every caller')
	// Serializing compares the values without vitest's own structural walk.
	if (JSON.stringify(first) !== JSON.stringify(second))
		problems.push('builds a differing definition')
	return problems
}

/** Count the qualification-namespace field reads a definition's passes make. */
function countQualificationReads(definition: QualificationDefinition): number {
	let reads = 0
	for (const pass of definition.passes) {
		for (const field of collectPassFields(pass)) {
			if (typeof field !== 'string' && field[0] === QUALIFICATION_KEY) reads += 1
		}
	}
	return reads
}

/** Count the qualification-rooted placeholders a definition's ruling messages interpolate. */
function countQualificationPlaceholders(definition: QualificationDefinition): number {
	return collectPlaceholders(definition).filter((path) => path.startsWith(`${QUALIFICATION_KEY}.`))
		.length
}

/** Count the rulings a definition authors. */
function countRulings(definition: QualificationDefinition): number {
	return (definition.rulings ?? []).length
}

const FIXTURES = collectDefinitionBuilders()

/** Run one inspection over every collected fixture, keyed by builder name so a failure names it. */
function reportFixtures(
	inspect: (name: string, builder: () => unknown) => readonly string[],
): Readonly<Record<string, readonly string[]>> {
	const report: Record<string, readonly string[]> = {}
	for (const [name, builder] of FIXTURES) report[name] = inspect(name, builder)
	return report
}

/** The clean report every fixture inspection must produce. */
function buildCleanReport(): Readonly<Record<string, readonly string[]>> {
	const clean: Record<string, readonly string[]> = {}
	for (const name of FIXTURES.keys()) clean[name] = []
	return clean
}

/** Total one count over every collected fixture, so an empty population reddens its case. */
function countFixtures(count: (definition: QualificationDefinition) => number): number {
	let total = 0
	for (const [name, builder] of FIXTURES) total += count(buildDefinition(name, builder))
	return total
}

describe('adversarial records', () => {
	it('closes a cycle a structural walk meets', () => {
		const record = setup.buildCyclicRecord()

		expect(record.id).toBe('cycle')
		expect(record.self).toBe(record)
		// `JSON.stringify` finds the cycle by a mechanism the builder does not share.
		expect(() => JSON.stringify(record)).toThrow(TypeError)
	})

	it('nests one level per requested depth above a leaf', () => {
		const deep = setup.buildDeepRecord(GUARD_DEPTH)
		const levels = collectNesting(deep)

		expect(levels.length - 1).toBe(GUARD_DEPTH)
		expect(levels.at(-1)).toEqual({ value: 'leaf' })
		// The serialized form counts the same links without descending them.
		expect(JSON.stringify(deep).split('"nested"').length - 1).toBe(GUARD_DEPTH)
	})

	it('returns the bare leaf at zero depth', () => {
		const shallow = setup.buildDeepRecord(0)

		expect(collectNesting(shallow).length - 1).toBe(0)
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

describe('qualification fixtures', () => {
	it('exports a qualification definition builder', () => {
		expect(FIXTURES.size).toBeGreaterThan(0)
	})

	it('points every ruling at a logical rule its own definition declares', () => {
		expect(countFixtures(countRulings)).toBeGreaterThan(0)
		expect(
			reportFixtures((name, builder) => inspectRulingTargets(buildDefinition(name, builder))),
		).toEqual(buildCleanReport())
	})

	it('reads a prior pass only after that pass is declared', () => {
		expect(countFixtures(countQualificationReads)).toBeGreaterThan(0)
		expect(
			reportFixtures((name, builder) => inspectPassReads(buildDefinition(name, builder))),
		).toEqual(buildCleanReport())
	})

	it('names a declared pass in every qualification message placeholder', () => {
		expect(countFixtures(countQualificationPlaceholders)).toBeGreaterThan(0)
		expect(
			reportFixtures((name, builder) => inspectPlaceholderTargets(buildDefinition(name, builder))),
		).toEqual(buildCleanReport())
	})

	it('returns an equal but unshared definition on every call', () => {
		expect(FIXTURES.size).toBeGreaterThan(0)
		expect(reportFixtures(inspectFreshness)).toEqual(buildCleanReport())
	})
})

describe('failing engine', () => {
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
