import type { Eligibility, QualificationEffect } from './types.js'

/** Default definition validation policy for `createQualifier` / `Qualifier.qualify`. */
export const DEFAULT_QUALIFIER_VALIDATE = true

/** The reserved internal projection namespace a pass's working projection is written under. */
export const QUALIFICATION_KEY = 'qualification'

/** Eligibility severity order — most to least severe. */
export const ELIGIBILITY_PRECEDENCE: readonly Eligibility[] = Object.freeze([
	'ineligible',
	'referral',
	'eligible',
])

/** The eligibility impact of each {@link QualificationEffect}; `condition` remains eligible. */
export const EFFECT_ELIGIBILITIES: Readonly<Record<QualificationEffect, Eligibility>> =
	Object.freeze({
		restriction: 'ineligible',
		referral: 'referral',
		condition: 'eligible',
	})
