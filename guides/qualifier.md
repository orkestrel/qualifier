# Qualifier

> A synchronous, deterministic eligibility engine that runs a pure,
> JSON-serializable `QualificationDefinition`'s ordered `passes` against one
> subject through one `@orkestrel/reason` engine and returns a fresh
> `QualificationResult` carrying global and scoped eligibility, evidence-rich
> `findings`, and quantitative `derivations`.

`Qualifier` stops at eligibility: it reports whether and where a subject may proceed,
and never calculates line amounts, builds worksheets, totals rates, emits notices,
decides authority, or aggregates a batch. Qualification never mutates its inputs, so
every result is a fresh object, and the internal working projection under
`QUALIFICATION_KEY` is discarded after each call and must never be forwarded to a
downstream consumer. A failed qualification, a global `ineligible`, and a global
`referral` are terminal — a caller that runs qualification ahead of a downstream step
stops there. A scoped restriction removes only that named scope from what the caller
selects next, so an excluded scope is never evaluated merely to discard its outcome.
`Qualifier` either receives an injected `ReasonInterface`, which it never destroys, or
builds and owns its own engine (`bail: false`), destroyed in `destroy()`. An injected
engine must be able to dispatch both quantitative and logical definitions — one it
cannot dispatch fails validation as `QualifierError('DEFINITION')`, and with `validate: false` surfaces `QualifierError('ENGINE')` wrapping the engine's throw. Every
`qualify` call fires through `Qualifier`'s typed `emitter`. Source:
[`src/core`](../src/core). Surfaced through the `@src/core` barrel.

## Surface

Create a qualifier, author a definition, and qualify a subject:

```ts
import { createQualificationDefinition, createQualifier, createRuling } from '@orkestrel/qualifier'
import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'

const gates = createLogicalDefinition('gates', 'Eligibility gates', [
	createRule(
		'licensed',
		[createAtom('licensed', 'equals', false)],
		createAtom('blocked', 'equals', true),
	),
])

const definition = createQualificationDefinition('standard', 'Standard eligibility', [gates], {
	rulings: [
		createRuling('license', 'gates', 'licensed', 'restriction', {
			message: 'A license is required',
		}),
	],
})

const qualifier = createQualifier()
const result = qualifier.qualify({ id: 'risk-1', licensed: false }, definition)

result.eligibility // 'ineligible'
result.findings[0]?.message // 'A license is required'
result.derivations // [] — no quantitative pass ran

qualifier.destroy()
```

`qualify` accepts exactly one subject per call — there is no batch-of-subjects
overload. A caller that must qualify many subjects loops and calls `qualify` once
per subject.

### Types

| Name                      | Kind      | Signature                                                                                                                                                                                         | Summary                                                                                              |
| ------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Eligibility`             | type      | `'eligible' \| 'ineligible' \| 'referral'`                                                                                                                                                        | Represents the eligibility outcome axis.                                                             |
| `QualificationEffect`     | type      | `'restriction' \| 'referral' \| 'condition'`                                                                                                                                                      | Represents an authored ruling's eligibility impact.                                                  |
| `QualificationPass`       | type      | `QuantitativeDefinition \| LogicalDefinition`                                                                                                                                                     | Represents one ordered derivation or rule pass.                                                      |
| `QualificationProjection` | type      | `number \| boolean \| Readonly<Record<string, unknown>>`                                                                                                                                          | Represents one pass's internal working projection.                                                   |
| `QualificationContext`    | type      | `Readonly<Record<string, QualificationProjection>>`                                                                                                                                               | Represents the internal projection record stored under `QUALIFICATION_KEY`.                          |
| `RulingInput`             | interface | `{ scope?, message? }`                                                                                                                                                                            | Carries the optional fields `createRuling` accepts.                                                  |
| `QualificationInput`      | interface | `{ description?, rulings?, metadata?, shape? }`                                                                                                                                                   | Carries the optional fields `createQualificationDefinition` accepts.                                 |
| `Ruling`                  | interface | `{ id, pass, rule, effect, scope?, message? }`                                                                                                                                                    | Represents an authored consequence for one rule in one logical pass.                                 |
| `Premise`                 | interface | `{ field?, label?, description?, comparison?, expected?, actual?, state? }`                                                                                                                       | Represents display-neutral evidence for one condition, authored as a checked or a described premise. |
| `Finding`                 | interface | `{ id, pass, rule, effect, scope?, state, message?, premises }`                                                                                                                                   | Represents one resolved ruling.                                                                      |
| `Derivation`              | interface | `{ id, value, success, trace, errors }`                                                                                                                                                           | Represents one quantitative pass's audit result.                                                     |
| `QualificationDefinition` | interface | `{ id, name, description?, passes, rulings?, metadata?, shape? }`                                                                                                                                 | Represents a pure authored qualification definition.                                                 |
| `QualificationResult`     | interface | `{ id, name, eligibility, scopes, findings, derivations, success, trace, errors, faults, repairs, defaulted }`                                                                                    | Represents one subject's complete qualification outcome.                                             |
| `QualifierErrorCode`      | type      | `'DEFINITION' \| 'MISMATCH' \| 'DESTROYED' \| 'ENGINE'`                                                                                                                                           | Represents a coded `QualifierError` programmer-error code.                                           |
| `QualifierErrorContext`   | interface | `{ pass?, definition?, cause? }`                                                                                                                                                                  | Represents the structured payload a `QualifierError` carries.                                        |
| `QualifierEventMap`       | type      | `{ readonly derive: readonly [derivation: Derivation]; readonly finding: readonly [finding: Finding]; readonly qualify: readonly [result: QualificationResult]; readonly destroy: readonly []; }` | Represents the push observation surface of a `QualifierInterface`.                                   |
| `QualifierOptions`        | interface | `{ engine?, validate?, labels?, on?, error? }`                                                                                                                                                    | Carries the options for `createQualifier` and the `Qualifier` constructor.                           |
| `QualifierInterface`      | interface | `{ emitter, qualify(), validate(), destroy() }`                                                                                                                                                   | Owns or borrows one reason engine and returns eligibility.                                           |

Every public data member is `readonly`, every optional key is omitted rather than
`undefined`, and each name is single-word within its entity. Reason
supplies the pass primitives (`QuantitativeDefinition`, `LogicalDefinition`,
`Subject`, `Comparison`) and the `ReasonValidationResult` type `validate` returns;
contract supplies `FieldPath` and `JSONValue`; the emitter supplies the observation
types.

### Constants

| Name                         | Kind  | Signature                                            | Summary                                                                                                                                             |
| ---------------------------- | ----- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QUALIFICATION_EFFECTS`      | const | `readonly ['restriction', 'referral', 'condition']`  | Lists the effects a ruling can carry.                                                                                                               |
| `ELIGIBILITIES`              | const | `readonly ['eligible', 'ineligible', 'referral']`    | Lists the eligibility outcomes.                                                                                                                     |
| `DEFAULT_QUALIFIER_VALIDATE` | const | `true`                                               | Holds the default definition validation policy for `createQualifier` and `Qualifier.qualify`, `true`.                                               |
| `QUALIFICATION_KEY`          | const | `"qualification"`                                    | Names `'qualification'`, the reserved internal projection namespace a pass's working projection is written under.                                   |
| `MESSAGE_TOKEN`              | const | `RegExp`                                             | Matches each `{{dotted.path}}` token of a message template, with the path as its one group.                                                         |
| `ELIGIBILITY_PRECEDENCE`     | const | `readonly Eligibility[]`                             | Lists the eligibility severities most to least severe: `ineligible`, `referral`, `eligible`.                                                        |
| `EFFECT_ELIGIBILITIES`       | const | `Readonly<Record<QualificationEffect, Eligibility>>` | Maps each `QualificationEffect` to its eligibility impact — `restriction` to `ineligible`, `referral` to `referral`, and `condition` to `eligible`. |

