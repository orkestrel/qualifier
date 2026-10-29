import type { FieldPath } from '@orkestrel/contract'
import type { Finding, QualificationDefinition, QualificationPass } from '@src/core'
import type {
	Definition,
	QuantitativeResult,
	ReasonEventMap,
	ReasonInterface,
	ReasonResult,
	Subject,
} from '@orkestrel/reason'
import {
	createQualificationDefinition,
	createRuling,
	isQualificationDefinition,
	QUALIFICATION_KEY,
} from '@src/core'
import { isObject } from '@orkestrel/contract'
import { Emitter } from '@orkestrel/emitter'
import {
	createAtom,
	createFactorGroup,
	createFieldFactor,
	createLogicalDefinition,
	createQuantitativeDefinition,
	createRule,
	createStaticFactor,
	createTransform,
	extractAtoms,
	isLogicalDefinition,
} from '@orkestrel/reason'

/** Builds every ordering of a list, so a case can drive an order-independent helper with each. */
export function buildPermutations<T>(list: readonly T[]): readonly T[][] {
	if (list.length <= 1) return [[...list]]
	return Array.from({ length: list.length }, (_, index) => index).flatMap((index) => {
		const head = list[index]
		if (head === undefined) return []
		const rest = [...list.slice(0, index), ...list.slice(index + 1)]
		return buildPermutations(rest).map((tail) => [head, ...tail])
	})
}

/** Builds one `Finding` from the members a case cares about, defaulting the rest. */
export function buildFinding(
	overrides: Partial<Finding> & Pick<Finding, 'id' | 'pass' | 'rule' | 'effect' | 'applied'>,
): Finding {
	return {
		premises: [],
		...overrides,
	}
}

/** Builds a cyclic record for adversarial guard tests. */
export function buildCyclicRecord(): Record<string, unknown> {
	const record: Record<string, unknown> = { id: 'cycle' }
	record.self = record
	return record
}

/** Builds a deeply nested record for adversarial guard tests. */
export function buildDeepRecord(depth: number): Record<string, unknown> {
	return Array.from({ length: Math.max(0, Math.ceil(depth)) }).reduce<Record<string, unknown>>(
		(current) => ({ nested: current }),
		{ value: 'leaf' },
	)
}

/** Builds a null-prototype record carrying an own `__proto__` key for guard tests. */
export function buildHostileRecord(): Record<string, unknown> {
	const record: Record<string, unknown> = Object.assign(Object.create(null), { id: 'hostile' })
	// An object-literal `__proto__:` key sets the prototype instead of creating an own key, so this
	// record needs `defineProperty` to carry a genuine own `__proto__` entry.
	Object.defineProperty(record, '__proto__', {
		value: { polluted: true },
		enumerable: true,
		writable: true,
		configurable: true,
	})
	return record
}

/** Builds a licensed-gate logical pass with an unscoped restriction ruling. */
export function buildGatesDefinition(): QualificationDefinition {
	const gates = createLogicalDefinition('gates', 'Eligibility gates', [
		createRule(
			'licensed',
			[createAtom('licensed', 'equals', false)],
			createAtom('blocked', 'equals', true),
		),
	])
	return createQualificationDefinition('standard', 'Standard eligibility', [gates], {
		rulings: [
			createRuling('license', 'gates', 'licensed', 'restriction', {
				message: 'A license is required',
			}),
		],
	})
}

/** Builds a coastal referral ruling with seat-count message interpolation. */
export function buildReferralDefinition(): QualificationDefinition {
	const gates = createLogicalDefinition('gates', 'Coastal gates', [
		createRule(
			'coastal',
			[createAtom('coastal', 'equals', true)],
			createAtom('flagged', 'equals', true),
		),
	])
	return createQualificationDefinition('referral', 'Referral program', [gates], {
		rulings: [
			createRuling('flag-coastal', 'gates', 'coastal', 'referral', {
				message: 'Coastal surcharge on {{seats}} seats',
			}),
		],
	})
}

