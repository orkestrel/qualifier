import type {
	Derivation,
	Finding,
	QualificationContext,
	QualificationDefinition,
	QualificationResult,
	QualificationValidationResult,
	QualifierEventMap,
	QualifierInterface,
	QualifierOptions,
} from './types.js'
import type { EmitterInterface } from '@orkestrel/emitter'
import type { EvaluatorInterface, ReasonInterface, ReasonResult, Subject } from '@orkestrel/reason'
import { DEFAULT_QUALIFIER_VALIDATE } from './constants.js'
import { QualifierError } from './errors.js'
import {
	assertSubject,
	deriveFindingEligibility,
	deriveScopeEligibilities,
	findEmptyLogicalPasses,
	findMissingReferences,
	findUnreadDerivations,
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
	createEvaluator,
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
	findDuplicates,
} from '@orkestrel/reason'

/**
 * A qualifier — runs ordered passes over one reason engine and returns
 * eligibility.
 *
 * @remarks
 * The engine is OWNED when self-created (destroyed on `destroy()`) and borrowed
 * when injected (never destroyed). `qualify` builds its working subject through
 * copy-on-write overlays only — the caller's `subject` is never mutated, and the
 * qualifier's internal projection is discarded after each call.
 */
export class Qualifier implements QualifierInterface {
	readonly #emitter: Emitter<QualifierEventMap>
	readonly #engine: ReasonInterface
	readonly #evaluator: EvaluatorInterface
	readonly #owned: boolean
	readonly #validate: boolean
	readonly #labels: Readonly<Record<string, string>> | undefined
	#destroyed = false

