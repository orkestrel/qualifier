import type {
	Derivation,
	Eligibility,
	Finding,
	Premise,
	QualificationContext,
	QualificationDefinition,
	QualificationPass,
	QualificationProjection,
	Ruling,
} from './types.js'
import type {
	Check,
	CheckResult,
	EvaluatorInterface,
	LogicalDefinition,
	LogicalResult,
	QuantitativeResult,
	ReasonResult,
	Rule,
	Subject,
} from '@orkestrel/reason'
import { EFFECT_ELIGIBILITIES, ELIGIBILITY_PRECEDENCE, QUALIFICATION_KEY } from './constants.js'
import { QualifierError } from './errors.js'
import { isFiniteNumber, isRecord, resolveField } from '@orkestrel/contract'
import { extractAtoms, extractConclusions, formatField, isBounds } from '@orkestrel/reason'

/**
 * Interpolate `{{dotted.path}}` tokens in a message template against a subject.
 *
 * @remarks
 * Each token is split on `.` into a `FieldPath` array and resolved with
 * `resolveField` (a plain string field is ONE key, never dot-split — the split
 * here is the token-to-path bridge). A finite number renders with `en-US`
 * thousand grouping (`5010` → `5,010`); any other resolved value String-coerces.
 * An UNRESOLVED path renders as the empty string.
 *
 * @param template - The message template carrying `{{dotted.path}}` tokens
 * @param subject - The record tokens resolve against
 * @returns The template with every token replaced
 *
 * @example
 * ```ts
 * import { interpolateMessage } from '@orkestrel/qualifier'
 *
 * interpolateMessage('Limit is {{limit}}', { limit: 5010 }) // 'Limit is 5,010'
 * interpolateMessage('Missing {{gone}}', {})                // 'Missing '
 * ```
 */
export function interpolateMessage(
	template: string,
	subject: Readonly<Record<string, unknown>>,
): string {
	return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, path: string) => {
		const value = resolveField(subject, path.split('.'))
		if (value === undefined) return ''
		if (isFiniteNumber(value)) return value.toLocaleString('en-US')
		return String(value)
	})
}

/**
 * Describe a {@link Premise} comparison as a display-neutral verb phrase.
 *
 * @param comparison - The comparison to describe
 * @returns A display-neutral phrase
 *
 * @example
 * ```ts
 * import { describeComparison } from '@orkestrel/qualifier'
 *
 * describeComparison('above') // 'is more than'
 * ```
 */
export function describeComparison(comparison: NonNullable<Premise['comparison']>): string {
	switch (comparison) {
		case 'equals':
			return 'is'
		case 'not':
			return 'is not'
		case 'above':
			return 'is more than'
		case 'below':
			return 'is less than'
		case 'from':
			return 'is at least'
		case 'to':
			return 'is at most'
		case 'any':
			return 'is any of'
		case 'none':
			return 'is none of'
		case 'between':
			return 'is between'
		case 'outside':
			return 'is outside'
	}
}

/**
 * Render a structured or scalar expected value display-neutrally.
 *
 * @remarks
 * An array renders as its elements, each `String`-coerced, joined with `', '`.
 * A reason `Bounds`-shaped record (the `between` / `outside` expected value)
 * renders its present sides joined with the word `and`; an absent side is
 * omitted. A finite number and everything else fall back to plain `String()` —
 * a finite number is NOT grouped here (grouping is {@link interpolateMessage}'s
 * message-token-only behavior).
 *
 * @param value - The value to render
 * @returns A display-neutral rendering
 *
 * @example
 * ```ts
 * import { describeValue } from '@orkestrel/qualifier'
 *
 * describeValue([18, 25, 40]) // '18, 25, 40'
 * describeValue({ minimum: 18, maximum: 65 }) // '18 and 65'
 * describeValue(42) // '42'
 * ```
 */
export function describeValue(value: unknown): string {
	if (Array.isArray(value)) return value.map((entry) => String(entry)).join(', ')
	if (isBounds(value)) {
		const sides: string[] = []
		if (value.minimum !== undefined) sides.push(String(value.minimum))
		if (value.maximum !== undefined) sides.push(String(value.maximum))
		return sides.join(' and ')
	}
	return String(value)
}

/**
 * Render one {@link Premise} into a display-neutral sentence.
 *
 * @param entry - The premise to render
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A display-neutral sentence
 *
 * @example
 * ```ts
 * import { describePremise } from '@orkestrel/qualifier'
 *
 * describePremise({ field: 'age', comparison: 'above', expected: 18, actual: 25, met: true })
 * // 'age is more than 18 → met'
 * ```
 */
