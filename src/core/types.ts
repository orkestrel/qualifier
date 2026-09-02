import type { FieldPath, JSONValue } from '@orkestrel/contract'
import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'
import type {
	Comparison,
	LogicalDefinition,
	QuantitativeDefinition,
	ReasonInterface,
	ReasonValidationResult,
	Subject,
} from '@orkestrel/reason'

/** Represents the eligibility outcome axis. */
export type Eligibility = 'eligible' | 'ineligible' | 'referral'

/** Represents an authored ruling's eligibility impact. */
export type QualificationEffect = 'restriction' | 'referral' | 'condition'

/** Represents one ordered derivation or rule pass. */
export type QualificationPass = QuantitativeDefinition | LogicalDefinition

/** Represents one pass's internal working projection. */
export type QualificationProjection = number | boolean | Readonly<Record<string, unknown>>

/** Represents the internal projection record stored under `QUALIFICATION_KEY`. */
export type QualificationContext = Readonly<Record<string, QualificationProjection>>

/** Carries the optional fields `rulingDefinition` accepts. */
export interface RulingInput {
	readonly scope?: string
	readonly message?: string
}

/** Carries the optional fields `qualificationDefinition` accepts. */
export interface QualificationInput {
	readonly description?: string
	readonly rulings?: readonly Ruling[]
	readonly metadata?: Readonly<Record<string, JSONValue>>
}

/** Represents an authored consequence for one rule in one logical pass. */
export interface Ruling {
	readonly id: string
	readonly pass: string
	readonly rule: string
	readonly effect: QualificationEffect
	readonly scope?: string
	readonly message?: string
}

/**
 * Represents display-neutral evidence for one condition, in one of two authoring modes.
 * A CHECKED premise carries `field` and `comparison`; a DESCRIBED premise
 * carries neither and renders from `description` instead. The checked form
 * renders only when `field` and `comparison` are BOTH present, and
 * `description` then goes unused; a premise missing either half of the
 * checked pair renders as described instead. `met` is three-state: `true`
 * (met), `false` (not met), or absent (not evaluated, rendered as unknown).
 */
export interface Premise {
	readonly field?: FieldPath
	readonly label?: string
	readonly description?: string
	readonly comparison?: Comparison
	readonly expected?: unknown
	readonly actual?: unknown
	readonly met?: boolean
}

/** Represents one resolved ruling. */
export interface Finding {
	readonly id: string
	readonly pass: string
	readonly rule: string
	readonly effect: QualificationEffect
	readonly scope?: string
	readonly applied: boolean
	readonly message?: string
	readonly premises: readonly Premise[]
}

/** Represents one quantitative pass's audit result. */
export interface Derivation {
	readonly id: string
	readonly value: number
	readonly success: boolean
	readonly trace: readonly string[]
	readonly errors: readonly string[]
}

/** Represents a pure authored qualification definition. */
export interface QualificationDefinition {
	readonly id: string
	readonly name: string
	readonly description?: string
	readonly passes: readonly QualificationPass[]
	readonly rulings?: readonly Ruling[]
	readonly metadata?: Readonly<Record<string, JSONValue>>
}

/** Represents one subject's complete qualification outcome. */
export interface QualificationResult {
	readonly id: string
	readonly name: string
	readonly eligibility: Eligibility
	readonly scopes: Readonly<Record<string, Eligibility>>
	readonly findings: readonly Finding[]
	readonly derivations: readonly Derivation[]
	readonly success: boolean
	readonly trace: readonly string[]
	readonly errors: readonly string[]
}

/** Represents a coded {@link QualifierError} programmer-error code. */
export type QualifierErrorCode = 'DEFINITION' | 'MISMATCH' | 'DESTROYED' | 'ENGINE'

/**
 * Represents the structured payload a {@link QualifierError} carries.
 *
 * @remarks
 * `pass` names the pass that was running when the engine threw. `definition` names the
 * qualification definition that failed semantic validation. `cause` is the original throw
 * an engine failure wrapped, and stays `unknown` because a thrown value can be anything.
 * Every member is absent rather than `undefined` when the throw does not carry it.
 */
export interface QualifierErrorContext {
	readonly pass?: string
	readonly definition?: string
	readonly cause?: unknown
}

