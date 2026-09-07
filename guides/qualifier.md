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
cannot dispatch surfaces `QualifierError('ENGINE')` wrapping the engine's throw. Every
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

A `Shape` cell holds an interface's data members as bare names in braces, `?` marking an optional member and `plus` introducing its call-signature members, and a type alias's own type literal with a union's arms escaped as `\|`.

| Type                      | Kind      | Shape                                                                              | Summary                                                                                              |
| ------------------------- | --------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Eligibility`             | type      | `'eligible' \| 'ineligible' \| 'referral'`                                         | Represents the eligibility outcome axis.                                                             |
| `QualificationEffect`     | type      | `'restriction' \| 'referral' \| 'condition'`                                       | Represents an authored ruling's eligibility impact.                                                  |
| `QualificationPass`       | type      | `QuantitativeDefinition \| LogicalDefinition`                                      | Represents one ordered derivation or rule pass.                                                      |
| `QualificationProjection` | type      | `number \| boolean \| Readonly<Record<string, unknown>>`                           | Represents one pass's internal working projection.                                                   |
| `QualificationContext`    | type      | `Readonly<Record<string, QualificationProjection>>`                                | Represents the internal projection record stored under `QUALIFICATION_KEY`.                          |
| `RulingInput`             | interface | `{ scope?, message? }`                                                             | Carries the optional fields `createRuling` accepts.                                                  |
| `QualificationInput`      | interface | `{ description?, rulings?, metadata? }`                                            | Carries the optional fields `createQualificationDefinition` accepts.                                 |
| `Ruling`                  | interface | `{ id, pass, rule, effect, scope?, message? }`                                     | Represents an authored consequence for one rule in one logical pass.                                 |
| `Premise`                 | interface | `{ field?, label?, description?, comparison?, expected?, actual?, met? }`          | Represents display-neutral evidence for one condition, authored as a checked or a described premise. |
| `Finding`                 | interface | `{ id, pass, rule, effect, scope?, applied, message?, premises }`                  | Represents one resolved ruling.                                                                      |
| `Derivation`              | interface | `{ id, value, success, trace, errors }`                                            | Represents one quantitative pass's audit result.                                                     |
| `QualificationDefinition` | interface | `{ id, name, description?, passes, rulings?, metadata? }`                          | Represents a pure authored qualification definition.                                                 |
| `QualificationResult`     | interface | `{ id, name, eligibility, scopes, findings, derivations, success, trace, errors }` | Represents one subject's complete qualification outcome.                                             |
| `QualifierErrorCode`      | type      | `'DEFINITION' \| 'MISMATCH' \| 'DESTROYED' \| 'ENGINE'`                            | Represents a coded `QualifierError` programmer-error code.                                           |
| `QualifierErrorContext`   | interface | `{ pass?, definition?, cause? }`                                                   | Represents the structured payload a `QualifierError` carries.                                        |
| `QualifierEventMap`       | type      | `{ derive, finding, qualify, destroy }`                                            | Represents the push observation surface of a `QualifierInterface`.                                   |
| `QualifierOptions`        | interface | `{ engine?, validate?, labels?, on?, error? }`                                     | Carries the options for `createQualifier` and the `Qualifier` constructor.                           |
| `QualifierInterface`      | interface | `{ emitter } plus qualify, validate, destroy`                                      | Owns or borrows one reason engine and returns eligibility.                                           |

Every public data member is `readonly`, every optional key is omitted rather than
`undefined`, and each name is single-word within its entity. Reason
supplies the pass primitives (`QuantitativeDefinition`, `LogicalDefinition`,
`Subject`, `Comparison`) and the `ReasonValidationResult` type `validate` returns;
contract supplies `FieldPath` and `JSONValue`; the emitter supplies the observation
types.

### Constants

A `Shape` cell holds the constant's declared type.

| API                          | Kind  | Shape                                                | Summary                                                                                                                                             |
| ---------------------------- | ----- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_QUALIFIER_VALIDATE` | const | `boolean`                                            | Holds the default definition validation policy for `createQualifier` and `Qualifier.qualify`, `true`.                                               |
| `QUALIFICATION_KEY`          | const | `string`                                             | Names the reserved internal projection namespace a pass's working projection is written under, `'qualification'`.                                   |
| `ELIGIBILITY_PRECEDENCE`     | const | `readonly Eligibility[]`                             | Lists the eligibility severities most to least severe: `ineligible`, `referral`, `eligible`.                                                        |
| `EFFECT_ELIGIBILITIES`       | const | `Readonly<Record<QualificationEffect, Eligibility>>` | Maps each `QualificationEffect` to its eligibility impact — `restriction` to `ineligible`, `referral` to `referral`, and `condition` to `eligible`. |