/** Builds quantitative cap and excess passes followed by a logical TIV gate. */
export function buildCapExcessGatesDefinition(): QualificationDefinition {
	const cap = createQuantitativeDefinition('cap', 'TIV cap', [
		createFactorGroup('limit', 'sum', [createStaticFactor('base', 1_010_000)]),
	])
	const excess = createQuantitativeDefinition('excess', 'TIV excess', [
		createFactorGroup('excess', 'sum', [
			createFieldFactor('total', 'total'),
			createFieldFactor('cap', ['qualification', 'cap'], {
				transforms: [createTransform('multiply', -1)],
			}),
		]),
	])
	const gates = createLogicalDefinition('gates', 'Eligibility gates', [
		createRule(
			'tiv',
			[createAtom(['qualification', 'excess'], 'above', 0)],
			createAtom('blocked', 'equals', true),
		),
	])
	return createQualificationDefinition('property', 'Property eligibility', [cap, excess, gates], {
		rulings: [
			createRuling('tiv', 'gates', 'tiv', 'restriction', {
				message: 'Cap is {{qualification.cap}}',
			}),
		],
	})
}

/** Builds a scoped wind restriction leaving global eligibility eligible. */
export function buildScopedWindDefinition(): QualificationDefinition {
	const wind = createLogicalDefinition('wind', 'Wind eligibility', [
		createRule('coastal', [createAtom('distance', 'to', 2)], createAtom('blocked', 'equals', true)),
	])
	return createQualificationDefinition('property', 'Property eligibility', [wind], {
		rulings: [
			createRuling('coastal', 'wind', 'coastal', 'restriction', {
				scope: 'wind',
				message: 'Wind coverage is unavailable within two miles of saltwater',
			}),
		],
	})
}

/** Builds a scoped condition ruling that keeps the scope eligible. */
export function buildConditionDefinition(): QualificationDefinition {
	const gates = createLogicalDefinition('gates', 'Eligibility gates', [
		createRule(
			'vacant',
			[createAtom('vacant', 'equals', true)],
			createAtom('noted', 'equals', true),
		),
	])
	return createQualificationDefinition('property', 'Property eligibility', [gates], {
		rulings: [
			createRuling('vacant', 'gates', 'vacant', 'condition', {
				scope: 'exWind',
				message: 'Vacancy terms apply',
			}),
		],
	})
}

/** Builds a multi-pass definition proving evidence snapshots for cross-pass and same-pass premises. */
export function buildEvidenceSnapshotDefinition(): QualificationDefinition {
	const p1 = createQuantitativeDefinition('p1', 'Pass 1', [
		createFactorGroup('value', 'sum', [createStaticFactor('base', 42)]),
	])
	const p2 = createLogicalDefinition('p2', 'Pass 2', [
		createRule(
			'r1',
			[createAtom(['qualification', 'p1'], 'equals', 42)],
			createAtom('ready', 'equals', true),
		),
		createRule(
			'r2',
			[createAtom(['qualification', 'p2', 'ready'], 'equals', true)],
			createAtom('blocked', 'equals', true),
		),
	])
	return createQualificationDefinition('snapshot', 'Snapshot', [p1, p2], {
		rulings: [
			createRuling('r1-finding', 'p2', 'r1', 'condition'),
			createRuling('r2-finding', 'p2', 'r2', 'condition'),
		],
	})
}

/** Builds a logical `gates` pass with a continuing condition ruling, followed by a quantitative `after` pass. */
export function buildContinuingLogicalDefinition(): QualificationDefinition {
	const gates = createLogicalDefinition('gates', 'Gates', [
		createRule('flag', [createAtom('flag', 'equals', true)], createAtom('noted', 'equals', true)),
	])
	const after = createQuantitativeDefinition('after', 'After', [
		createFactorGroup('total', 'sum', [createStaticFactor('base', 1)]),
	])
	return createQualificationDefinition('continuing', 'Continuing', [gates, after], {
		rulings: [createRuling('note', 'gates', 'flag', 'condition')],
	})
}