/** Represents the push observation surface of a {@link QualifierInterface} (AGENTS §13). */
export type QualifierEventMap = {
	readonly derive: readonly [derivation: Derivation]
	readonly finding: readonly [finding: Finding]
	readonly qualify: readonly [result: QualificationResult]
	readonly destroy: readonly []
}

/** Carries the options for `createQualifier` / the `Qualifier` constructor. */
export interface QualifierOptions {
	readonly engine?: ReasonInterface
	readonly validate?: boolean
	readonly labels?: Readonly<Record<string, string>>
	readonly on?: EmitterHooks<QualifierEventMap>
	readonly error?: EmitterErrorHandler
}

/** Owns or borrows one reason engine and returns eligibility. */
export interface QualifierInterface {
	/** Holds the typed observation surface carrying `derive`, `finding`, `qualify`, and `destroy`. */
	readonly emitter: EmitterInterface<QualifierEventMap>
	/**
	 * Qualifies one subject against one authored definition.
	 *
	 * @remarks
	 * Semantic validation runs first when the `validate` option is on, so an invalid
	 * definition throws before any pass runs. Passes run in authored order and the
	 * caller's `subject` is never mutated: the working projection under
	 * `QUALIFICATION_KEY` is built copy-on-write and discarded after the call.
	 *
	 * @param subject - The record to qualify
	 * @param definition - The authored qualification definition
	 * @returns A fresh, frozen qualification result
	 * @throws {@link QualifierError} `'DEFINITION'` when validation is enabled and the
	 * definition fails semantic validation, or when the engine rejects a pass as an invalid
	 * definition; `'MISMATCH'` when the subject is not a record or already carries the
	 * reserved `qualification` key; `'DESTROYED'` after `destroy`, or when the engine
	 * reports itself destroyed mid-pass; `'ENGINE'` for every other engine throw
	 *
	 * @example
	 * ```ts
	 * import { createQualifier, qualificationDefinition, rulingDefinition } from '@orkestrel/qualifier'
	 * import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
	 *
	 * const gates = createLogicalDefinition('gates', 'Eligibility gates', [
	 *   createRule('licensed', [createAtom('licensed', 'equals', false)], createAtom('blocked', 'equals', true)),
	 * ])
	 * const definition = qualificationDefinition('standard', 'Standard eligibility', [gates], {
	 *   rulings: [rulingDefinition('license', 'gates', 'licensed', 'restriction')],
	 * })
	 *
	 * const qualifier = createQualifier()
	 * qualifier.qualify({ id: 'risk-1', licensed: false }, definition).eligibility // 'ineligible'
	 * qualifier.destroy()
	 * ```
	 */
	qualify(subject: Subject, definition: QualificationDefinition): QualificationResult
	/**
	 * Validates one authored definition semantically, without running it.
	 *
	 * @remarks
	 * Structural shape is `isQualificationDefinition`'s job. This checks the meaning:
	 * non-empty id and name, valid and uniquely identified passes and rulings, every
	 * ruling reference resolving to a logical pass and one of its rules, and no pass id
	 * shadowing `QUALIFICATION_KEY`. An empty definition, a logical pass carrying no
	 * ruling, and a derivation no later pass reads are warnings rather than errors.
	 *
	 * @param definition - The authored qualification definition
	 * @returns A fresh validation result carrying `valid`, `errors`, and `warnings`
	 * @throws {@link QualifierError} `'DESTROYED'` after `destroy`
	 *
	 * @example
	 * ```ts
	 * import { createQualifier, qualificationDefinition } from '@orkestrel/qualifier'
	 *
	 * const qualifier = createQualifier()
	 * qualifier.validate(qualificationDefinition('empty', 'Empty', []))
	 * // { valid: true, errors: [], warnings: ['Definition has no passes'] }
	 * qualifier.destroy()
	 * ```
	 */
	validate(definition: QualificationDefinition): ReasonValidationResult
	/**
	 * Destroys this qualifier, idempotently.
	 *
	 * @remarks
	 * An owned engine is destroyed; an injected engine stays caller-owned and is left
	 * alone. The `destroy` event fires before the emitter itself is destroyed, and a
	 * later call returns without re-emitting.
	 *
	 * @example
	 * ```ts
	 * import { createQualifier } from '@orkestrel/qualifier'
	 *
	 * const qualifier = createQualifier()
	 * qualifier.destroy()
	 * qualifier.destroy() // idempotent
	 * ```
	 */
	destroy(): void
}