`ELIGIBILITY_PRECEDENCE` and `EFFECT_ELIGIBILITIES` are frozen. A `condition` never blocks
its subject, so a conditional ruling contributes evidence without changing eligibility.

### Errors

| Name               | Kind     | Signature                                                                                            | Summary                                                                                                                            |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `QualifierError`   | class    | `new (code: QualifierErrorCode, message: string, context?: QualifierErrorContext) => QualifierError` | Represents a coded programmer error thrown by the qualifier layer, carrying a `QualifierErrorCode` and an optional context record. |
| `isQualifierError` | function | `(value: unknown) => value is QualifierError`                                                        | Narrows a caught value to a `QualifierError`.                                                                                      |

`context` is a `QualifierErrorContext` or `undefined`, so a caught error's payload
needs no narrowing of its own. `ENGINE` marks an underlying reason engine throw that
fits no other code (for example, a missing reasoner with `validate: false`) — `context.pass` names the pass
and `context.cause` preserves the original throw. A `DEFINITION`/`INVALID` or
`DESTROYED` engine throw maps to the matching code instead, and a `DEFINITION` throw
raised by `qualify`'s own validation carries `context.definition`.

The guard recognizes the error's own identity brand across package copies and module
formats. It accepts subclasses regardless of their `name` and refuses transparent
proxies, unbranded look-alikes, and plain branded objects.

```ts
import { isQualifierError, QualifierError } from '@orkestrel/qualifier'

try {
	throw new QualifierError('DESTROYED', 'Qualifier has been destroyed')
} catch (error) {
	if (isQualifierError(error)) {
		error.code // 'DESTROYED'
		error.context // undefined
	}
}

const engine = new QualifierError('ENGINE', "Pass 'gates' engine failure", { pass: 'gates' })
engine.context?.pass // 'gates'
```

### Validators

A validator is exact or open, split by who produces the value. Authored-input guards are exact:
they reject unknown keys because this package owns the stored record. Result guards are open: they
admit unknown members, prototypes, and class instances while checking every published member this
package reads. This matters when a package borrows a `QualifierInterface`; the implementation that
produces `qualify` results may live outside this package. Every validator remains total, refuses
arrays where a record is required, returns `false` for hostile reads, and never throws. A `validate`
result belongs to `@orkestrel/reason`, so narrow one with the `isReasonValidationResult` guard from
that package.

