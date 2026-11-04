import type { AuditFault, FieldPath, JSONValue } from '@orkestrel/contract'
import type {
	Derivation,
	Eligibility,
	Finding,
	Premise,
	QualificationContext,
	QualificationDefinition,
	QualificationPass,
	QualificationProjection,
	QualificationResult,
	Ruling,
} from './types.js'
import type {
	Check,
	CheckResult,
	LogicalDefinition,
	LogicalResult,
	QuantitativeResult,
	ReasonResult,
	Rule,
	RuleResult,
	ShapeScan,
	Subject,
} from '@orkestrel/reason'
import {
	EFFECT_ELIGIBILITIES,
	ELIGIBILITY_PRECEDENCE,
	MESSAGE_TOKEN,
	QUALIFICATION_KEY,
} from './constants.js'
import { QualifierError } from './errors.js'
import { isArray, isError, isFiniteNumber, isRecord, resolveField } from '@orkestrel/contract'
import {
	extractAtoms,
	extractConclusions,
	filterUniqueFaults,
	collectConcluders,
	findFieldShape,
	formatField,
	isBounds,
	isReasonError,
	projectValue,
	scanShapeReads,
} from '@orkestrel/reason'

/**
 * Interpolates `{{dotted.path}}` tokens in a message template against a subject.
 *
 * @remarks
 * Each token is split on `.` into a `FieldPath` array and resolved with
 * `resolveField` (a plain string field is one key, never dot-split — the split
 * here is the token-to-path bridge). A finite number renders with `en-US`
 * thousand grouping (`5010` → `5,010`); any other resolved value String-coerces.
 * An unresolved path renders as the empty string.
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
	return template.replace(MESSAGE_TOKEN, (_match, path: string) => {
		const value = resolveField(subject, path.split('.'))
		if (value === undefined) return ''
		if (isFiniteNumber(value)) return value.toLocaleString('en-US')
		return String(value)
	})
}

/**
 * Finds the `{{dotted.path}}` tokens a message template reads.
 *
 * @param template - The message template
 * @returns Each token's dotted path, trimmed, in order, repeats included
 *
 * @example
 * ```ts
 * import { findMessageTokens } from '@orkestrel/qualifier'
 *
 * findMessageTokens('Age {{ age }} in {{home.city}}') // ['age', 'home.city']
 * ```
 */
export function findMessageTokens(template: string): readonly string[] {
	return [...template.matchAll(MESSAGE_TOKEN)].map((match) => match[1] ?? '')
}

/**
 * Renders a {@link Premise} comparison as a display-neutral verb phrase.
 *
 * @param comparison - The comparison to describe
 * @returns A display-neutral phrase
 *
 * @example
 * ```ts
 * import { renderComparison } from '@orkestrel/qualifier'
 *
 * renderComparison('above') // 'is more than'
 * ```
 */
