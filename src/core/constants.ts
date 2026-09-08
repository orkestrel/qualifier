import type { Eligibility, QualificationEffect } from './types.js'

/**
 * Holds the default definition validation policy for `createQualifier` and
 * `Qualifier.qualify`, `true`.
 */
export const DEFAULT_QUALIFIER_VALIDATE = true

/**
 * Names `'qualification'`, the reserved internal projection namespace a pass's working
 * projection is written under.
 */
export const QUALIFICATION_KEY = 'qualification'

/** Lists the eligibility severities most to least severe: `ineligible`, `referral`, `eligible`. */
export const ELIGIBILITY_PRECEDENCE: readonly Eligibility[] = Object.freeze([
	'ineligible',
	'referral',
	'eligible',
])

/**
 * Maps each {@link QualificationEffect} to its eligibility impact — `restriction` to
 * `ineligible`, `referral` to `referral`, and `condition` to `eligible`.
 */
export const EFFECT_ELIGIBILITIES: Readonly<Record<QualificationEffect, Eligibility>> =
	Object.freeze({
		restriction: 'ineligible',
		referral: 'referral',
		condition: 'eligible',
	})