/** Builds a logical `gates` pass whose rule reads the dotted string key `qualification.cap`. */
export function buildDottedFieldDefinition(): QualificationDefinition {
	const cap = createQuantitativeDefinition('cap', 'Cap', [
		createFactorGroup('limit', 'sum', [createFieldFactor('total', 'total')]),
	])
	const gates = createLogicalDefinition('gates', 'Gates', [
		createRule(
			'cap-check',
			[createAtom('qualification.cap', 'above', 50)],
			createAtom('blocked', 'equals', true),
		),
	])
	return createQualificationDefinition('property', 'Property', [cap, gates])
}

/** Represents the operational failure every pass of the failing engine reports. */
export const FAILING_RESULT: QuantitativeResult = {
	reasoning: 'quantitative',
	value: 0,
	groups: [],
	count: 0,
	success: false,
	trace: ['engine trace'],
	errors: ['engine boom'],
}

/** Answers every subject with {@link FAILING_RESULT}, one result per subject reasoned. */
export function reasonFailing(
	subjects: readonly Subject[],
	definition: Definition,
): readonly ReasonResult[]
export function reasonFailing(subject: Subject, definition: Definition): ReasonResult
export function reasonFailing(
	subject: Subject | readonly Subject[],
	_definition: Definition,
): ReasonResult | readonly ReasonResult[] {
	if (Array.isArray(subject)) return subject.map(() => FAILING_RESULT)
	return FAILING_RESULT
}

/** Builds an injected reason engine whose every pass fails operationally with a fixed trace/error. */
export function createFailingEngine(): ReasonInterface {
	return {
		emitter: new Emitter<ReasonEventMap>(),
		reason: reasonFailing,
		register: () => {},
		reasoner: () => undefined,
		reasoners: () => [],
		supports: () => true,
		validate: () => ({ valid: true, errors: [], warnings: [] }),
		destroy: () => {},
	}
}

/** Matches one `{{path}}` interpolation placeholder in a ruling message. */
export const PLACEHOLDER = /\{\{([^{}]+)\}\}/g

/** Defines the nesting depth `tests/src/core/validators.test.ts` drives the guards with. */
export const GUARD_DEPTH = 200

/** Checks whether an export takes no argument, so this proof can call it and classify what it returns. */
export function isBuilder(value: unknown): value is () => unknown {
	return typeof value === 'function' && value.length === 0
}