| Name                        | Kind     | Signature                                                                         | Summary                                                                                     |
| --------------------------- | -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `isDefinitionMetadata`      | const    | `import("@orkestrel/contract").Guard<Record<string, unknown>>`                    | Determines whether a value is a definition's `metadata`: a record of JSON values.           |
| `isEligibility`             | const    | `import("@orkestrel/contract").Guard<"eligible" \| "ineligible" \| "referral">`   | Determines whether a value is an `Eligibility` literal.                                     |
| `isQualificationEffect`     | const    | `import("@orkestrel/contract").Guard<"condition" \| "referral" \| "restriction">` | Determines whether a value is a `QualificationEffect` literal.                              |
| `isEligibilityRecord`       | function | `(value: unknown) => value is Readonly<Record<string, Eligibility>>`              | Determines whether a value is an open string-keyed record of `Eligibility` values.          |
| `isPremise`                 | function | `(value: unknown) => value is Premise`                                            | Determines whether a value is an open result-side `Premise`.                                |
| `isFinding`                 | function | `(value: unknown) => value is Finding`                                            | Determines whether a value is an open result-side `Finding`.                                |
| `isDerivation`              | function | `(value: unknown) => value is Derivation`                                         | Determines whether a value is an open result-side `Derivation`.                             |
| `isQualificationResult`     | function | `(value: unknown) => value is QualificationResult`                                | Determines whether a value is an open `QualificationResult` returned by a qualifier.        |
| `isRuling`                  | function | `(value: unknown) => value is Ruling`                                             | Determines whether a value is an exact `Ruling` record.                                     |
| `isQualificationPass`       | function | `(value: unknown) => value is QualificationPass`                                  | Determines whether a value is a `QualificationPass` (a quantitative or logical definition). |
| `isQualificationDefinition` | function | `(value: unknown) => value is QualificationDefinition`                            | Determines whether a value is an exact `QualificationDefinition` record.                    |

```ts
import {
	isEligibility,
	isEligibilityRecord,
	isFinding,
	isDerivation,
	isPremise,
	isQualificationDefinition,
	isQualificationEffect,
	isQualificationPass,
	isQualificationResult,
	isRuling,
} from '@orkestrel/qualifier'
import { createLogicalDefinition } from '@orkestrel/reason'

isEligibility('referral') // true
isQualificationEffect('condition') // true
isEligibilityRecord({ wind: 'ineligible' }) // true
isPremise({ field: 'age', comparison: 'above', actual: 30, state: 'met' }) // true
isFinding({
	id: 'f',
	pass: 'gates',
	rule: 'adult',
	effect: 'condition',
	state: 'met',
	premises: [],
}) // true
isDerivation({ id: 'cap', value: Number.NaN, success: true, trace: [], errors: [] }) // true
isQualificationResult({
	id: 'd',
	name: 'D',
	eligibility: 'eligible',
	scopes: {},
	findings: [],
	derivations: [],
	faults: [],
	repairs: [],
	defaulted: [],
	success: true,
	trace: [],
	errors: [],
}) // true
isQualificationPass(createLogicalDefinition('gates', 'Gates', [])) // true
isRuling({ id: 'r', pass: 'gates', rule: 'licensed', effect: 'restriction' }) // true
isQualificationDefinition({ id: 'd', name: 'D', passes: [] }) // true
```

### Helpers

Pure exported helpers form the functional core. `Qualifier` retains only the ordered
orchestration and ownership lifecycle.