export function renderComparison(comparison: NonNullable<Premise['comparison']>): string {
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
 * Renders a structured or scalar expected value display-neutrally.
 *
 * @remarks
 * An array renders as its elements, each `String`-coerced, joined with `', '`.
 * A reason `Bounds`-shaped record (the `between` / `outside` expected value)
 * renders its present sides joined with the word `and`; an absent side is
 * omitted. A finite number and everything else fall back to plain `String()` —
 * a finite number is not grouped here (grouping is {@link interpolateMessage}'s
 * message-token-only behavior).
 *
 * @param value - The value to render
 * @returns A display-neutral rendering
 *
 * @example
 * ```ts
 * import { renderValue } from '@orkestrel/qualifier'
 *
 * renderValue([18, 25, 40]) // '18, 25, 40'
 * renderValue({ minimum: 18, maximum: 65 }) // '18 and 65'
 * renderValue(42) // '42'
 * ```
 */
export function renderValue(value: unknown): string {
	if (isArray(value)) return value.map((entry) => String(entry)).join(', ')
	if (isBounds(value)) {
		const sides: string[] = []
		if (value.minimum !== undefined) sides.push(String(value.minimum))
		if (value.maximum !== undefined) sides.push(String(value.maximum))
		return sides.join(' and ')
	}
	return String(value)
}

/**
 * Renders one {@link Premise} into a display-neutral sentence.
 *
 * @remarks
 * The checked form renders only when `field` and `comparison` are both
 * present, and `description` then goes unused; a premise missing either half
 * of the checked pair renders as described instead.
 *
 * @param entry - The premise to render
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A display-neutral sentence
 *
 * @example
 * ```ts
 * import { renderPremise } from '@orkestrel/qualifier'
 *
 * renderPremise({ field: 'age', comparison: 'above', expected: 18, actual: 25, state: 'met' })
 * // 'age is more than 18 → met'
 *
 * renderPremise({ description: 'Applicant is enrolled', state: 'met' })
 * // 'Applicant is enrolled → met'
 * ```
 */
export function renderPremise(entry: Premise, labels?: Readonly<Record<string, string>>): string {
	const status = entry.state === 'met' ? 'met' : entry.state === 'unmet' ? 'not met' : 'unknown'
	if (entry.field === undefined || entry.comparison === undefined) {
		return `${entry.description ?? 'Premise'} → ${status}`
	}
	const field = formatField(entry.field)
	const label = labels?.[field] ?? entry.label ?? field
	const expected = entry.expected === undefined ? '' : ` ${renderValue(entry.expected)}`
	return `${label} ${renderComparison(entry.comparison)}${expected} → ${status}`
}

/**
 * Builds a {@link Premise} from an authored {@link Check} and its evaluated
 * `CheckResult`.
 *
 * @param check - The authored check
 * @param result - The evaluated check result carrying the resolved `actual` and `state`
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh premise
 *
 * @example
 * ```ts
 * import { checkToPremise } from '@orkestrel/qualifier'
 * import { createCheck } from '@orkestrel/reason'
 *
 * const authored = createCheck('age', 'above', 18)
 * checkToPremise(authored, { field: 'age', actual: 25, state: 'met' })
 * // { field: 'age', comparison: 'above', expected: 18, actual: 25, state: 'met' }
 * ```
 */
export function checkToPremise(
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
		state: result.state,
	}
}

/**
 * Builds rich premises for one fired {@link Rule} by walking its premise atoms
 * and reading each from what the rule read.
 *
 * @remarks
 * Each authored premise expression is flattened to its atom leaves through `extractAtoms`,
 * which lines up with the `checks` the rule result carries, so a premise cannot disagree with
 * the pass. A rule with no result never ran, so its premises carry no `state` or `actual`.
 *
 * @param rule - The authored rule
 * @param resolved - The rule's result, absent when it never ran
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh, ordered list of rich premises
 *
 * @example
 * ```ts
 * import { ruleToPremises } from '@orkestrel/qualifier'
 * import { createAtom, createRule } from '@orkestrel/reason'
 *
 * const rule = createRule('licensed', [createAtom('licensed', 'equals', false)], createAtom('blocked', 'equals', true))
 * const resolved = {
 *   id: 'licensed',
 *   state: 'met' as const,
 *   premises: ['met' as const],
 *   checks: [{ field: 'licensed', state: 'met' as const, actual: false }],
 * }
 * ruleToPremises(rule, resolved)[0]?.state // 'met'
 * ```
 */
export function ruleToPremises(
	rule: Rule,
	resolved: RuleResult | undefined,
	labels?: Readonly<Record<string, string>>,
): readonly Premise[] {
	return rule.premises
		.flatMap((premise) => extractAtoms(premise))
		.map((atom, index) => {
			const read = resolved?.checks[index]
			if (read !== undefined) return checkToPremise(atom.check, read, labels)
			const {
				state: _state,
				actual: _actual,
				...unrun
			} = checkToPremise(
				atom.check,
				{ field: atom.check.field, state: 'unread', actual: undefined },
				labels,
			)
			return unrun
		})
}

/**
 * Locates an authored {@link Rule} by id.
 *
 * @param definition - The logical definition to search
 * @param id - The rule id
 * @returns The matching rule, or `undefined`
 *
 * @example
 * ```ts
 * import { findRule } from '@orkestrel/qualifier'
 * import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
 *
 * const gates = createLogicalDefinition('gates', 'Gates', [
 *   createRule('licensed', [createAtom('licensed', 'equals', false)], createAtom('blocked', 'equals', true)),
 * ])
 *
 * findRule(gates, 'licensed')?.id // 'licensed'
 * ```
 */
export function findRule(definition: LogicalDefinition, id: string): Rule | undefined {
	return definition.rules.find((rule) => rule.id === id)
}

