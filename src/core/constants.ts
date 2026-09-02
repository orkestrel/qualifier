import type { Eligibility, QualificationEffect } from './types.js'

/** Holds the default definition validation policy for `createQualifier` / `Qualifier.qualify`. */
export const DEFAULT_QUALIFIER_VALIDATE = true

/** Names the reserved internal projection namespace a pass's working projection is written under. */
export const QUALIFICATION_KEY = 'qualification'

/** Lists the eligibility severities in order — most to least severe. */
export const ELIGIBILITY_PRECEDENCE: readonly Eligibility[] = Object.freeze([
	'ineligible',
	'referral',
	'eligible',
])

/** Maps each {@link QualificationEffect} to its eligibility impact; `condition` remains eligible. */
export const EFFECT_ELIGIBILITIES: Readonly<Record<QualificationEffect, Eligibility>> =
	Object.freeze({
		restriction: 'ineligible',
		referral: 'referral',
		condition: 'eligible',
	})
