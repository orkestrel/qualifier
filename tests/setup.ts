import type { QualificationDefinition } from '@src/core'
import type {
	Definition,
	QuantitativeResult,
	ReasonEventMap,
	ReasonInterface,
	ReasonResult,
	Subject,
} from '@orkestrel/reason'
import { qualificationDefinition, rulingDefinition } from '@src/core'
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
	return qualificationDefinition('standard', 'Standard eligibility', [gates], {
		rulings: [
			rulingDefinition('license', 'gates', 'licensed', 'restriction', {
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
	return qualificationDefinition('referral', 'Referral program', [gates], {
		rulings: [
			rulingDefinition('flag-coastal', 'gates', 'coastal', 'referral', {
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
	return qualificationDefinition('property', 'Property eligibility', [cap, excess, gates], {
		rulings: [
			rulingDefinition('tiv', 'gates', 'tiv', 'restriction', {
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
	return qualificationDefinition('property', 'Property eligibility', [wind], {
		rulings: [
			rulingDefinition('coastal', 'wind', 'coastal', 'restriction', {
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
	return qualificationDefinition('property', 'Property eligibility', [gates], {
		rulings: [
			rulingDefinition('vacant', 'gates', 'vacant', 'condition', {
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
	return qualificationDefinition('snapshot', 'Snapshot', [p1, p2], {
		rulings: [
			rulingDefinition('r1-finding', 'p2', 'r1', 'condition'),
			rulingDefinition('r2-finding', 'p2', 'r2', 'condition'),
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
	return qualificationDefinition('continuing', 'Continuing', [gates, after], {
		rulings: [rulingDefinition('note', 'gates', 'flag', 'condition')],
	})
}

/** Build an injected reason engine whose every pass fails operationally with a fixed trace/error. */
export function createFailingEngine(): ReasonInterface {
	const failingResult: QuantitativeResult = {
		reasoning: 'quantitative',
		value: 0,
		groups: [],
		count: 0,
		success: false,
		trace: ['engine trace'],
		errors: ['engine boom'],
	}

	function reason(subjects: readonly Subject[], definition: Definition): readonly ReasonResult[]
	function reason(subject: Subject, definition: Definition): ReasonResult
	function reason(
		subject: Subject | readonly Subject[],
		_definition: Definition,
	): ReasonResult | readonly ReasonResult[] {
		if (Array.isArray(subject)) return subject.map(() => failingResult)
		return failingResult
	}

	return {
		emitter: new Emitter<ReasonEventMap>(),
		reason,
		register: () => {},
		reasoner: () => undefined,
		reasoners: () => [],
		supports: () => true,
		validate: () => ({ valid: true, errors: [], warnings: [] }),
		destroy: () => {},
	}
}
