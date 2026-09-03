import type { Finding, QualificationDefinition } from '@src/core'
import type {
	Definition,
	QuantitativeResult,
	ReasonEventMap,
	ReasonInterface,
	ReasonResult,
	Subject,
} from '@orkestrel/reason'
import { createQualificationDefinition, createRuling } from '@src/core'
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
} from '@orkestrel/reason'

/** Build every ordering of a list, so a case can drive an order-independent helper with each. */
export function buildPermutations<T>(list: readonly T[]): readonly T[][] {
	if (list.length <= 1) return [[...list]]
	const output: T[][] = []
	for (let index = 0; index < list.length; index += 1) {
		const head = list[index]
		if (head === undefined) continue
		const rest = [...list.slice(0, index), ...list.slice(index + 1)]
		for (const tail of buildPermutations(rest)) output.push([head, ...tail])
	}
	return output
}

/** Build one `Finding` from the members a case cares about, defaulting the rest. */
export function buildFinding(
	overrides: Partial<Finding> & Pick<Finding, 'id' | 'pass' | 'rule' | 'effect' | 'applied'>,
): Finding {
	return {
		premises: [],
		...overrides,
	}
}

/** Build a cyclic record for adversarial guard tests. */
export function buildCyclicRecord(): Record<string, unknown> {
	const record: Record<string, unknown> = { id: 'cycle' }
	record.self = record
	return record
}

/** Build a deeply nested record for adversarial guard tests. */
export function buildDeepRecord(depth: number): Record<string, unknown> {
	let current: Record<string, unknown> = { value: 'leaf' }
	for (let index = 0; index < depth; index += 1) {
		current = { nested: current }
	}
	return current
}

/** Build a null-prototype record carrying an own `__proto__` key for guard tests. */
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

/** Licensed-gate logical pass with an unscoped restriction ruling. */
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

/** Coastal referral ruling with seat-count message interpolation. */
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

/** Quantitative cap and excess passes followed by a logical TIV gate. */
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

/** Scoped wind restriction leaving global eligibility eligible. */
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

/** Scoped condition ruling that keeps the scope eligible. */
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

/** Multi-pass definition proving evidence snapshots for cross-pass and same-pass premises. */
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

/** Logical `gates` pass with a continuing condition ruling, followed by a quantitative `after` pass. */
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

/** Logical `gates` pass whose rule reads the dotted string key `qualification.cap`. */
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

/** The operational failure every pass of the failing engine reports. */
export const FAILING_RESULT: QuantitativeResult = {
	reasoning: 'quantitative',
	value: 0,
	groups: [],
	count: 0,
	success: false,
	trace: ['engine trace'],
	errors: ['engine boom'],
}

/** Answer every subject with {@link FAILING_RESULT}, one result per subject reasoned. */
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

/** Build an injected reason engine whose every pass fails operationally with a fixed trace/error. */
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