export function describePremise(entry: Premise, labels?: Readonly<Record<string, string>>): string {
	const status = entry.met === undefined ? 'unknown' : entry.met ? 'met' : 'not met'
	if (entry.field === undefined || entry.comparison === undefined) {
		return `${entry.description ?? 'Premise'} → ${status}`
	}
	const field = formatField(entry.field)
	const label = labels?.[field] ?? entry.label ?? field
	const expected = entry.expected === undefined ? '' : ` ${describeValue(entry.expected)}`
	return `${label} ${describeComparison(entry.comparison)}${expected} → ${status}`
}

/**
 * Build a {@link Premise} from an authored {@link Check} and its evaluated
 * `CheckResult`.
 *
 * @param check - The authored check
 * @param result - The evaluated check result carrying the resolved `actual` and `met`
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh premise
 *
 * @example
 * ```ts
 * import { premiseCheck } from '@orkestrel/qualifier'
 * import { check } from '@orkestrel/reason'
 *
 * const authored = check('age', 'above', 18)
 * premiseCheck(authored, { field: 'age', actual: 25, met: true })
 * // { field: 'age', comparison: 'above', expected: 18, actual: 25, met: true }
 * ```
 */
export function premiseCheck(
	check: Check,
	result: CheckResult,
	labels?: Readonly<Record<string, string>>,
): Premise {
	const field = formatField(check.field)
	return {
		field: check.field,
		...(labels?.[field] === undefined ? {} : { label: labels[field] }),
		comparison: check.operator,
		expected: check.value,
		actual: result.actual,
		...(result.met === undefined ? {} : { met: result.met }),
	}
}

/**
 * Build rich premises for one fired {@link Rule} by walking its premise atoms
 * and re-evaluating each against the working subject.
 *
 * @remarks
 * A reason rule result carries only booleans, so this is the qualifier's own
 * premise-audit projection: each authored premise expression is flattened to its
 * atom leaves via `extractAtoms`, and each leaf's `Check` is re-evaluated through
 * the injected `evaluator`. A membership check (`any` / `none`) over an EMPTY
 * array value is content-free and is skipped.
 *
 * @param rule - The authored rule
 * @param working - The working subject to evaluate against
 * @param evaluator - The shared reason check evaluator
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh, ordered list of rich premises
 *
 * @example
 * ```ts
 * import { logicalPremises } from '@orkestrel/qualifier'
 * import { atom, createEvaluator, logicalDefinition, rule } from '@orkestrel/reason'
 *
 * const gates = logicalDefinition('gates', 'Gates', [
 *   rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
 * ])
 * const evaluator = createEvaluator()
 * const premises = logicalPremises(gates.rules[0], { licensed: false }, evaluator)
 *
 * premises[0]?.met // true
 * ```
 */
export function logicalPremises(
	rule: Rule,
	working: Subject,
	evaluator: EvaluatorInterface,
	labels?: Readonly<Record<string, string>>,
): readonly Premise[] {
	const output: Premise[] = []
	for (const premise of rule.premises) {
		for (const atom of extractAtoms(premise)) {
			const { check } = atom
			if (
				(check.operator === 'any' || check.operator === 'none') &&
				Array.isArray(check.value) &&
				check.value.length === 0
			) {
				continue
			}
			output.push(premiseCheck(check, evaluator.evaluate(check, working), labels))
		}
	}
	return output
}

/**
 * Locate an authored {@link Rule} by id.
 *
 * @param definition - The logical definition to search
 * @param id - The rule id
 * @returns The matching rule, or `undefined`
 *
 * @example
 * ```ts
 * import { findRule } from '@orkestrel/qualifier'
 * import { atom, logicalDefinition, rule } from '@orkestrel/reason'
 *
 * const gates = logicalDefinition('gates', 'Gates', [
 *   rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
 * ])
 *
 * findRule(gates, 'licensed')?.id // 'licensed'
 * ```
 */
export function findRule(definition: LogicalDefinition, id: string): Rule | undefined {
	return definition.rules.find((rule) => rule.id === id)
}