/**
 * Projects one reason result into the internal qualification namespace.
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
 *
 * @example
 * ```ts
 * import { reasonResultToProjection } from '@orkestrel/qualifier'
 * import { createFactorGroup, createQuantitativeDefinition, createStaticFactor } from '@orkestrel/reason'
 *
 * const cap = createQuantitativeDefinition('cap', 'TIV cap', [
 *   createFactorGroup('limit', 'sum', [createStaticFactor('base', 500_000)]),
 * ])
 * const result = {
 *   reasoning: 'quantitative' as const,
 *   value: 500_000,
 *   groups: [],
 *   count: 1,
 *   success: true,
 *   trace: [],
 *   errors: [],
 * }
 * reasonResultToProjection(cap, result) // 500000
 * ```
 */
export function reasonResultToProjection(
	definition: QualificationPass,
	result: ReasonResult,
): QualificationProjection {
	if (definition.reasoning === 'quantitative' && result.reasoning === 'quantitative') {
		return result.value
	}
	if (definition.reasoning !== 'logical' || result.reasoning !== 'logical') return false
	// An unfired rule's keys read false first, so a key another rule fired keeps that rule's value,
	// and the pass's own conclusion goes last, so no rule can stand in for it.
	const fields = ['unmet', 'met'].flatMap((state) =>
		result.rules
			.filter((resolved) => resolved.state === state)
			.flatMap((resolved) => {
				const authored = definition.rules.find((rule) => rule.id === resolved.id)
				if (authored === undefined) return []
				return Object.entries(extractConclusions(authored.conclusion)).map(
					([key, value]): readonly [string, unknown] => [key, state === 'met' ? value : false],
				)
			}),
	)
	return Object.fromEntries([...fields, ['conclusion', result.conclusion === 'met']])
}

/**
 * Replaces a read of an unread pass's projection with what that pass could not read.
 *
 * @remarks
 * A pass reading `qualification.gates.blocked` is unread because `gates` projected nothing, so
 * the question to ask is the one `gates` could not answer. A read of a pass that settled stays,
 * because that pass holds no such key. Passes run in order and each stores its expanded faults,
 * so a chain of unread passes reaches the input that started it.
 *
 * @param faults - The faults every pass reported, in order
 * @param unread - The faults of each unread pass, by pass id
 * @returns The input faults, once per field
 *
 * @example
 * ```ts
 * import { expandPassFaults } from '@orkestrel/qualifier'
 *
 * const leaf = { reason: 'missing', path: 'age', expected: 'number' } as const
 * const read = { reason: 'missing', path: ['qualification', 'gates', 'ok'], expected: 'boolean' } as const
 * expandPassFaults([read], new Map([['gates', [leaf]]])) // [leaf]
 * ```
 */
export function expandPassFaults(
	faults: readonly AuditFault[],
	unread: ReadonlyMap<string, readonly AuditFault[]>,
): readonly AuditFault[] {
	return filterUniqueFaults(
		faults.flatMap((fault) => {
			// A projection is read through an array path, and its second key is the pass id whole.
			const { path } = fault
			if (!isArray(path) || path[0] !== QUALIFICATION_KEY) return [fault]
			return unread.get(path[1] ?? '') ?? [fault]
		}),
	)
}

/**
 * Describes what the definition's shape cannot stand for: a read of a field it does not declare,
 * and the reserved `qualification` key, which a default could otherwise fill.
 *
 * @remarks
 * A read under `qualification` reads a pass's projection, and a pass's own conclusion keys are
 * its own, so neither needs a declaration. A host that projects a key of its own names it in
 * `projections`. A `raw` or `json` read is a warning.
 *
 * @param definition - The definition
 * @param projections - Further keys the host projects onto the subject. Default: none
 * @returns The errors and warnings, empty with no shape
 *
 * @example
 * ```ts
 * import { numberShape, objectShape } from '@orkestrel/contract'
 * import { createQualificationDefinition, scanDefinitionShape } from '@orkestrel/qualifier'
 * import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
 *
 * const pass = createLogicalDefinition('gates', 'Gates', [
 *   createRule('r', [createAtom('agee', 'above', 1)], createAtom('ok', 'equals', true)),
 * ])
 * const shape = objectShape({ age: numberShape() })
 * scanDefinitionShape(createQualificationDefinition('d', 'd', [pass], { shape })).errors.length // 1
 * ```
 */