/** Collects every export of `tests/setup.ts` that builds a qualification definition, keyed by its name. */
export function collectDefinitionBuilders(
	exports: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, () => unknown> {
	const builders = new Map<string, () => unknown>()
	for (const [name, value] of Object.entries(exports)) {
		if (!isBuilder(value)) continue
		if (isQualificationDefinition(value())) builders.set(name, value)
	}
	return builders
}

/** Calls a collected builder and refuse anything that stopped being a qualification definition. */
export function buildDefinition(name: string, builder: () => unknown): QualificationDefinition {
	const built = builder()
	if (!isQualificationDefinition(built)) {
		throw new Error(`${name} no longer builds a qualification definition`)
	}
	return built
}

/** Walks a record's `nested` links and return each level from the record down to its leaf. */
export function collectNesting(record: unknown): readonly unknown[] {
	return isObject(record) && 'nested' in record
		? [record, ...collectNesting(record.nested)]
		: [record]
}

/** Collects every field path a pass reads, from its atoms' checks and its factors' field sources. */
export function collectPassFields(pass: QualificationPass): readonly FieldPath[] {
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

/** Collects every path a definition's ruling messages interpolate. */
export function collectPlaceholders(definition: QualificationDefinition): readonly string[] {
	const paths: string[] = []
	for (const ruling of definition.rulings ?? []) {
		for (const match of (ruling.message ?? '').matchAll(PLACEHOLDER)) {
			const path = match[1]
			if (path !== undefined) paths.push(path)
		}
	}
	return paths
}

/** Reports each ruling naming a logical rule its own definition does not declare. */
export function inspectRulingTargets(definition: QualificationDefinition): readonly string[] {
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

/** Reports each qualification-namespace read naming a pass the definition declares no earlier. */
export function inspectPassReads(definition: QualificationDefinition): readonly string[] {
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

/** Reports each qualification-rooted message placeholder naming a pass the definition lacks. */
export function inspectPlaceholderTargets(definition: QualificationDefinition): readonly string[] {
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

/** Reports each way one builder failed to return an equal but unshared definition per call. */
export function inspectFreshness(name: string, builder: () => unknown): readonly string[] {
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

/** Counts the qualification-namespace field reads a definition's passes make. */
export function countQualificationReads(definition: QualificationDefinition): number {
	return Iterator.from(definition.passes).reduce(
		(total, pass) =>
			total +
			collectPassFields(pass).filter(
				(field) => typeof field !== 'string' && field[0] === QUALIFICATION_KEY,
			).length,
		0,
	)
}

/** Counts the qualification-rooted placeholders a definition's ruling messages interpolate. */
export function countQualificationPlaceholders(definition: QualificationDefinition): number {
	return collectPlaceholders(definition).filter((path) => path.startsWith(`${QUALIFICATION_KEY}.`))
		.length
}

/** Counts the rulings a definition authors. */
export function countRulings(definition: QualificationDefinition): number {
	return (definition.rulings ?? []).length
}

/** Runs one inspection over every collected fixture, keyed by builder name so a failure names it. */
export function reportFixtures(
	fixtures: ReadonlyMap<string, () => unknown>,
	inspect: (name: string, builder: () => unknown) => readonly string[],
): Readonly<Record<string, readonly string[]>> {
	const report: Record<string, readonly string[]> = {}
	for (const [name, builder] of fixtures) report[name] = inspect(name, builder)
	return report
}

/** Builds the clean report every fixture inspection must produce. */
export function buildCleanReport(
	fixtures: ReadonlyMap<string, () => unknown>,
): Readonly<Record<string, readonly string[]>> {
	const clean: Record<string, readonly string[]> = {}
	for (const name of fixtures.keys()) clean[name] = []
	return clean
}

/** Totals one count over every collected fixture, so an empty population reddens its case. */
export function countFixtures(
	fixtures: ReadonlyMap<string, () => unknown>,
	count: (definition: QualificationDefinition) => number,
): number {
	return Iterator.from(fixtures).reduce(
		(total, [name, builder]) => total + count(buildDefinition(name, builder)),
		0,
	)
}

/** Lists keys excluded from qualification results. */
export const FORBIDDEN_RESULT_KEYS: readonly string[] = [
	'amount',
	'authority',
	'aggregate',
	'outcome',
	'worksheet',
	'total',
	'notice',
	'status',
	'decision',
]

/** Visits every result key with the caller's absence assertion. */
export function expectNoForbiddenKeys(
	value: unknown,
	assert: (actual: boolean, message: string) => void,
	path = 'result',
): void {
	if (value === null || typeof value !== 'object') return
	for (const key of FORBIDDEN_RESULT_KEYS) {
		assert(Object.hasOwn(value, key), `${path}.${key}`)
	}
	if (Array.isArray(value)) {
		for (const [index, entry] of value.entries()) {
			expectNoForbiddenKeys(entry, assert, `${path}[${index}]`)
		}
		return
	}
	for (const [key, entry] of Object.entries(value)) {
		expectNoForbiddenKeys(entry, assert, `${path}.${key}`)
	}
}

/** Checks whether a field names the expected path. */
export function matchesFieldPath(
	field: string | readonly string[] | undefined,
	expected: readonly string[],
): boolean {
	if (field === undefined) return false
	if (Array.isArray(field)) {
		return (
			field.length === expected.length && field.every((part, index) => part === expected[index])
		)
	}
	return field === expected.join('.')
}