/**
 * Project one reason result into the internal qualification namespace.
 *
 * @remarks
 * A quantitative result contributes its numeric `value`. A logical result
 * contributes a record of its `conclusion` plus every applied rule's asserted
 * conclusion fields (`extractConclusions`). A mismatched pairing contributes
 * `false`. The projection is pure — it never mutates the subject or the result.
 *
 * @param definition - The pass definition that produced the result
 * @param result - The evaluated reason result
 * @returns The pass's working projection
 */
export function reasonResultToProjection(
	definition: QualificationPass,
	result: ReasonResult,
): QualificationProjection {
	if (definition.reasoning === 'quantitative' && result.reasoning === 'quantitative') {
		return result.value
	}
	if (definition.reasoning !== 'logical' || result.reasoning !== 'logical') return false
	const projection: Record<string, unknown> = { conclusion: result.conclusion }
	for (const resolved of result.rules) {
		if (!resolved.applied) continue
		const authored = definition.rules.find((rule) => rule.id === resolved.id)
		if (authored === undefined) continue
		const conclusions = extractConclusions(authored.conclusion)
		for (const [key, value] of Object.entries(conclusions)) projection[key] = value
	}
	return projection
}

/**
 * Project a quantitative result into a {@link Derivation} audit record.
 *
 * @param id - The pass id
 * @param result - The evaluated quantitative result
 * @returns A fresh derivation
 */
export function quantitativeResultToDerivation(id: string, result: QuantitativeResult): Derivation {
	return {
		id,
		value: result.value,
		success: result.success,
		trace: [...result.trace],
		errors: [...result.errors],
	}
}

/**
 * Wrap a {@link QualificationContext} under {@link QUALIFICATION_KEY}.
 *
 * @param context - The accumulated projection context
 * @returns A record carrying the context under the reserved key
 */
export function qualificationToRecord(
	context: QualificationContext,
): Readonly<Record<string, QualificationContext>> {
	return { [QUALIFICATION_KEY]: context }
}

/**
 * Copy-on-write merge one pass projection into the context.
 *
 * @param context - The current projection context
 * @param id - The pass id to project under
 * @param projection - The pass's working projection
 * @returns A fresh context with the projection added
 */
export function mergeQualificationContext(
	context: QualificationContext,
	id: string,
	projection: QualificationProjection,
): QualificationContext {
	return { ...context, [id]: projection }
}

/**
 * Join a ruling, its logical rule result, the pass, the pre-projection subject,
 * and an evaluator into a {@link Finding}.
 *
 * @remarks
 * `applied` reflects whether the ruling's rule fired. Premises are re-evaluated
 * against the SAME subject snapshot the pass evaluated, so a conclusion the pass
 * derived can never satisfy its own reported premise. The message interpolates
 * against that snapshot.
 *
 * @param ruling - The authored ruling
 * @param pass - The pass the ruling's rule lives in
 * @param result - The pass's evaluated logical result
 * @param subject - The pre-projection subject snapshot the pass evaluated
 * @param evaluator - The shared reason check evaluator
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh finding
 */
export function rulingToFinding(
	ruling: Ruling,
	pass: QualificationPass,
	result: LogicalResult,
	subject: Subject,
	evaluator: EvaluatorInterface,
	labels?: Readonly<Record<string, string>>,
): Finding {
	const entry = result.rules.find((item) => item.id === ruling.rule)
	const applied = entry?.applied ?? false
	const rule = pass.reasoning === 'logical' ? findRule(pass, ruling.rule) : undefined
	const premises = rule === undefined ? [] : logicalPremises(rule, subject, evaluator, labels)
	return {
		id: ruling.id,
		pass: ruling.pass,
		rule: ruling.rule,
		effect: ruling.effect,
		...(ruling.scope === undefined ? {} : { scope: ruling.scope }),
		applied,
		...(ruling.message === undefined
			? {}
			: { message: interpolateMessage(ruling.message, subject) }),
		premises,
	}
}

/**
 * Derive global eligibility from applied, unscoped findings.
 *
 * @remarks
 * Only findings that both applied and carry no `scope` shape global eligibility.
 * A failed pass contributes a synthetic `referral` (fail-closed), passed through
 * `failed`.
 *
 * @param findings - The resolved findings
 * @param failed - Whether an operational pass failure occurred
 * @returns The most severe global eligibility
 */
export function deriveFindingEligibility(findings: Finding[], failed = false): Eligibility {
	const eligibilities = findings
		.filter((finding) => finding.applied && finding.scope === undefined)
		.map((finding) => EFFECT_ELIGIBILITIES[finding.effect])
	if (failed) eligibilities.push('referral')
	return combineEligibilities(eligibilities)
}