| Name                             | Kind     | Signature                                                                                                                                  | Summary                                                                                                                                                                    |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hasUnreadRule`                  | function | `(result: ReasonResult) => boolean`                                                                                                        | Determines whether a logical result holds a rule left unread.                                                                                                              |
| `describeReservedConclusions`    | function | `(definition: QualificationDefinition) => readonly string[]`                                                                               | Describes each rule concluding `conclusion`, which a pass's projection reserves for itself.                                                                                |
| `findMessageTokens`              | function | `(template: string) => readonly string[]`                                                                                                  | Finds the `{{dotted.path}}` tokens a message template reads.                                                                                                               |
| `readsProjection`                | function | `(field: FieldPath, projections?: readonly string[]) => boolean`                                                                           | Determines whether a field reads a pass's projection under `qualification`, or a key the host projects.                                                                    |
| `scanDefinitionShape`            | function | `(definition: QualificationDefinition, projections?: readonly string[]) => ShapeScan`                                                      | Describes what the definition's shape cannot stand for: a read of a field it does not declare, and the reserved `qualification` key, which a default could otherwise fill. |
| `projectQualificationResult`     | function | `(result: QualificationResult) => JSONValue \| undefined`                                                                                  | Projects a result to the JSON its contract reads.                                                                                                                          |
| `describeUnknownTokens`          | function | `(definition: QualificationDefinition) => readonly string[]`                                                                               | Describes each message token no field of the definition's shape answers.                                                                                                   |
| `expandPassFaults`               | function | `(faults: readonly AuditFault[], unread: ReadonlyMap<string, readonly AuditFault[]>) => readonly AuditFault[]`                             | Replaces a read of an unread pass's projection with what that pass could not read.                                                                                         |
| `interpolateMessage`             | function | `(template: string, subject: Readonly<Record<string, unknown>>) => string`                                                                 | Interpolates `{{dotted.path}}` tokens in a message template against a subject.                                                                                             |
| `renderComparison`               | function | `(comparison: NonNullable<Premise['comparison']>) => string`                                                                               | Renders a `Premise` comparison as a display-neutral verb phrase.                                                                                                           |
| `renderValue`                    | function | `(value: unknown) => string`                                                                                                               | Renders a structured or scalar expected value display-neutrally.                                                                                                           |
| `renderPremise`                  | function | `(entry: Premise, labels?: Readonly<Record<string, string>>) => string`                                                                    | Renders one `Premise` into a display-neutral sentence.                                                                                                                     |
| `checkToPremise`                 | function | `(check: Check, result: CheckResult, labels?: Readonly<Record<string, string>>) => Premise`                                                | Builds a `Premise` from an authored `Check` and its evaluated `CheckResult`.                                                                                               |
| `ruleToPremises`                 | function | `(rule: Rule, resolved: RuleResult \| undefined, labels?: Readonly<Record<string, string>>) => readonly Premise[]`                         | Builds rich premises for one fired `Rule` by walking its premise atoms and reading each from what the rule read.                                                           |
| `findRule`                       | function | `(definition: LogicalDefinition, id: string) => Rule \| undefined`                                                                         | Locates an authored `Rule` by id.                                                                                                                                          |
| `reasonResultToProjection`       | function | `(definition: QualificationPass, result: ReasonResult) => QualificationProjection`                                                         | Projects one reason result into the internal qualification namespace.                                                                                                      |
| `quantitativeResultToDerivation` | function | `(id: string, result: QuantitativeResult) => Derivation`                                                                                   | Projects a quantitative result into a `Derivation` audit record.                                                                                                           |
| `qualificationToRecord`          | function | `(context: QualificationContext) => Readonly<Record<string, QualificationContext>>`                                                        | Wraps a `QualificationContext` under `QUALIFICATION_KEY`.                                                                                                                  |
| `mergeQualificationContext`      | function | `(context: QualificationContext, id: string, projection: QualificationProjection) => QualificationContext`                                 | Merges one pass projection into the context, copy-on-write.                                                                                                                |
| `rulingToFinding`                | function | `(ruling: Ruling, pass: QualificationPass, result: LogicalResult, subject: Subject, labels?: Readonly<Record<string, string>>) => Finding` | Joins a ruling, its logical rule result, the pass, and the pre-projection subject into a `Finding`.                                                                        |
| `deriveFindingEligibility`       | function | `(findings: readonly Finding[], failed?: boolean) => Eligibility`                                                                          | Derives global eligibility from unscoped findings whose rule is met.                                                                                                       |
| `combineEligibilities`           | function | `(eligibilities: readonly Eligibility[]) => Eligibility`                                                                                   | Returns the most severe `Eligibility` in a list.                                                                                                                           |
| `deriveScopeEligibilities`       | function | `(findings: readonly Finding[]) => Readonly<Record<string, Eligibility>>`                                                                  | Derives one eligibility per finding scope.                                                                                                                                 |
| `describeMissingReferences`      | function | `(definition: QualificationDefinition) => readonly string[]`                                                                               | Describes each ruling whose pass or rule does not exist or whose pass is not logical, and each pass id shadowing the reserved `QUALIFICATION_KEY`.                         |
| `hasReservedKey`                 | function | `(subject: Subject) => boolean`                                                                                                            | Determines whether a subject already owns the reserved `QUALIFICATION_KEY`.                                                                                                |
| `assertSubject`                  | function | `(value: unknown) => asserts value is Subject`                                                                                             | Asserts a value is a valid qualification `Subject`, narrowing it in place.                                                                                                 |
| `mapEngineError`                 | function | `(error: unknown, pass: string) => QualifierError`                                                                                         | Maps an engine throw caught while running one pass to a typed `QualifierError`.                                                                                            |
| `describeEmptyLogicalPasses`     | function | `(definition: QualificationDefinition) => readonly string[]`                                                                               | Describes each logical pass carrying no rulings.                                                                                                                           |
| `describeUnreadDerivations`      | function | `(definition: QualificationDefinition) => readonly string[]`                                                                               | Describes each quantitative pass never read by a later pass.                                                                                                               |

Every helper carries a worked `@example` in source and is composed by `Qualifier`
rather than reimplemented by it.

The projection and derivation core turns one reason result into a working projection,
a `Derivation`, and — for logical passes — findings and eligibility:

```ts
import {
	createRuling,
	deriveFindingEligibility,
	deriveScopeEligibilities,
	mergeQualificationContext,
	qualificationToRecord,
	quantitativeResultToDerivation,
	reasonResultToProjection,
	rulingToFinding,
} from '@orkestrel/qualifier'
import {
	createAtom,
	createFactorGroup,
	createLogicalDefinition,
	createLogicalReasoner,
	createQuantitativeDefinition,
	createQuantitativeReasoner,
	createReason,
	createRule,
	createStaticFactor,
} from '@orkestrel/reason'

const engine = createReason({
	reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
	bail: false,
})

const cap = createQuantitativeDefinition('cap', 'TIV cap', [
	createFactorGroup('limit', 'sum', [createStaticFactor('base', 500_000)]),
])
const gates = createLogicalDefinition('gates', 'Eligibility gates', [
	createRule(
		'licensed',
		[createAtom('licensed', 'equals', false)],
		createAtom('blocked', 'equals', true),
	),
])

const subject = { licensed: false }

// A quantitative pass projects its numeric value under the pass id, and audits as a Derivation.
const capResult = engine.reason(subject, cap)
const context = mergeQualificationContext({}, 'cap', reasonResultToProjection(cap, capResult))
qualificationToRecord(context) // { qualification: { cap: 500000 } }
if (capResult.reasoning === 'quantitative') {
	quantitativeResultToDerivation('cap', capResult) // { id: 'cap', value: 500000, success: true, ... }
}

