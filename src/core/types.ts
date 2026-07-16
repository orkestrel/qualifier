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

/** The eligibility outcome axis. */
export type Eligibility = 'eligible' | 'ineligible' | 'referral'

/** An authored ruling's eligibility impact. */
export type QualificationEffect = 'restriction' | 'referral' | 'condition'

/** One ordered derivation or rule pass. */
export type QualificationPass = QuantitativeDefinition | LogicalDefinition

/** One pass's internal working projection. */
export type QualificationProjection = number | boolean | Readonly<Record<string, unknown>>

/** The internal projection record stored under `QUALIFICATION_KEY`. */
export type QualificationContext = Readonly<Record<string, QualificationProjection>>

/** Optional fields accepted by `rulingDefinition`. */
export interface RulingInput {
	readonly scope?: string
	readonly message?: string
}

/** Optional fields accepted by `qualificationDefinition`. */
export interface QualificationInput {
	readonly description?: string
	readonly rulings?: readonly Ruling[]
	readonly metadata?: Readonly<Record<string, JSONValue>>
}

/** An authored consequence for one rule in one logical pass. */
export interface Ruling {
	readonly id: string
	readonly pass: string
	readonly rule: string
	readonly effect: QualificationEffect
	readonly scope?: string
	readonly message?: string
}

/** Display-neutral checked evidence. */
export interface Premise {
	readonly field?: FieldPath
	readonly label?: string
	readonly description?: string
	readonly comparison?: Comparison
	readonly expected?: unknown
	readonly actual?: unknown
	readonly met?: boolean
}

/** One resolved ruling. */
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

/** One quantitative pass's audit result. */
export interface Derivation {
	readonly id: string
	readonly value: number
	readonly success: boolean
	readonly trace: readonly string[]
	readonly errors: readonly string[]
}

/** A pure authored qualification definition. */
export interface QualificationDefinition {
	readonly id: string
	readonly name: string
	readonly description?: string
	readonly passes: readonly QualificationPass[]
	readonly rulings?: readonly Ruling[]
	readonly metadata?: Readonly<Record<string, JSONValue>>
}

/** One subject's complete qualification outcome. */
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

/** Semantic definition validation. */
export type QualificationValidationResult = ReasonValidationResult

/** A coded {@link QualifierError} programmer-error code. */
export type QualifierErrorCode = 'DEFINITION' | 'MISMATCH' | 'DESTROYED' | 'ENGINE'

/** The push observation surface of a {@link QualifierInterface} (AGENTS §13). */
export type QualifierEventMap = {
	readonly derive: readonly [derivation: Derivation]
	readonly finding: readonly [finding: Finding]
	readonly qualify: readonly [result: QualificationResult]
	readonly destroy: readonly []
}

/** Options for `createQualifier` / the `Qualifier` constructor. */
export interface QualifierOptions {
	readonly engine?: ReasonInterface
	readonly validate?: boolean
	readonly labels?: Readonly<Record<string, string>>
	readonly on?: EmitterHooks<QualifierEventMap>
	readonly error?: EmitterErrorHandler
}

/** One qualifier — owns or borrows one reason engine and returns eligibility. */
export interface QualifierInterface {
	readonly emitter: EmitterInterface<QualifierEventMap>
	qualify(subject: Subject, definition: QualificationDefinition): QualificationResult
	validate(definition: QualificationDefinition): QualificationValidationResult
	destroy(): void
}