export function scanDefinitionShape(
	definition: QualificationDefinition,
	projections: readonly string[] = [],
): ShapeScan {
	const { shape } = definition
	if (shape === undefined) return { errors: [], warnings: [] }
	const scans = definition.passes.map((pass) => {
		if (pass.reasoning === 'logical') {
			const enabled = pass.rules.filter((rule) => rule.enabled !== false)
			const checks = enabled
				.flatMap((rule) => rule.premises.flatMap((premise) => extractAtoms(premise)))
				.map((atom) => atom.check)
				.filter((check) => !readsProjection(check.field, projections))
			return scanShapeReads(shape, checks, [], new Set(collectConcluders(enabled).keys()))
		}
		const factors = pass.groups.flatMap((group) => group.factors)
		return scanShapeReads(
			shape,
			factors
				.flatMap((factor) => factor.checks ?? [])
				.filter((check) => !readsProjection(check.field, projections)),
			factors
				.flatMap((factor) => (factor.source.origin === 'static' ? [] : [factor.source.field]))
				.filter((field) => !readsProjection(field, projections)),
			new Set(),
		)
	})
	return {
		errors: [
			...(findFieldShape(shape, QUALIFICATION_KEY).shape === undefined
				? []
				: [`Shape declares the reserved key '${QUALIFICATION_KEY}'`]),
			...new Set(scans.flatMap((scan) => scan.errors)),
		],
		warnings: [...new Set(scans.flatMap((scan) => scan.warnings))],
	}
}

/**
 * Determines whether a field reads a pass's projection under `qualification`, or a key the host projects.
 *
 * @param field - The field
 * @param projections - Further keys the host projects onto the subject. Default: none
 * @returns True for an array path starting at the reserved key or a projected key; false otherwise
 *
 * @example
 * ```ts
 * import { readsProjection } from '@orkestrel/qualifier'
 *
 * readsProjection(['qualification', 'gates', 'ok']) // true
 * readsProjection(['aggregate', 'count'], ['aggregate']) // true
 * readsProjection('age')                            // false
 * ```
 */
export function readsProjection(field: FieldPath, projections: readonly string[] = []): boolean {
	if (!isArray(field)) return false
	const key = field[0]
	return key === QUALIFICATION_KEY || (key !== undefined && projections.includes(key))
}

/**
 * Describes each rule concluding `conclusion`, which a pass's projection reserves for itself.
 *
 * @param definition - The definition
 * @returns One message per such rule
 *
 * @example
 * ```ts
 * import { createQualificationDefinition, describeReservedConclusions } from '@orkestrel/qualifier'
 * import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
 *
 * const pass = createLogicalDefinition('gates', 'Gates', [
 *   createRule('r', [createAtom('a', 'equals', 1)], createAtom('conclusion', 'equals', true)),
 * ])
 * describeReservedConclusions(createQualificationDefinition('d', 'd', [pass])).length // 1
 * ```
 */
export function describeReservedConclusions(
	definition: QualificationDefinition,
): readonly string[] {
	return definition.passes.flatMap((pass) =>
		pass.reasoning !== 'logical'
			? []
			: pass.rules
					.filter((rule) => Object.hasOwn(extractConclusions(rule.conclusion), 'conclusion'))
					.map(
						(rule) =>
							`Rule '${rule.id}' in pass '${pass.id}' concludes the reserved key 'conclusion'`,
					),
	)
}

/**
 * Determines whether a logical result holds a rule left unread.
 *
 * @param result - The result of a pass
 * @returns True when a logical result holds such a rule; false otherwise
 *
 * @example
 * ```ts
 * import { hasUnreadRule } from '@orkestrel/qualifier'
 *
 * const rule = { id: 'r', state: 'unread' as const, premises: [], checks: [] }
 * hasUnreadRule({
 *   reasoning: 'logical',
 *   conclusion: 'unread',
 *   rules: [rule],
 *   count: 0,
 *   success: false,
 *   trace: [],
 *   errors: [],
 *   faults: [],
 *   repairs: [],
 *   defaulted: [],
 * }) // true
 * ```
 */
export function hasUnreadRule(result: ReasonResult): boolean {
	return result.reasoning === 'logical' && result.rules.some((rule) => rule.state === 'unread')
}