// A logical pass joins each ruling to a Finding, then eligibility follows by severity.
const gatesResult = engine.reason(subject, gates)
if (gatesResult.reasoning === 'logical') {
	const ruling = createRuling('license', 'gates', 'licensed', 'restriction')
	const finding = rulingToFinding(ruling, gates, gatesResult, subject)
	deriveFindingEligibility([finding]) // 'ineligible'
	deriveScopeEligibilities([finding]) // {} — the finding is unscoped
}
```

The projections stay inside the qualification namespace and the working subject is
discarded after each call. The reference-describing and subject-guard helpers back
`validate` and the reserved-key rejection:

```ts
import {
	assertSubject,
	createQualificationDefinition,
	createRuling,
	describeMissingReferences,
	hasReservedKey,
} from '@orkestrel/qualifier'
import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'

const gates = createLogicalDefinition('gates', 'Eligibility gates', [
	createRule(
		'licensed',
		[createAtom('licensed', 'equals', false)],
		createAtom('blocked', 'equals', true),
	),
])
const definition = createQualificationDefinition('standard', 'Standard', [gates], {
	rulings: [createRuling('license', 'gates', 'absent', 'restriction')],
})

describeMissingReferences(definition)
// ["Ruling 'license' references missing rule 'absent' in pass 'gates'"]
hasReservedKey({ id: 's1', qualification: {} }) // true
assertSubject({ id: 's1' }) // narrows to Subject; throws QualifierError('MISMATCH') on a reserved key
```

### Factories

| Name                                    | Kind     | Signature                                                                                                                 | Summary                                                                                       |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `createQualificationDefinitionContract` | function | `() => ContractInterface<unknown>`                                                                                        | Creates the contract of a `QualificationDefinition`, its `schema` for an LLM, a tool, or MCP. |
| `createQualifier`                       | function | `(options?: QualifierOptions) => QualifierInterface`                                                                      | Creates one `QualifierInterface` over a reason engine.                                        |
| `createQualificationDefinition`         | function | `(id: string, name: string, passes: readonly QualificationPass[], input?: QualificationInput) => QualificationDefinition` | Creates a fresh `QualificationDefinition`, omitting every absent optional key.                |
| `createRuling`                          | function | `(id: string, pass: string, rule: string, effect: QualificationEffect, input?: RulingInput) => Ruling`                    | Creates a fresh `Ruling` from the rule it reacts to and the effect it applies.                |

#### Create a qualifier

This fence adds to the quickstart what the factory family itself contributes: the
optional `message` and `rulings` inputs, and the fresh value each factory returns
with every absent optional key omitted.

```ts
import { createQualificationDefinition, createQualifier, createRuling } from '@orkestrel/qualifier'
import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'

const gates = createLogicalDefinition('gates', 'Eligibility gates', [
	createRule(
		'licensed',
		[createAtom('licensed', 'equals', false)],
		createAtom('blocked', 'equals', true),
	),
])

const bare = createRuling('license', 'gates', 'licensed', 'restriction')
const messaged = createRuling('license', 'gates', 'licensed', 'restriction', {
	message: 'A license is required',
})

'message' in bare // false — an absent optional key is omitted, never written as undefined
messaged.message // 'A license is required'

const passes = [gates]
const definition = createQualificationDefinition('standard', 'Standard eligibility', passes, {
	rulings: [messaged],
})

'description' in definition // false
definition.passes === passes // false — the factory copies what it is handed

const qualifier = createQualifier()
qualifier.qualify({ id: 'risk-1', licensed: false }, definition)
qualifier.destroy()
```

Every factory returns a fresh value and omits absent optional keys.

### Shapes

The definition and result as `ContractShape` values.

| Name                                 | Kind     | Signature             | Summary                                                                               |
| ------------------------------------ | -------- | --------------------- | ------------------------------------------------------------------------------------- |
| `qualificationResultShape`           | const    | `ContractShape`       | Describes a `QualificationResult` in its JSON projection.                             |
| `derivationShape`                    | const    | `ContractShape`       | Describes a `Derivation` in its JSON projection, where a non-finite number is `null`. |
| `findingShape`                       | const    | `ContractShape`       | Describes a `Finding` in its JSON projection.                                         |
| `premiseShape`                       | const    | `ContractShape`       | Describes a `Premise` in its JSON projection.                                         |
| `createQualificationDefinitionShape` | function | `() => ContractShape` | Creates the shape of a `QualificationDefinition`.                                     |
| `rulingShape`                        | const    | `ContractShape`       | Describes a `Ruling`.                                                                 |

### Contracts

The compiled contract of what is flat enough to compile at import.

| Name                          | Kind  | Signature                    | Summary                                                                                                       |
| ----------------------------- | ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `qualificationResultContract` | const | `ContractInterface<unknown>` | Publishes a `QualificationResult`'s JSON projection as a contract, read through `projectQualificationResult`. |

### Classes

| Name        | Kind  | Signature                                                | Summary                                                             |
| ----------- | ----- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| `Qualifier` | class | `new (options?: QualifierOptions) => QualifierInterface` | Runs ordered passes over one reason engine and returns eligibility. |

## Methods

#### `QualifierInterface`

`qualify` takes exactly one subject and one definition — there is no
batch-of-subjects overload. `destroy` destroys the reason engine only when the
qualifier created it; an injected engine remains caller-owned. The emitter is
destroyed last.

| Method     | Returns                  | Summary                                                             |
| ---------- | ------------------------ | ------------------------------------------------------------------- |
| `qualify`  | `QualificationResult`    | Qualifies one subject against one authored definition.              |
| `validate` | `ReasonValidationResult` | Validates one authored definition semantically, without running it. |
| `destroy`  | `void`                   | Destroys this qualifier, idempotently.                              |

```ts
import { createQualificationDefinition, createQualifier, createRuling } from '@orkestrel/qualifier'
import { createAtom, createLogicalDefinition, createRule } from '@orkestrel/reason'