/**
 * Return the most severe {@link Eligibility} in a list.
 *
 * @param eligibilities - The eligibilities to combine
 * @returns The most severe eligibility, or `'eligible'` for an empty list
 *
 * @example
 * ```ts
 * import { combineEligibilities } from '@orkestrel/qualifier'
 *
 * combineEligibilities(['eligible', 'referral']) // 'referral'
 * ```
 */
export function combineEligibilities(eligibilities: Eligibility[]): Eligibility {
	for (const eligibility of ELIGIBILITY_PRECEDENCE) {
		if (eligibilities.includes(eligibility)) return eligibility
	}
	return 'eligible'
}

/**
 * Derive one eligibility per finding scope.
 *
 * @remarks
 * Only applied, scoped findings contribute. Each named scope combines its own
 * findings' impacts by severity. An unmentioned scope is absent (eligible by
 * default at the program layer).
 *
 * @param findings - The resolved findings
 * @returns A fresh record of scope to its combined eligibility
 */
export function deriveScopeEligibilities(
	findings: Finding[],
): Readonly<Record<string, Eligibility>> {
	const grouped: Record<string, Eligibility[]> = {}
	for (const finding of findings) {
		if (!finding.applied || finding.scope === undefined) continue
		const current = grouped[finding.scope] ?? []
		grouped[finding.scope] = [...current, EFFECT_ELIGIBILITIES[finding.effect]]
	}
	const scopes: Record<string, Eligibility> = {}
	for (const [scope, eligibilities] of Object.entries(grouped)) {
		scopes[scope] = combineEligibilities(eligibilities)
	}
	return scopes
}

/**
 * Find rulings whose pass or rule does not exist, whose pass is not logical, or
 * a pass id shadowing the reserved {@link QUALIFICATION_KEY}.
 *
 * @param definition - The qualification definition to check
 * @returns A fresh list of reference-error messages
 */
export function findMissingReferences(definition: QualificationDefinition): readonly string[] {
	const errors: string[] = []
	const passes = new Map(definition.passes.map((pass) => [pass.id, pass]))
	for (const pass of definition.passes) {
		if (pass.id === QUALIFICATION_KEY) {
			errors.push(`Pass id must not equal reserved key '${QUALIFICATION_KEY}'`)
		}
	}
	for (const ruling of definition.rulings ?? []) {
		const pass = passes.get(ruling.pass)
		if (pass === undefined) {
			errors.push(`Ruling '${ruling.id}' references missing pass '${ruling.pass}'`)
			continue
		}
		if (pass.reasoning !== 'logical') {
			errors.push(`Ruling '${ruling.id}' references non-logical pass '${ruling.pass}'`)
			continue
		}
		if (findRule(pass, ruling.rule) === undefined) {
			errors.push(
				`Ruling '${ruling.id}' references missing rule '${ruling.rule}' in pass '${ruling.pass}'`,
			)
		}
	}
	return errors
}

/**
 * Find duplicate ids in a list, once each.
 *
 * @param ids - The ids to scan
 * @returns A fresh list of ids that appear more than once
 */
export function findDuplicateIds(ids: readonly string[]): readonly string[] {
	const seen = new Set<string>()
	const duplicates = new Set<string>()
	for (const id of ids) {
		if (seen.has(id)) duplicates.add(id)
		else seen.add(id)
	}
	return [...duplicates]
}

/**
 * Determine whether a subject already owns the reserved {@link QUALIFICATION_KEY}.
 *
 * @param subject - The subject to check
 * @returns `true` when the subject owns the reserved key
 */
export function hasReservedKey(subject: Subject): boolean {
	return Object.hasOwn(subject, QUALIFICATION_KEY)
}

/**
 * Assert a value is a valid qualification {@link Subject}, narrowing it in place.
 *
 * @param value - The candidate subject to validate
 * @throws {@link QualifierError} `'MISMATCH'` when the value is not a record, or
 * when it already carries the reserved `qualification` key
 */
export function assertSubject(value: unknown): asserts value is Subject {
	if (!isRecord(value)) {
		throw new QualifierError('MISMATCH', 'Qualification subject must be a record')
	}
	if (hasReservedKey(value)) {
		throw new QualifierError(
			'MISMATCH',
			`Qualification subject must not contain reserved key '${QUALIFICATION_KEY}'`,
		)
	}
}