/**
 * Describes each message token no field of the definition's shape answers.
 *
 * @remarks
 * A token under `qualification` reads a pass's projection, which no shape declares.
 *
 * @param definition - The definition
 * @returns One message per unknown token, empty with no shape
 *
 * @example
 * ```ts
 * import { numberShape, objectShape } from '@orkestrel/contract'
 * import { createQualificationDefinition, createRuling, describeUnknownTokens } from '@orkestrel/qualifier'
 *
 * const ruling = createRuling('r', 'gates', 'licensed', 'referral', { message: 'Age {{agee}}' })
 * const shape = objectShape({ age: numberShape() })
 * describeUnknownTokens(createQualificationDefinition('d', 'd', [], { rulings: [ruling], shape }))
 * // ['Ruling \'r\' message reads "agee", and the shape does not declare it']
 * ```
 */
export function describeUnknownTokens(definition: QualificationDefinition): readonly string[] {
	const { shape } = definition
	if (shape === undefined) return []
	return (definition.rulings ?? []).flatMap((ruling) =>
		findMessageTokens(ruling.message ?? '').flatMap((token) => {
			const path = token.split('.')
			if (path[0] === QUALIFICATION_KEY || findFieldShape(shape, path).declared) return []
			return [`Ruling '${ruling.id}' message reads "${token}", and the shape does not declare it`]
		}),
	)
}

/**
 * Projects a result to the JSON its contract reads.
 *
 * @remarks
 * A premise's `actual` holds whatever the subject held and a derivation's `value` may be `NaN`,
 * so a result crosses a boundary as this projection, each `actual` on its own budget.
 *
 * @param result - The qualification result
 * @returns Its JSON projection, which `qualificationResultContract` admits
 *
 * @example
 * ```ts
 * import { createQualificationDefinition, createQualifier, projectQualificationResult, qualificationResultContract } from '@orkestrel/qualifier'
 *
 * const qualifier = createQualifier()
 * const result = qualifier.qualify({}, createQualificationDefinition('d', 'd', []))
 * qualificationResultContract.is(projectQualificationResult(result)) // true
 * qualifier.destroy()
 * ```
 */
export function projectQualificationResult(result: QualificationResult): JSONValue | undefined {
	const findings = result.findings.map((finding) => ({
		...finding,
		premises: finding.premises.map((premise) => ({
			...premise,
			actual: projectValue(premise.actual),
		})),
	}))
	return projectValue({ ...result, findings }, new Set(), { left: Number.POSITIVE_INFINITY })
}

/**
 * Projects a quantitative result into a {@link Derivation} audit record.
 *
 * @param id - The pass id
 * @param result - The evaluated quantitative result
 * @returns A fresh derivation
 *
 * @example
 * ```ts
 * import { quantitativeResultToDerivation } from '@orkestrel/qualifier'
 *
 * const result = { reasoning: 'quantitative' as const, value: 500_000, groups: [], count: 1, success: true, trace: ['cap: 500000'], errors: [] }
 * quantitativeResultToDerivation('cap', result)
 * // { id: 'cap', value: 500000, success: true, trace: ['cap: 500000'], errors: [] }
 * ```
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
 * Wraps a {@link QualificationContext} under {@link QUALIFICATION_KEY}.
 *
 * @param context - The accumulated projection context
 * @returns A record carrying the context under the reserved key
 *
 * @example
 * ```ts
 * import { qualificationToRecord } from '@orkestrel/qualifier'
 *
 * qualificationToRecord({ cap: 500_000 }) // { qualification: { cap: 500000 } }
 * ```
 */
export function qualificationToRecord(
	context: QualificationContext,
): Readonly<Record<string, QualificationContext>> {
	return { [QUALIFICATION_KEY]: context }
}

/**
 * Merges one pass projection into the context, copy-on-write.
 *
 * @param context - The current projection context
 * @param id - The pass id to project under
 * @param projection - The pass's working projection
 * @returns A fresh context with the projection added
 *
 * @example
 * ```ts
 * import { mergeQualificationContext } from '@orkestrel/qualifier'
 *
 * mergeQualificationContext({ cap: 500_000 }, 'excess', 250_000)
 * // { cap: 500000, excess: 250000 }
 * ```
 */
export function mergeQualificationContext(
	context: QualificationContext,
	id: string,
	projection: QualificationProjection,
): QualificationContext {
	return { ...context, [id]: projection }
}

