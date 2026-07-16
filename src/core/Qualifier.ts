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
import type { EvaluatorInterface, ReasonInterface, Subject } from '@orkestrel/reason'
import { DEFAULT_QUALIFIER_VALIDATE } from './constants.js'
import { QualifierError } from './errors.js'
import {
	assertSubject,
	deriveFindingEligibility,
	deriveScopeEligibilities,
	findDuplicateIds,
	findMissingReferences,
	mergeQualificationContext,
	qualificationToRecord,
	quantitativeResultToDerivation,
	reasonResultToProjection,
	rulingToFinding,
} from './helpers.js'
import { Emitter } from '@orkestrel/emitter'
import {
	createEvaluator,
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
} from '@orkestrel/reason'

/**
 * A qualifier — runs ordered passes over one reason engine and returns
 * pre-rating eligibility.
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
		this.#emitter = new Emitter({ on: options?.on, error: options?.error })
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

	get emitter(): EmitterInterface<QualifierEventMap> {
		return this.#emitter
	}

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

	validate(definition: QualificationDefinition): QualificationValidationResult {
		this.#alive()
		const errors: string[] = []
		const warnings: string[] = []
		if (definition.id.length === 0) errors.push('Definition id must not be empty')
		if (definition.name.length === 0) errors.push('Definition name must not be empty')
		if (definition.passes.length === 0) warnings.push('Definition has no passes')
		for (const id of findDuplicateIds(definition.passes.map((pass) => pass.id))) {
			errors.push(`Duplicate pass id '${id}'`)
		}
		for (const id of findDuplicateIds((definition.rulings ?? []).map((ruling) => ruling.id))) {
			errors.push(`Duplicate ruling id '${id}'`)
		}
		for (const reference of findMissingReferences(definition)) errors.push(reference)
		return { valid: errors.length === 0, errors, warnings }
	}

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
			const evaluated = working
			const result = this.#engine.reason(evaluated, pass)

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
		const qualification: QualificationResult = {
			id: definition.id,
			name: definition.name,
			eligibility: deriveFindingEligibility(findings, !success),
			scopes: deriveScopeEligibilities(findings),
			findings,
			derivations,
			success,
			trace,
			errors,
		}
		this.#emitter.emit('qualify', qualification)
		return qualification
	}

	#alive(): void {
		if (this.#destroyed) {
			throw new QualifierError('DESTROYED', 'Qualifier has been destroyed')
		}
	}
}
