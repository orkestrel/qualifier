import type {
	Derivation,
	Finding,
	QualificationContext,
	QualificationDefinition,
	QualificationPass,
	QualificationResult,
	QualifierEventMap,
	QualifierInterface,
	QualifierOptions,
} from './types.js'
import type { AuditFault } from '@orkestrel/contract'
import type { EmitterInterface } from '@orkestrel/emitter'
import type {
	ReasonInterface,
	ReasonResult,
	ReasonValidationResult,
	Subject,
	SubjectAdmission,
} from '@orkestrel/reason'
import { DEFAULT_QUALIFIER_VALIDATE } from './constants.js'
import { QualifierError } from './errors.js'
import {
	assertSubject,
	describeEmptyLogicalPasses,
	describeMissingReferences,
	describeUnknownTokens,
	describeUnreadDerivations,
	deriveFindingEligibility,
	deriveScopeEligibilities,
	expandPassFaults,
	mapEngineError,
	mergeQualificationContext,
	qualificationToRecord,
	quantitativeResultToDerivation,
	reasonResultToProjection,
	rulingToFinding,
} from './helpers.js'
import { isQualificationPass, isRuling } from './validators.js'
import { Emitter } from '@orkestrel/emitter'
import {
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
	createSubjectDoor,
	describeFault,
	scanShape,
	findDuplicates,
} from '@orkestrel/reason'

/**
 * Runs ordered passes over one reason engine and returns eligibility.
 *
 * @remarks
 * The engine is owned when self-created (destroyed on `destroy()`) and borrowed
 * when injected (never destroyed). Semantic validation runs before the first pass
 * whenever the `validate` option is on. `qualify` builds its working subject through
 * copy-on-write overlays only — the caller's `subject` is never mutated, and the
 * qualifier's internal projection is discarded after each call.
 */
export class Qualifier implements QualifierInterface {
	readonly #emitter: Emitter<QualifierEventMap>
	readonly #engine: ReasonInterface
	readonly #owned: boolean
	readonly #validate: boolean
	readonly #labels: Readonly<Record<string, string>> | undefined
	readonly #door = createSubjectDoor()
	readonly #valid = new WeakSet<QualificationDefinition>()
	#destroyed = false

	constructor(options?: QualifierOptions) {
		this.#emitter = new Emitter({
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
		this.#owned = options?.engine === undefined
		this.#engine =
			options?.engine ??
			createReason({
				reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
				bail: false,
			})
		this.#validate = options?.validate ?? DEFAULT_QUALIFIER_VALIDATE
		this.#labels = options?.labels
	}

	/**
	 * Holds the typed observation surface carrying `derive`, `finding`, `qualify`, and
	 * `destroy`.
	 *
	 * @returns The emitter this qualifier owns
	 *
	 * @example
	 * ```ts
	 * import { Qualifier } from '@orkestrel/qualifier'
	 *
	 * const qualifier = new Qualifier()
	 * qualifier.emitter.on('qualify', (result) => console.log(result.eligibility))
	 * qualifier.destroy()
	 * ```
	 */
	get emitter(): EmitterInterface<QualifierEventMap> {
		return this.#emitter
	}

	/**
	 * Qualifies one subject against one authored definition.
	 *
	 * @remarks
	 * Semantic validation runs first when the `validate` option is on, so an invalid
	 * definition throws before any pass runs. Passes run in authored order over a
	 * copy-on-write working subject, and the caller's `subject` is never mutated. A
	 * `shape` on the definition admits the subject through a door first. An unscoped
	 * restriction stops the remaining passes because no later finding can be more severe.
	 * A pass left unread projects nothing and reads `referral`, and the run goes on, so a later
	 * restriction can still outrank it. An error no fault can say stops the run.
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
	 * import { createQualificationDefinition, createRuling, Qualifier } from '@orkestrel/qualifier'
	 * import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'
	 *
	 * const gates = createLogicalDefinition('gates', 'Eligibility gates', [
	 *   createRule('licensed', [createAtom('licensed', 'equals', false)], createAtom('blocked', 'equals', true)),
	 * ])
	 * const definition = createQualificationDefinition('standard', 'Standard eligibility', [gates], {
	 *   rulings: [createRuling('license', 'gates', 'licensed', 'restriction')],
	 * })
	 *
	 * const qualifier = new Qualifier()
	 * qualifier.qualify({ id: 'risk-1', licensed: false }, definition).eligibility // 'ineligible'
	 * qualifier.destroy()
	 * ```
	 */
	qualify(subject: Subject, definition: QualificationDefinition): QualificationResult {
		this.#alive()
		if (this.#validate && !this.#valid.has(definition)) {
			const validation = this.validate(definition)
			if (!validation.valid) {
				throw new QualifierError(
					'DEFINITION',
					`Qualification definition is invalid: ${validation.errors.join(', ')}`,
					{ definition: definition.id },
				)
			}
			this.#valid.add(definition)
		}
		return this.#qualify(subject, definition)
	}