/**
 * Joins a ruling, its logical rule result, the pass, and the pre-projection subject into a
 * {@link Finding}.
 *
 * @remarks
 * `state` is the state of the ruling's rule. A rule the result omits reads `unmet` when it is
 * disabled, which is authored, and `unread` otherwise, because a refused pass evaluated no rule.
 * Premises come from what the rule read. The message interpolates against the subject.
 *
 * @param ruling - The authored ruling
 * @param pass - The pass the ruling's rule lives in
 * @param result - The pass's evaluated logical result
 * @param subject - The pre-projection subject snapshot the pass evaluated
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh finding
 *
 * @example
 * ```ts
 * import { rulingToFinding } from '@orkestrel/qualifier'
 * import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
 *
 * const gates = createLogicalDefinition('gates', 'Gates', [
 *   createRule('licensed', [createAtom('licensed', 'equals', false)], createAtom('blocked', 'equals', true)),
 * ])
 * const ruling = { id: 'license', pass: 'gates', rule: 'licensed', effect: 'restriction' as const }
 * const result = {
 *   reasoning: 'logical' as const,
 *   conclusion: 'met' as const,
 *   rules: [{ id: 'licensed', state: 'met' as const, premises: ['met' as const], checks: [] }],
 *   count: 1,
 *   success: true,
 *   trace: [],
 *   errors: [],
 *   faults: [],
 *   repairs: [],
 *   defaulted: [],
 * }
 * rulingToFinding(ruling, gates, result, { licensed: false }).state // 'met'
 * ```
 */
export function rulingToFinding(
	ruling: Ruling,
	pass: QualificationPass,
	result: LogicalResult,
	subject: Subject,
	labels?: Readonly<Record<string, string>>,
): Finding {
	const entry = result.rules.find((resolved) => resolved.id === ruling.rule)
	const rule = pass.reasoning === 'logical' ? findRule(pass, ruling.rule) : undefined
	const premises = rule === undefined ? [] : ruleToPremises(rule, entry, labels)
	return {
		id: ruling.id,
		pass: ruling.pass,
		rule: ruling.rule,
		effect: ruling.effect,
		...(ruling.scope === undefined ? {} : { scope: ruling.scope }),
		// A disabled rule is authored not to fire. Any other rule missing here was never evaluated.
		state: entry?.state ?? (rule?.enabled === false ? 'unmet' : 'unread'),
		...(ruling.message === undefined
			? {}
			: { message: interpolateMessage(ruling.message, subject) }),
		premises,
	}
}

/**
 * Derives global eligibility from unscoped findings whose rule is met.
 *
 * @remarks
 * Only findings that are `met` and carry no `scope` shape global eligibility.
 * A failed pass contributes a synthetic `referral` (fail-closed), passed through
 * `failed`.
 *
 * @param findings - The resolved findings
 * @param failed - If `true`, adds a synthetic `referral` impact so an operational failure
 * fails closed; if `false`, derives eligibility from the findings alone. Default: `false`
 * @returns The most severe global eligibility
 *
 * @example
 * ```ts
 * import { deriveFindingEligibility } from '@orkestrel/qualifier'
 *
 * const finding = { id: 'license', pass: 'gates', rule: 'licensed', effect: 'restriction' as const, state: 'met' as const, premises: [] }
 * deriveFindingEligibility([finding]) // 'ineligible'
 * ```
 */
export function deriveFindingEligibility(
	findings: readonly Finding[],
	failed = false,
): Eligibility {
	const eligibilities = findings
		.filter((finding) => finding.state === 'met' && finding.scope === undefined)
		.map((finding) => EFFECT_ELIGIBILITIES[finding.effect])
	if (failed) eligibilities.push('referral')
	return combineEligibilities(eligibilities)
}

/**
 * Returns the most severe {@link Eligibility} in a list.
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
export function combineEligibilities(eligibilities: readonly Eligibility[]): Eligibility {
	for (const eligibility of ELIGIBILITY_PRECEDENCE) {
		if (eligibilities.includes(eligibility)) return eligibility
	}
	return 'eligible'
}

/**
 * Derives one eligibility per finding scope.
 *
 * @remarks
 * Only scoped findings that are `met` contribute. Each named scope combines its own
 * findings' impacts by severity. An unmentioned scope is absent (eligible by
 * default at the program layer).
 *
 * @param findings - The resolved findings
 * @returns A fresh record of scope to its combined eligibility
 *
 * @example
 * ```ts
 * import { deriveScopeEligibilities } from '@orkestrel/qualifier'
 *
 * const finding = { id: 'coastal', pass: 'wind', rule: 'coastal', effect: 'restriction' as const, scope: 'wind', state: 'met' as const, premises: [] }
 * deriveScopeEligibilities([finding]) // { wind: 'ineligible' }
 * ```
 */
