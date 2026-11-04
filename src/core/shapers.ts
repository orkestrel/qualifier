import type { ContractShape } from '@orkestrel/contract'
import {
	arrayShape,
	auditFaultShape,
	shapeShape,
	jsonShape,
	literalShape,
	nullableShape,
	numberShape,
	objectShape,
	optionalShape,
	recordShape,
	stringShape,
	booleanShape,
	unionShape,
} from '@orkestrel/contract'
import {
	CHECK_STATES,
	COMPARISONS,
	createLogicalDefinitionShape,
	fieldPathShape,
	quantitativeDefinitionShape,
} from '@orkestrel/reason'
import { ELIGIBILITIES, QUALIFICATION_EFFECTS } from './constants.js'

// A qualification definition and result as shapes, so they reach an LLM, a tool, and MCP as JSON
// Schema. A definition holds logical passes, whose recursive expressions `reason` builds behind a
// function, so the definition's shape is behind one too and an import pays nothing for it.

/** Describes a `Ruling`. */
export const rulingShape: ContractShape = objectShape({
	id: stringShape(),
	pass: stringShape(),
	rule: stringShape(),
	effect: literalShape(QUALIFICATION_EFFECTS),
	scope: optionalShape(stringShape()),
	message: optionalShape(stringShape()),
})

/**
 * Creates the shape of a `QualificationDefinition`.
 *
 * @remarks
 * `shape` is checked as a recursive contract shape.
 *
 * @returns A shape holding quantitative and logical passes and rulings
 *
 * @example
 * ```ts
 * import { createContract } from '@orkestrel/contract'
 * import { createQualificationDefinition, createQualificationDefinitionShape } from '@orkestrel/qualifier'
 *
 * createContract(createQualificationDefinitionShape()).is(createQualificationDefinition('d', 'd', [])) // true
 * ```
 */
export function createQualificationDefinitionShape(): ContractShape {
	return objectShape({
		id: stringShape(),
		name: stringShape(),
		description: optionalShape(stringShape()),
		passes: arrayShape(unionShape(quantitativeDefinitionShape, createLogicalDefinitionShape())),
		rulings: optionalShape(arrayShape(rulingShape)),
		metadata: optionalShape(recordShape(jsonShape())),
		shape: optionalShape(shapeShape()),
	})
}

/** Describes a `Premise` in its JSON projection. */
export const premiseShape: ContractShape = objectShape({
	field: optionalShape(fieldPathShape),
	label: optionalShape(stringShape()),
	description: optionalShape(stringShape()),
	comparison: optionalShape(literalShape(COMPARISONS)),
	expected: optionalShape(jsonShape()),
	actual: optionalShape(jsonShape()),
	state: optionalShape(literalShape(CHECK_STATES)),
})

/** Describes a `Finding` in its JSON projection. */
export const findingShape: ContractShape = objectShape({
	id: stringShape(),
	pass: stringShape(),
	rule: stringShape(),
	effect: literalShape(QUALIFICATION_EFFECTS),
	scope: optionalShape(stringShape()),
	state: literalShape(CHECK_STATES),
	message: optionalShape(stringShape()),
	premises: arrayShape(premiseShape),
})

/** Describes a `Derivation` in its JSON projection, where a non-finite number is `null`. */
export const derivationShape: ContractShape = objectShape({
	id: stringShape(),
	value: nullableShape(numberShape()),
	success: booleanShape(),
	trace: arrayShape(stringShape()),
	errors: arrayShape(stringShape()),
})

/** Describes a `QualificationResult` in its JSON projection. */
export const qualificationResultShape: ContractShape = objectShape({
	id: stringShape(),
	name: stringShape(),
	eligibility: literalShape(ELIGIBILITIES),
	scopes: recordShape(literalShape(ELIGIBILITIES)),
	findings: arrayShape(findingShape),
	derivations: arrayShape(derivationShape),
	success: booleanShape(),
	trace: arrayShape(stringShape()),
	errors: arrayShape(stringShape()),
	faults: arrayShape(auditFaultShape()),
	repairs: arrayShape(auditFaultShape()),
	defaulted: arrayShape(fieldPathShape),
})