	/**
	 * Validates one authored definition semantically, without running it.
	 *
	 * @remarks
	 * Structural shape is `isQualificationDefinition`'s job. This checks the meaning:
	 * non-empty id and name, valid and uniquely identified passes and rulings, every
	 * ruling reference resolving to a logical pass and one of its rules, and no pass id
	 * shadowing `QUALIFICATION_KEY`. The engine validates each pass, whose errors carry the
	 * pass id. A pass may carry no shape, and a `shape` on the definition must stand and
	 * declare every message token. An empty definition, a logical pass carrying no ruling,
	 * and a derivation no later pass reads are warnings rather than errors.
	 *
	 * @param definition - The authored qualification definition
	 * @returns A fresh validation result carrying `valid`, `errors`, and `warnings`
	 * @throws {@link QualifierError} `'DESTROYED'` after `destroy`
	 *
	 * @example
	 * ```ts
	 * import { createQualificationDefinition, Qualifier } from '@orkestrel/qualifier'
	 *
	 * const qualifier = new Qualifier()
	 * qualifier.validate(createQualificationDefinition('empty', 'Empty', []))
	 * // { valid: true, errors: [], warnings: ['Definition has no passes'] }
	 * qualifier.destroy()
	 * ```
	 */
	validate(definition: QualificationDefinition): ReasonValidationResult {
		this.#alive()
		const errors: string[] = []
		const warnings: string[] = []
		if (definition.id.length === 0) errors.push('Definition id must not be empty')
		if (definition.name.length === 0) errors.push('Definition name must not be empty')
		definition.passes.forEach((pass, index) => {
			if (!isQualificationPass(pass)) {
				errors.push(`Pass at index ${index} is not a valid qualification pass`)
				return
			}
			if (pass.shape !== undefined) errors.push(`Pass '${pass.id}' may not carry a shape`)
			const validation = this.#validatePass(pass)
			for (const error of validation.errors) errors.push(`${pass.id}: ${error}`)
			for (const warning of validation.warnings) warnings.push(`${pass.id}: ${warning}`)
		})
		;(definition.rulings ?? []).forEach((ruling, index) => {
			if (!isRuling(ruling)) errors.push(`Ruling at index ${index} is not a valid ruling`)
		})
		for (const id of findDuplicates(definition.passes)) errors.push(`Duplicate pass id '${id}'`)
		for (const id of findDuplicates(definition.rulings ?? [])) {
			errors.push(`Duplicate ruling id '${id}'`)
		}
		for (const reference of describeMissingReferences(definition)) errors.push(reference)
		if (definition.shape !== undefined) errors.push(...scanShape(definition.shape))
		errors.push(...describeUnknownTokens(definition))
		if (definition.passes.length === 0) warnings.push('Definition has no passes')
		for (const warning of describeEmptyLogicalPasses(definition)) warnings.push(warning)
		for (const warning of describeUnreadDerivations(definition)) warnings.push(warning)
		return { valid: errors.length === 0, errors, warnings }
	}