export function deriveScopeEligibilities(
	findings: readonly Finding[],
): Readonly<Record<string, Eligibility>> {
	// A Map, because a scope may be named `constructor` or `__proto__`.
	const grouped = new Map<string, Eligibility[]>()
	for (const finding of findings) {
		if (finding.state !== 'met' || finding.scope === undefined) continue
		const current = grouped.get(finding.scope) ?? []
		grouped.set(finding.scope, [...current, EFFECT_ELIGIBILITIES[finding.effect]])
	}
	return Object.fromEntries(
		[...grouped].map(([scope, eligibilities]) => [scope, combineEligibilities(eligibilities)]),
	)
}

/**
 * Describes each ruling whose pass or rule does not exist or whose pass is not
 * logical, and each pass id shadowing the reserved {@link QUALIFICATION_KEY}.
 *
 * @param definition - The qualification definition to check
 * @returns A fresh list of reference-error messages
 *
 * @example
 * ```ts
 * import { createQualificationDefinition, createRuling, describeMissingReferences } from '@orkestrel/qualifier'
 * import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
 *
 * const gates = createLogicalDefinition('gates', 'Gates', [
 *   createRule('licensed', [createAtom('licensed', 'equals', false)], createAtom('blocked', 'equals', true)),
 * ])
 * const definition = createQualificationDefinition('standard', 'Standard', [gates], {
 *   rulings: [createRuling('license', 'gates', 'absent', 'restriction')],
 * })
 *
 * describeMissingReferences(definition)
 * // ["Ruling 'license' references missing rule 'absent' in pass 'gates'"]
 * ```
 */