	constructor(options?: QualifierOptions) {
		this.#emitter = new Emitter({
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
		this.#evaluator = createEvaluator()
		this.#owned = options?.engine === undefined
		this.#engine =
			options?.engine ??
			createReason({
				reasoners: [
					createQuantitativeReasoner({ evaluator: this.#evaluator }),
					createLogicalReasoner({ evaluator: this.#evaluator }),
				],
				bail: false,
			})
		this.#validate = options?.validate ?? DEFAULT_QUALIFIER_VALIDATE
		this.#labels = options?.labels
	}

	/**
	 * The typed observation surface carrying `derive`, `finding`, `qualify`, and
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
	 * copy-on-write working subject, and the caller's `subject` is never mutated. An
	 * unscoped restriction stops the remaining passes because no later finding can be
	 * more severe.
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
	 * import { qualificationDefinition, Qualifier, rulingDefinition } from '@orkestrel/qualifier'
	 * import { atom, logicalDefinition, rule } from '@orkestrel/reason'
	 *
	 * const gates = logicalDefinition('gates', 'Eligibility gates', [
	 *   rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
	 * ])
	 * const definition = qualificationDefinition('standard', 'Standard eligibility', [gates], {
	 *   rulings: [rulingDefinition('license', 'gates', 'licensed', 'restriction')],
	 * })
	 *
	 * const qualifier = new Qualifier()
	 * qualifier.qualify({ id: 'risk-1', licensed: false }, definition).eligibility // 'ineligible'
	 * qualifier.destroy()
	 * ```
	 */
	qualify(subject: Subject, definition: QualificationDefinition): QualificationResult {
		this.#alive()
		if (this.#validate) {
			const validation = this.validate(definition)
			if (!validation.valid) {
				throw new QualifierError(
					'DEFINITION',
					`Qualification definition is invalid: ${validation.errors.join(', ')}`,
					definition.id,
				)
			}
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
	 * shadowing `QUALIFICATION_KEY`. An empty definition, a logical pass carrying no
	 * ruling, and a derivation no later pass reads are warnings rather than errors.
	 *
	 * @param definition - The authored qualification definition
	 * @returns A fresh validation result carrying `valid`, `errors`, and `warnings`
	 * @throws {@link QualifierError} `'DESTROYED'` after `destroy`
	 *
	 * @example
	 * ```ts
	 * import { qualificationDefinition, Qualifier } from '@orkestrel/qualifier'
	 *
	 * const qualifier = new Qualifier()
	 * qualifier.validate(qualificationDefinition('empty', 'Empty', []))
	 * // { valid: true, errors: [], warnings: ['Definition has no passes'] }
	 * qualifier.destroy()
	 * ```
	 */
	validate(definition: QualificationDefinition): QualificationValidationResult {
		this.#alive()
		const errors: string[] = []
		const warnings: string[] = []
		if (definition.id.length === 0) errors.push('Definition id must not be empty')
		if (definition.name.length === 0) errors.push('Definition name must not be empty')
		definition.passes.forEach((pass, index) => {
			if (!isQualificationPass(pass)) {
				errors.push(`Pass at index ${index} is not a valid qualification pass`)
			}
		})
		;(definition.rulings ?? []).forEach((ruling, index) => {
			if (!isRuling(ruling)) errors.push(`Ruling at index ${index} is not a valid ruling`)
		})
		for (const id of findDuplicates(definition.passes)) errors.push(`Duplicate pass id '${id}'`)
		for (const id of findDuplicates(definition.rulings ?? [])) {
			errors.push(`Duplicate ruling id '${id}'`)
		}
		for (const reference of findMissingReferences(definition)) errors.push(reference)
		if (definition.passes.length === 0) warnings.push('Definition has no passes')
		for (const warning of findEmptyLogicalPasses(definition)) warnings.push(warning)
		for (const warning of findUnreadDerivations(definition)) warnings.push(warning)
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
		let context: QualificationContext = {}
		let working: Subject = { ...subject }
		const findings: Finding[] = []
		const derivations: Derivation[] = []
		const trace: string[] = []
		const errors: string[] = []
		let failed = false

		for (const pass of definition.passes) {
			this.#alive()
			const evaluated = working
			let result: ReasonResult
			try {
				result = this.#engine.reason(evaluated, pass)
			} catch (error) {
				throw mapEngineError(error, pass.id)
			}

			trace.push(...result.trace.map((entry) => `${pass.id}: ${entry}`))
			errors.push(...result.errors.map((entry) => `${pass.id}: ${entry}`))

			if (result.reasoning === 'quantitative') {
				const derivation = quantitativeResultToDerivation(pass.id, result)
				derivations.push(derivation)
				this.#emitter.emit('derive', derivation)
			}

			if (result.reasoning === 'logical') {
				const rulings = (definition.rulings ?? []).filter((ruling) => ruling.pass === pass.id)
				for (const ruling of rulings) {
					const finding = rulingToFinding(
						ruling,
						pass,
						result,
						evaluated,
						this.#evaluator,
						this.#labels,
					)
					findings.push(finding)
					this.#emitter.emit('finding', finding)
				}
			}

			const projection = reasonResultToProjection(pass, result)
			context = mergeQualificationContext(context, pass.id, projection)
			working = { ...subject, ...qualificationToRecord(context) }

			if (!result.success) {
				failed = true
				break
			}
			if (deriveFindingEligibility(findings) === 'ineligible') break
		}

		const success = !failed && errors.length === 0
		const scopes = deriveScopeEligibilities(findings)
		const qualification: QualificationResult = Object.freeze({
			id: definition.id,
			name: definition.name,
			eligibility: deriveFindingEligibility(findings, !success),
			scopes: Object.freeze(scopes),
			findings: Object.freeze(findings),
			derivations: Object.freeze(derivations),
			success,
			trace: Object.freeze(trace),
			errors: Object.freeze(errors),
		})
		this.#emitter.emit('qualify', qualification)
		return qualification
	}

	#alive(): void {
		if (this.#destroyed) {
			throw new QualifierError('DESTROYED', 'Qualifier has been destroyed')
		}
	}
}