	/**
	 * Destroys this qualifier, idempotently.
	 *
	 * @remarks
	 * An engine this qualifier created is destroyed; an injected engine stays
	 * caller-owned and is left alone. The `destroy` event fires before the emitter
	 * itself is destroyed, and a later call returns without re-emitting.
	 *
	 * @example
	 * ```ts
	 * import { Qualifier } from '@orkestrel/qualifier'
	 *
	 * const qualifier = new Qualifier()
	 * qualifier.destroy()
	 * qualifier.destroy() // idempotent
	 * ```
	 */
	destroy(): void {
		if (this.#destroyed) return
		if (this.#owned) this.#engine.destroy()
		this.#destroyed = true
		this.#emitter.emit('destroy')
		this.#emitter.destroy()
	}

	#qualify(subject: Subject, definition: QualificationDefinition): QualificationResult {
		assertSubject(subject)
		const admission = this.#door.admit(subject, definition.shape)
		const admitted = admission.subject
		if (admitted === undefined) {
			return this.#finish(
				definition,
				[],
				[],
				[],
				[...admission.errors],
				admission.faults,
				admission,
			)
		}
		const steps: Array<{
			readonly context: QualificationContext
			readonly subject: Subject
			readonly success: boolean
		}> = [{ context: {}, subject: { ...admitted }, success: true }]
		const findings: Finding[] = []
		const derivations: Derivation[] = []
		const trace: string[] = []
		const errors: string[] = []
		const faults: AuditFault[] = []
		const unread = new Map<string, readonly AuditFault[]>()

		for (const pass of definition.passes) {
			this.#alive()
			const previous = steps.at(-1)
			if (previous === undefined) throw new Error('Qualification has no initial step')
			const evaluated = previous.subject
			const result = this.#reason(evaluated, pass)

			trace.push(...result.trace.map((entry) => `${pass.id}: ${entry}`))
			// A fault's own string is written once at the end, after a read of an unread pass has
			// become what that pass could not read. What no fault can say stays here.
			const said = new Set(result.faults.map((fault) => describeFault(fault)))
			const fatal = result.errors.filter((entry) => !said.has(entry))
			errors.push(...fatal.map((entry) => `${pass.id}: ${entry}`))
			faults.push(...result.faults)
			if (result.faults.length > 0) unread.set(pass.id, result.faults)

			if (result.reasoning === 'quantitative') {
				const derivation = quantitativeResultToDerivation(pass.id, result)
				derivations.push(derivation)
				this.#emitter.emit('derive', derivation)
			}

			if (result.reasoning === 'logical') {
				const rulings = (definition.rulings ?? []).filter((ruling) => ruling.pass === pass.id)
				for (const ruling of rulings) {
					const finding = rulingToFinding(ruling, pass, result, evaluated, this.#labels)
					findings.push(finding)
					this.#emitter.emit('finding', finding)
				}
			}

			// An unread pass projects nothing and the run goes on, so a later restriction can still
			// outrank the referral it reads as. An error no fault can say stops the run.
			const context = result.success
				? mergeQualificationContext(
						previous.context,
						pass.id,
						reasonResultToProjection(pass, result),
					)
				: previous.context
			steps.push({
				context,
				subject: { ...admitted, ...qualificationToRecord(context) },
				success: result.success,
			})

			if (fatal.length > 0) break
			if (deriveFindingEligibility(findings) === 'ineligible') break
		}

		const leaves = expandPassFaults(faults, unread)
		return this.#finish(
			definition,
			findings,
			derivations,
			trace,
			[...errors, ...leaves.map((fault) => describeFault(fault))],
			leaves,
			admission,
		)
	}

	#finish(
		definition: QualificationDefinition,
		findings: readonly Finding[],
		derivations: readonly Derivation[],
		trace: readonly string[],
		errors: readonly string[],
		faults: readonly AuditFault[],
		admission: SubjectAdmission,
	): QualificationResult {
		const success = errors.length === 0
		const qualification: QualificationResult = Object.freeze({
			id: definition.id,
			name: definition.name,
			eligibility: deriveFindingEligibility(findings, !success),
			scopes: Object.freeze(deriveScopeEligibilities(findings)),
			findings: Object.freeze(findings),
			derivations: Object.freeze(derivations),
			success,
			trace: Object.freeze(trace),
			errors: Object.freeze(errors),
			faults: Object.freeze(faults),
			repairs: admission.repairs,
			defaulted: admission.defaulted,
		})
		this.#emitter.emit('qualify', qualification)
		return qualification
	}

	#validatePass(pass: QualificationPass): ReasonValidationResult {
		try {
			return this.#engine.validate(pass)
		} catch (error) {
			throw mapEngineError(error, pass.id)
		}
	}

	#reason(subject: Subject, pass: QualificationPass): ReasonResult {
		try {
			return this.#engine.reason(subject, pass)
		} catch (error) {
			throw mapEngineError(error, pass.id)
		}
	}

	#alive(): void {
		if (this.#destroyed) {
			throw new QualifierError('DESTROYED', 'Qualifier has been destroyed')
		}
	}
}