export function describeMissingReferences(definition: QualificationDefinition): readonly string[] {
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
 * Determines whether a subject already owns the reserved {@link QUALIFICATION_KEY}.
 *
 * @param subject - The subject to check
 * @returns True if the subject owns the reserved key; false otherwise
 *
 * @example
 * ```ts
 * import { hasReservedKey } from '@orkestrel/qualifier'
 *
 * hasReservedKey({ id: 's1', qualification: {} }) // true
 * ```
 */
export function hasReservedKey(subject: Subject): boolean {
	return Object.hasOwn(subject, QUALIFICATION_KEY)
}

/**
 * Asserts a value is a valid qualification {@link Subject}, narrowing it in place.
 *
 * @param value - The candidate subject to validate
 * @throws {@link QualifierError} `'MISMATCH'` when the value is not a record, or
 * when it already carries the reserved `qualification` key
 *
 * @example
 * ```ts
 * import { assertSubject } from '@orkestrel/qualifier'
 *
 * assertSubject({ id: 's1' }) // narrows to Subject
 * ```
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

/**
 * Maps an engine throw caught while running one pass to a typed {@link QualifierError}.
 *
 * @remarks
 * A reason `ReasonError('INVALID')` maps to `DEFINITION` (the engine rejected the
 * pass as an invalid definition); `ReasonError('DESTROYED')` maps to `DESTROYED`;
 * every other `ReasonError` code (for example `MISSING`) and every non-`ReasonError` throw
 * (including a `bail: true` reasoner rethrow) maps to `ENGINE`. The original throw
 * is preserved as `context.cause`.
 *
 * @param error - The value caught from the engine's `reason` call
 * @param pass - The id of the pass that was running
 * @returns A fresh, typed {@link QualifierError}
 *
 * @example
 * ```ts
 * import { mapEngineError } from '@orkestrel/qualifier'
 * import { ReasonError } from '@orkestrel/reason'
 *
 * mapEngineError(new ReasonError('MISSING', 'No reasoner registered'), 'cap').code // 'ENGINE'
 * ```
 */
export function mapEngineError(error: unknown, pass: string): QualifierError {
	if (isReasonError(error)) {
		if (error.code === 'INVALID') {
			return new QualifierError(
				'DEFINITION',
				`Pass '${pass}' failed engine validation: ${error.message}`,
				{ pass, cause: error },
			)
		}
		if (error.code === 'DESTROYED') {
			return new QualifierError(
				'DESTROYED',
				`Qualifier engine was destroyed during pass '${pass}'`,
				{ pass, cause: error },
			)
		}
		return new QualifierError('ENGINE', `Pass '${pass}' engine failure: ${error.message}`, {
			pass,
			cause: error,
		})
	}
	const message = isError(error) ? error.message : String(error)
	return new QualifierError('ENGINE', `Pass '${pass}' engine failure: ${message}`, {
		pass,
		cause: error,
	})
}

/**
 * Describes each logical pass carrying no rulings.
 *
 * @remarks
 * A logical pass with no matching ruling can never contribute a finding, so its
 * rules only ever influence later passes' reads — this is very likely an authoring
 * oversight.
 *
 * @param definition - The qualification definition to check
 * @returns A fresh list of warning messages
 *
 * @example
 * ```ts
 * import { createQualificationDefinition, describeEmptyLogicalPasses } from '@orkestrel/qualifier'
 * import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
 *
 * const gates = createLogicalDefinition('gates', 'Gates', [
 *   createRule('licensed', [createAtom('licensed', 'equals', false)], createAtom('blocked', 'equals', true)),
 * ])
 * const definition = createQualificationDefinition('standard', 'Standard', [gates])
 *
 * describeEmptyLogicalPasses(definition) // ["Logical pass 'gates' has no rulings"]
 * ```
 */
export function describeEmptyLogicalPasses(definition: QualificationDefinition): readonly string[] {
	const warnings: string[] = []
	for (const pass of definition.passes) {
		if (pass.reasoning !== 'logical') continue
		const hasRuling = (definition.rulings ?? []).some((ruling) => ruling.pass === pass.id)
		if (!hasRuling) warnings.push(`Logical pass '${pass.id}' has no rulings`)
	}
	return warnings
}

/**
 * Describes each quantitative pass never read by a later pass.
 *
 * @remarks
 * A quantitative pass's projected value lives under `qualification.<id>` — if no
 * later logical premise or quantitative factor field reads that key, the
 * derivation is dead weight. Reads are collected per later pass: a logical pass's
 * premise atoms (conclusion atoms are writes, not reads), and a quantitative
 * pass's field/lookup/range factor sources plus factor checks.
 *
 * @param definition - The qualification definition to check
 * @returns A fresh list of warning messages
 *
 * @example
 * ```ts
 * import { createQualificationDefinition, describeUnreadDerivations } from '@orkestrel/qualifier'
 * import { createFactorGroup, createQuantitativeDefinition, createStaticFactor } from '@orkestrel/reason'
 *
 * const cap = createQuantitativeDefinition('cap', 'TIV cap', [
 *   createFactorGroup('limit', 'sum', [createStaticFactor('base', 500_000)]),
 * ])
 * const definition = createQualificationDefinition('standard', 'Standard', [cap])
 *
 * describeUnreadDerivations(definition) // ["Quantitative pass 'cap' is never read by a later pass"]
 * ```
 */
export function describeUnreadDerivations(definition: QualificationDefinition): readonly string[] {
	const warnings: string[] = []
	definition.passes.forEach((pass, index) => {
		if (pass.reasoning !== 'quantitative') return
		const key = formatField(['qualification', pass.id])
		const reads = new Set<string>()
		for (const later of definition.passes.slice(index + 1)) {
			if (later.reasoning === 'logical') {
				for (const rule of later.rules) {
					for (const premise of rule.premises) {
						for (const atom of extractAtoms(premise)) reads.add(formatField(atom.check.field))
					}
				}
			}
			if (later.reasoning === 'quantitative') {
				for (const group of later.groups) {
					for (const factor of group.factors) {
						if (
							factor.source.origin === 'field' ||
							factor.source.origin === 'lookup' ||
							factor.source.origin === 'range'
						) {
							reads.add(formatField(factor.source.field))
						}
						for (const check of factor.checks ?? []) reads.add(formatField(check.field))
					}
				}
			}
		}
		if (!reads.has(key)) {
			warnings.push(`Quantitative pass '${pass.id}' is never read by a later pass`)
		}
	})
	return warnings
}
