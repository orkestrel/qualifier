import type { QualificationDefinition } from '@src/core'
import { qualificationDefinition, rulingDefinition } from '@src/core'
import {
	atom,
	factorGroup,
	fieldFactor,
	logicalDefinition,
	quantitativeDefinition,
	rule,
	staticFactor,
	transform,
} from '@orkestrel/reason'

/** A recorder that captures callback invocations without mocking behavior. */
export interface TestRecorderInterface<TArgs extends readonly unknown[]> {
	readonly calls: readonly TArgs[]
	readonly count: number
	readonly handler: (...args: TArgs) => void
	clear(): void
}

/**
 * Create a test recorder — a real callback that records every invocation.
 *
 * @returns A recorder with `handler`, `calls`, `count`, and `clear`
 */
export function createRecorder<TArgs extends readonly unknown[]>(): TestRecorderInterface<TArgs> {
	const calls: TArgs[] = []
	return {
		get calls() {
			return calls
		},
		get count() {
			return calls.length
		},
		handler: (...args: TArgs) => {
			calls.push(args)
		},
		clear() {
			calls.length = 0
		},
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

/** Build a null-prototype record carrying hostile keys for guard tests. */
export function buildHostileRecord(): Record<string, unknown> {
	return Object.assign(Object.create(null), {
		id: 'hostile',
		__proto__: { polluted: true },
	})
}

/** Licensed-gate logical pass with an unscoped restriction ruling. */
export function buildGatesDefinition(): QualificationDefinition {
	const gates = logicalDefinition('gates', 'Eligibility gates', [
		rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
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
	const gates = logicalDefinition('gates', 'Coastal gates', [
		rule('coastal', [atom('coastal', 'equals', true)], atom('flagged', 'equals', true)),
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
	const cap = quantitativeDefinition('cap', 'TIV cap', [
		factorGroup('limit', 'sum', [staticFactor('base', 1_010_000)]),
	])
	const excess = quantitativeDefinition('excess', 'TIV excess', [
		factorGroup('excess', 'sum', [
			fieldFactor('total', 'total'),
			fieldFactor('cap', ['qualification', 'cap'], {
				transforms: [transform('multiply', -1)],
			}),
		]),
	])
	const gates = logicalDefinition('gates', 'Eligibility gates', [
		rule('tiv', [atom(['qualification', 'excess'], 'above', 0)], atom('blocked', 'equals', true)),
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
	const wind = logicalDefinition('wind', 'Wind eligibility', [
		rule('coastal', [atom('distance', 'to', 2)], atom('blocked', 'equals', true)),
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

/** Scoped condition ruling that keeps the scope rateable. */
export function buildConditionDefinition(): QualificationDefinition {
	const gates = logicalDefinition('gates', 'Eligibility gates', [
		rule('vacant', [atom('vacant', 'equals', true)], atom('noted', 'equals', true)),
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
	const p1 = quantitativeDefinition('p1', 'Pass 1', [
		factorGroup('value', 'sum', [staticFactor('base', 42)]),
	])
	const p2 = logicalDefinition('p2', 'Pass 2', [
		rule('r1', [atom(['qualification', 'p1'], 'equals', 42)], atom('ready', 'equals', true)),
		rule(
			'r2',
			[atom(['qualification', 'p2', 'ready'], 'equals', true)],
			atom('blocked', 'equals', true),
		),
	])
	return qualificationDefinition('snapshot', 'Snapshot', [p1, p2], {
		rulings: [
			rulingDefinition('r1-finding', 'p2', 'r1', 'condition'),
			rulingDefinition('r2-finding', 'p2', 'r2', 'condition'),
		],
	})
}