const gates = createLogicalDefinition('gates', 'Eligibility gates', [
	createRule(
		'licensed',
		[createAtom('licensed', 'equals', false)],
		createAtom('blocked', 'equals', true),
	),
])
const definition = createQualificationDefinition('standard', 'Standard eligibility', [gates], {
	rulings: [createRuling('license', 'gates', 'licensed', 'restriction')],
})

const qualifier = createQualifier()

qualifier.validate(definition) // { valid: true, errors: [], warnings: [] }
qualifier.qualify({ id: 'a', licensed: false }, definition) // eligibility: 'ineligible'
qualifier.destroy()
```

## Contract

### Qualification order

Pass order is load-bearing.

1. Admit the subject through the definition's `shape`, when it carries one. A refusal returns a `referral` result naming each fault, and no pass runs.
2. Begin with a fresh working subject copied from what the door admitted.
3. Run the first pass through the shared reason engine.
4. Resolve rulings against what each rule read: a premise comes from the rule's own `checks`, so a key derived in the same pass reads as the rule saw it.
5. Project a settled pass under `qualification[pass.id]`. A pass left unread projects nothing.
6. Rebuild the working subject copy-on-write for later passes.
7. Continue with the next pass, unless an error no fault can say or an unscoped restriction stopped the run.
8. Derive global eligibility, scoped eligibility, and success.
9. Return a fresh result and discard the working subject.

A quantitative pass exposes its numeric value directly:

```ts
qualification.cap // 500000
```

A logical pass exposes a record containing `conclusion` and its conclusion fields: a fired rule's values, and `false` for a key only unfired rules conclude, so a later read of it settles. `conclusion` is the pass's own, so `validate` refuses a rule concluding it:

```ts
qualification.gates // { conclusion: true, blocked: true }
```

Author qualification conclusion fields as flat string keys. `reason` formats an array-path conclusion into one dotted key, so an array-path conclusion does not create a nested object in the projection.

Nested reads use `FieldPath` arrays:

```ts
createAtom(['qualification', 'cap'], 'below', 1_000_000)
```

A dotted string remains one literal field key and is not equivalent.

### Eligibility

Global eligibility is derived only from **unscoped** findings whose rule is `met`:

| Effect        | Eligibility  |
| ------------- | ------------ |
| `restriction` | `ineligible` |
| `referral`    | `referral`   |
| `condition`   | `eligible`   |

A failed pass adds a synthetic referral impact. Operational failure is therefore
fail-closed: a subject with incomplete eligibility evidence must not proceed to
any downstream decision step.

A pass left `unread` is that failure too, and it does not stop the run, because a later
restriction can still outrank its referral. `faults` names each input the run could not read,
and a later pass reading the unread pass's projection reports what that pass could not read,
so a caller asks one question per missing input. A finding on an `unread` rule carries
`state: 'unread'`, and its premises show which reads were missing. An error no fault can say,
such as an ordering on a conclusion no rule derived, stops the run.

Severity is deterministic:

```text
ineligible > referral > eligible
```

The qualifier may stop after an unscoped restriction because no later finding can
be more severe. It must not stop after a referral if later passes can still establish
an ineligible restriction.

### Scopes

A ruling with no `scope` affects global eligibility — whether the caller may
proceed past qualification for the whole subject. A ruling with a `scope` affects
only that named scope.

```ts
createRuling('coastal-wind', 'wind-gates', 'coastal', 'restriction', {
	scope: 'wind',
	message: 'Wind coverage is unavailable in the coastal band',
})
```

The result is explicit:

```ts
result.eligibility // 'eligible'
result.scopes.wind // 'ineligible'
```

The caller removes `wind` from the selected scope ids before any downstream
step. It does not evaluate the wind scope and then suppress its outcome.

A missing scope entry means `eligible`. A scoped `condition` leaves the scope
eligible and contributes evidence a later consumer may act on.

### Publishing definitions and results

`createQualificationDefinitionContract()` publishes a definition, its `schema` for an LLM, a tool, or MCP. Cross a definition on `is`, never `parse`, and hold the result, because building it walks the recursive expressions of its logical passes. The contract validates a nested `shape` through `shapeShape`, so both its `is` method and the `isQualificationDefinition` guard refuse a malformed declaration such as `shape: 42`. A result crosses as `projectQualificationResult`, which `qualificationResultContract` admits, because a premise's `actual` holds whatever the subject held and a derivation's `value` may be `NaN`.

### Validation

Structural validation and semantic validation remain separate.

`isQualificationDefinition` checks exact record shape. `Qualifier.validate` checks:

- non-empty definition id and name
- each pass is a valid quantitative or logical definition
- each ruling is a well-formed ruling record
- unique pass ids
- unique ruling ids
- every ruling references an existing pass
- every ruling references a logical pass
- every ruling references an existing rule in that pass
- no pass id equals `QUALIFICATION_KEY`
- the engine's own deep validation of each pass, whose errors and warnings carry the pass id
- no pass carries a `shape`, because the subject a pass reads holds `qualification` too
- no rule concludes `conclusion`, which a pass's projection reserves for itself
- a `shape` on the definition can stand, does not declare `qualification`, declares every field a pass reads outside `qualification`, and declares every token a ruling's message reads
- `metadata` is a record of JSON values
- warnings for definitions with no passes
- warnings for logical passes with no rulings
- warnings for quantitative derivations never read by a later pass

`qualify` throws `QualifierError('DEFINITION')` for a semantically invalid authored
definition when `validate` is enabled, and remembers a valid definition by identity, so one
edited in place is not validated again. A pass whose reasoning the engine has no reasoner for fails that validation, so `qualify` throws `DEFINITION`, and with `validate: false` the same pass throws `ENGINE` when it runs. A malformed reason result is an operational
qualification failure and returns a referral result instead of throwing. A
definition with no passes is valid (a warning only) — every subject the door admits qualifies
vacuously eligible against it.

## Patterns

### Quantitative derivation before logical eligibility

The common pattern is to derive a threshold, derive the excess, then evaluate rules.
The derived values remain inside the qualifier namespace.

```ts
import { createQualificationDefinition, createQualifier, createRuling } from '@orkestrel/qualifier'
import {
	createAtom,
	createFactorGroup,
	createFieldFactor,
	createLogicalDefinition,
	createQuantitativeDefinition,
	createRule,
	createStaticFactor,
	createTransform,
} from '@orkestrel/reason'