`ELIGIBILITY_PRECEDENCE` and `EFFECT_ELIGIBILITIES` are frozen. A `condition` never blocks
its subject, so a conditional ruling contributes evidence without changing eligibility.

### Errors

| API                | Kind     | Summary                                                                                                                            |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `QualifierError`   | class    | Represents a coded programmer error thrown by the qualifier layer, carrying a `QualifierErrorCode` and an optional context record. |
| `isQualifierError` | function | Narrows a caught value to a `QualifierError`.                                                                                      |

`context` is a `QualifierErrorContext` or `undefined`, so a caught error's payload
needs no narrowing of its own. `ENGINE` marks an underlying reason engine throw that
fits no other code (for example, a missing reasoner) — `context.pass` names the pass
and `context.cause` preserves the original throw. A `DEFINITION`/`INVALID` or
`DESTROYED` engine throw maps to the matching code instead, and a `DEFINITION` throw
raised by `qualify`'s own validation carries `context.definition`.

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

A `Shape` cell holds an interface's data members as bare names in braces, `?` marking an optional member and `plus` introducing its call-signature members, and a type alias's own type literal with a union's arms escaped as `\|`. In a guard table a `Shape` cell holds the type the guard narrows to.

| API                         | Kind     | Shape                                   | Summary                                                                                     |
| --------------------------- | -------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `isEligibility`             | const    | `Eligibility`                           | Determines whether a value is an `Eligibility` literal.                                     |
| `isQualificationEffect`     | const    | `QualificationEffect`                   | Determines whether a value is a `QualificationEffect` literal.                              |
| `isEligibilityRecord`       | function | `Readonly<Record<string, Eligibility>>` | Determines whether a value is an open string-keyed record of `Eligibility` values.          |
| `isPremise`                 | function | `Premise`                               | Determines whether a value is an open result-side `Premise`.                                |
| `isFinding`                 | function | `Finding`                               | Determines whether a value is an open result-side `Finding`.                                |
| `isDerivation`              | function | `Derivation`                            | Determines whether a value is an open result-side `Derivation`.                             |
| `isQualificationResult`     | function | `QualificationResult`                   | Determines whether a value is an open `QualificationResult` returned by a qualifier.        |
| `isRuling`                  | function | `Ruling`                                | Determines whether a value is an exact `Ruling` record.                                     |
| `isQualificationPass`       | function | `QualificationPass`                     | Determines whether a value is a `QualificationPass` (a quantitative or logical definition). |
| `isQualificationDefinition` | function | `QualificationDefinition`               | Determines whether a value is an exact `QualificationDefinition` record.                    |

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
isPremise({ field: 'age', comparison: 'above', actual: 30, met: true }) // true
isFinding({
	id: 'f',
	pass: 'gates',
	rule: 'adult',
	effect: 'condition',
	applied: true,
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

| API                              | Kind     | Summary                                                                                                                                            |
| -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interpolateMessage`             | function | Interpolates `{{dotted.path}}` tokens in a message template against a subject.                                                                     |
| `renderComparison`               | function | Renders a `Premise` comparison as a display-neutral verb phrase.                                                                                   |
| `renderValue`                    | function | Renders a structured or scalar expected value display-neutrally.                                                                                   |
| `renderPremise`                  | function | Renders one `Premise` into a display-neutral sentence.                                                                                             |
| `checkToPremise`                 | function | Builds a `Premise` from an authored `Check` and its evaluated `CheckResult`.                                                                       |
| `ruleToPremises`                 | function | Builds rich premises for one fired `Rule` by walking its premise atoms and re-evaluating each against the working subject.                         |
| `findRule`                       | function | Locates an authored `Rule` by id.                                                                                                                  |
| `reasonResultToProjection`       | function | Projects one reason result into the internal qualification namespace.                                                                              |
| `quantitativeResultToDerivation` | function | Projects a quantitative result into a `Derivation` audit record.                                                                                   |
| `qualificationToRecord`          | function | Wraps a `QualificationContext` under `QUALIFICATION_KEY`.                                                                                          |
| `mergeQualificationContext`      | function | Merges one pass projection into the context, copy-on-write.                                                                                        |
| `rulingToFinding`                | function | Joins a ruling, its logical rule result, the pass, the pre-projection subject, and an evaluator into a `Finding`.                                  |
| `deriveFindingEligibility`       | function | Derives global eligibility from applied, unscoped findings.                                                                                        |
| `combineEligibilities`           | function | Returns the most severe `Eligibility` in a list.                                                                                                   |
| `deriveScopeEligibilities`       | function | Derives one eligibility per finding scope.                                                                                                         |
| `describeMissingReferences`      | function | Describes each ruling whose pass or rule does not exist or whose pass is not logical, and each pass id shadowing the reserved `QUALIFICATION_KEY`. |
| `hasReservedKey`                 | function | Determines whether a subject already owns the reserved `QUALIFICATION_KEY`.                                                                        |
| `assertSubject`                  | function | Asserts a value is a valid qualification `Subject`, narrowing it in place.                                                                         |
| `mapEngineError`                 | function | Maps an engine throw caught while running one pass to a typed `QualifierError`.                                                                    |
| `describeEmptyLogicalPasses`     | function | Describes each logical pass carrying no rulings.                                                                                                   |
| `describeUnreadDerivations`      | function | Describes each quantitative pass never read by a later pass.                                                                                       |

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
	createEvaluator,
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
const evaluator = createEvaluator()

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
	const finding = rulingToFinding(ruling, gates, gatesResult, subject, evaluator)
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

| API                             | Kind     | Summary                                                                        |
| ------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `createQualifier`               | function | Creates one `QualifierInterface` over a reason engine.                         |
| `createQualificationDefinition` | function | Creates a fresh `QualificationDefinition`, omitting every absent optional key. |
| `createRuling`                  | function | Builds a fresh `Ruling` from the rule it reacts to and the effect it applies.  |

#### Create a qualifier

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
qualifier.qualify({ id: 'risk-1', licensed: false }, definition)
qualifier.destroy()
```

Every factory returns a fresh value and omits absent optional keys.

### Classes

| API         | Kind  | Summary                                                             |
| ----------- | ----- | ------------------------------------------------------------------- |
| `Qualifier` | class | Runs ordered passes over one reason engine and returns eligibility. |

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

1. Begin with a fresh working subject copied from the caller's subject.
2. Run the first pass through the shared reason engine.
3. Resolve rulings against the exact subject snapshot the pass evaluated.
4. Project the result under `qualification[pass.id]`.
5. Rebuild the working subject copy-on-write for later passes.
6. Continue with the next pass.
7. Derive global eligibility, scoped eligibility, and success.
8. Return a fresh result and discard the working subject.

A quantitative pass exposes its numeric value directly:

```ts
qualification.cap // 500000
```

A logical pass exposes a record containing `conclusion` and applied conclusion fields:

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

Global eligibility is derived only from **unscoped** applied findings:

| Effect        | Eligibility  |
| ------------- | ------------ |
| `restriction` | `ineligible` |
| `referral`    | `referral`   |
| `condition`   | `eligible`   |

A failed pass adds a synthetic referral impact. Operational failure is therefore
fail-closed: a subject with incomplete eligibility evidence must not proceed to
any downstream decision step.

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
- warnings for definitions with no passes
- warnings for logical passes with no rulings
- warnings for quantitative derivations never read by a later pass

`qualify` throws `QualifierError('DEFINITION')` for a semantically invalid authored
definition when `validate` is enabled. A malformed reason result is an operational
qualification failure and returns a referral result instead of throwing. A
definition with no passes is valid (a warning only) — every subject qualifies
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

```ts
const condition = createRuling('vacant', 'gates', 'vacant', 'condition', {
	scope: 'exWind',
	message: 'Vacancy terms apply',
})
```

An applied condition produces:

```ts
result.scopes.exWind // 'eligible'
result.findings.find((finding) => finding.id === 'vacant')?.effect // 'condition'
```

A `condition` does not block qualification for its scope — it surfaces evidence
only. Any downstream status derived from that evidence is outside this package.

### Referral blocks downstream work

```ts
const referral = createRuling('roof', 'gates', 'roof', 'referral', {
	message: 'Roof age requires manual review',
})
```

An unscoped applied referral returns `eligibility: 'referral'`. A caller that runs
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

Premise evidence is rendered through an internal, stateless `@orkestrel/reason`
evaluator (`createEvaluator()`). Because that evaluator is deterministic and holds no
state, a finding can never disagree with the pass that produced it, whether the engine
is owned or injected — so there is no separate `evaluator` option to keep in sync.

The `labels` option overrides the display name a premise field renders under. Key it by
the dot-joined field path — `age`, `qualification.cap` — and the override wins over the
premise's own `label`, which in turn wins over the raw path.

### Observing

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
- Treat `success: false` as terminal and fail closed to referral.
- Use unscoped rulings for global eligibility and scoped rulings for per-scope selection.
- Keep quantitative derivations under `qualification`; never flatten them onto the caller's subject.
- Pass the original subject to downstream consumers — never the working projection.
- Let the caller own aggregation, notices, authority, status, and decision.
- Inject one shared reason engine when composing multiple packages over the same engine.
- Validate untrusted definitions structurally, then semantically.
- Store plain definitions and results, never live entities.
- Destroy owned entities and emitters in dependency order.
- Add no compatibility aliases or cross-package re-exports.