const cap = createQuantitativeDefinition('cap', 'TIV cap', [
	createFactorGroup('limit', 'sum', [createStaticFactor('base', 1_000_000)]),
])

const excess = createQuantitativeDefinition('excess', 'TIV excess', [
	createFactorGroup('amount', 'sum', [
		createFieldFactor('total', 'total'),
		createFieldFactor('cap', ['qualification', 'cap'], {
			transforms: [createTransform('multiply', -1)],
		}),
	]),
])

const gates = createLogicalDefinition('gates', 'Eligibility gates', [
	createRule(
		'tiv',
		[createAtom(['qualification', 'excess'], 'above', 0)],
		createAtom('blocked', 'equals', true),
	),
])

const definition = createQualificationDefinition(
	'property',
	'Property eligibility',
	[cap, excess, gates],
	{
		rulings: [
			createRuling('tiv', 'gates', 'tiv', 'restriction', {
				message: 'TIV exceeds the maximum',
			}),
		],
	},
)

const qualifier = createQualifier()
const result = qualifier.qualify({ total: 1_250_000 }, definition)

result.eligibility // 'ineligible'
result.derivations.map((entry) => [entry.id, entry.value])
// [['cap', 1000000], ['excess', 250000]]
```

The caller's subject stays `{ total: 1_250_000 }` — not polluted with `cap`,
`excess`, `blocked`, rule ids, or internal projection fields.

### Scoped exclusion

A scope is an opaque string to the qualifier. The caller is responsible for
matching scope ids to whatever it selects for downstream work.

```ts
const wind = createLogicalDefinition('wind', 'Wind eligibility', [
	createRule('coastal', [createAtom('distance', 'to', 2)], createAtom('blocked', 'equals', true)),
])

const definition = createQualificationDefinition('property', 'Property eligibility', [wind], {
	rulings: [
		createRuling('coastal', 'wind', 'coastal', 'restriction', {
			scope: 'wind',
			message: 'Wind coverage is unavailable within two miles of saltwater',
		}),
	],
})

const result = qualifier.qualify({ distance: 1.5 }, definition)

result.eligibility // 'eligible'
result.scopes.wind // 'ineligible'
```

The caller then filters by scoped eligibility:

```ts
const selected = items.filter((item) => {
	const eligibility = result.scopes[item.id]
	return eligibility === undefined || eligibility === 'eligible'
})
```

### Conditions do not block downstream work

A conditional ruling is authored like a blocking one, with a scope and a message:

```ts
const condition = createRuling('vacant', 'gates', 'vacant', 'condition', {
	scope: 'exWind',
	message: 'Vacancy terms apply',
})
```

A condition whose rule is `met` produces:

```ts
result.scopes.exWind // 'eligible'
result.findings.find((finding) => finding.id === 'vacant')?.effect // 'condition'
```

A `condition` does not block qualification for its scope — it surfaces evidence
only. Any downstream status derived from that evidence is outside this package.

### Referral blocks downstream work

A referral ruling names the review a subject needs, and takes no scope here:

```ts
const referral = createRuling('roof', 'gates', 'roof', 'referral', {
	message: 'Roof age requires manual review',
})
```

An unscoped referral whose rule is `met` returns `eligibility: 'referral'`. A caller that runs
qualification ahead of a downstream step must treat that outcome as terminal and
skip that step.

### Engine injection

A standalone `Qualifier` creates and owns a reason engine containing quantitative and
logical reasoners, destroying it on `destroy()`. When a caller composes multiple
packages over one engine it injects that engine through the `engine` option; an
injected engine is caller-owned and never destroyed by the qualifier. This mirrors
`QualifierOptions.engine` and the `#owned` flag on the implementation.

```ts
import { createLogicalReasoner, createQuantitativeReasoner, createReason } from '@orkestrel/reason'
import { createQualifier } from '@orkestrel/qualifier'

const engine = createReason({
	reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
	bail: false,
})

const qualifier = createQualifier({ engine })
qualifier.destroy() // does not destroy the injected engine
engine.destroy()
```

Premise evidence comes from the `checks` each rule result carries, so a finding can never
disagree with the pass that produced it, whether the engine is owned or injected.

The `labels` option overrides the display name a premise field renders under. Key it by
the dot-joined field path — `age`, `qualification.cap` — and the override wins over the
premise's own `label`, which in turn wins over the raw path.

### Observing

The `on` option carries the initial emitter hooks, and `error` handles a listener
throw:

```ts
const qualifier = createQualifier({
	on: {
		derive: (derivation) => audit.record('derive', derivation.id),
		finding: (finding) => audit.record('finding', finding.id),
		qualify: (result) => audit.record('qualify', result.eligibility),
	},
	error: (error, event) => logger.warn(event, error),
})
```

Events are synchronous and observational. A throwing listener is isolated by the
emitter and never changes qualification semantics.

### Caller composition

Qualification is typically the first step in a larger pipeline. The caller owns
orchestration — `Qualifier` only reports eligibility:

```ts
const qualification = qualifier.qualify(subject, definition)

if (!qualification.success || qualification.eligibility !== 'eligible') {
	return { qualification }
}

const selected = items.filter((item) => {
	const eligibility = qualification.scopes[item.id]
	return eligibility === undefined || eligibility === 'eligible'
})

return { qualification, selected }
```

When `qualification.eligibility` is not `'eligible'`, the caller skips downstream
work. That skip is auditable proof that eligibility stopped the pipeline.

### Batch aggregates

When qualification must consider totals across many subjects, the caller builds a
temporary aggregate subject for `qualify` and still passes the original subject to
any downstream step:

```ts
const qualified = {
	...subject,
	aggregate: {
		count: subjects.length,
		sums,
	},
}

const qualification = qualifier.qualify(qualified, definition)
```

`aggregate`, `outcome`, tallies, notices, authority, status, and decision never
belong in the qualification subject the caller forwards downstream.

### Scoped eligibility drives selection

A single qualification definition can carry both global gates and per-scope scoped
rulings. Scoped restrictions remove only the named scope before downstream work; a
global restriction stops the pipeline entirely.

```ts
const definition = createQualificationDefinition(
	'property',
	'Property eligibility',
	[cap, excess, wind, gates],
	{
		rulings: [
			createRuling('frame', 'wind', 'frame', 'restriction', {
				scope: 'wind',
				message: 'No wind coverage for Frame construction',
			}),
			createRuling('saltwater', 'wind', 'saltwater', 'restriction', {
				scope: 'wind',
				message: 'No wind coverage within two miles of saltwater',
			}),
			createRuling('excluded', 'gates', 'excluded', 'restriction', {
				message: 'Occupancy type is ineligible',
			}),
		],
	},
)
```

The caller never evaluates an excluded scope merely to discard its outcome:

```ts
const result = qualifier.qualify(subject, definition)

if (result.eligibility !== 'eligible') {
	return { qualification: result }
}

const selected = ['wind', 'exWind'].filter((id) => {
	const eligibility = result.scopes[id]
	return eligibility === undefined || eligibility === 'eligible'
})
// ['exWind'] when wind is scoped ineligible
```

No synthetic `windBlocked` field enters the caller's subject, and no downstream work
runs for a scope the qualifier already excluded.

## Tests

Tests mirror the source structure and drive real reasoners.

- [`tests/src/core/Qualifier.test.ts`](../tests/src/core/Qualifier.test.ts) — proves pass
  order, terminal and scoped eligibility, the untouched caller subject, fresh frozen
  results, reserved-key rejection, semantic validation, engine ownership, event order and
  listener isolation, and each `QualifierError` code.
- [`tests/src/core/helpers.test.ts`](../tests/src/core/helpers.test.ts) — proves each
  exported helper alone: interpolation, premise rendering, projection, derivation, finding
  and eligibility derivation, reference and warning messages, and engine-error mapping.
- [`tests/src/core/validators.test.ts`](../tests/src/core/validators.test.ts) — proves each
  guard's posture against cyclic, deeply nested, and prototype-hostile records.
- [`tests/src/core/factories.test.ts`](../tests/src/core/factories.test.ts) — proves each
  factory returns a fresh value, copies what the caller supplies, and omits every absent
  optional key.
- [`tests/setup.test.ts`](../tests/setup.test.ts) — proves the shared fixtures the suites
  are built on: the qualification definition builders, the adversarial records, the
  orderings builder, and the failing engine.
- [`tests/guides.test.ts`](../tests/guides.test.ts) — proves this guide against the barrel:
  every documented name resolves, every export is documented, each flagship fence returns the
  value its comments claim, and the equality gate holds — every `Summary` cell against its
  declaration's description paragraph, the titled `Create a qualifier` fence against the
  `@example` block of that title (pinned so the titled pair cannot be retired silently), and
  the README pitch against this guide's tagline.

## Practices

- Qualify before any downstream work or decision step.
- Treat `success: false` as terminal and fail closed to referral, and ask for what `faults` names.
- Use unscoped rulings for global eligibility and scoped rulings for per-scope selection.
- Keep quantitative derivations under `qualification`; never flatten them onto the caller's subject.
- Pass the original subject to downstream consumers — never the working projection.
- Let the caller own aggregation, notices, authority, status, and decision.
- Inject one shared reason engine when composing multiple packages over the same engine.
- Validate untrusted definitions structurally, then semantically.
- Store plain definitions and results, never live entities.
- Destroy owned entities and emitters in dependency order.
- Add no compatibility aliases or cross-package re-exports.
