# Qualifier

> A synchronous, deterministic **eligibility engine**.
> Pure, JSON-serializable `QualificationDefinition`s contain ordered `passes`
> (`quantitative` derivations and `logical` rulings) and are evaluated against
> subjects through one injected `@orkestrel/reason` engine. The result is a fresh
> `QualificationResult` with global `eligibility`, optional scoped eligibility,
> evidence-rich `findings`, quantitative `derivations`, a trace, and accumulated
> errors.
>
> `Qualifier` stops at eligibility — it reports whether and where a subject may
> proceed, never calculates line amounts, builds worksheets, totals rates, emits
> notices, decides authority, or aggregates a batch. Qualification never mutates
> its inputs: every result is a fresh object. The internal working projection under
> `QUALIFICATION_KEY` is discarded after each call and must never be forwarded to
> a downstream consumer. A failed qualification, global
> `ineligible`, or global `referral` is terminal for any caller that qualifies
> for any downstream consumer; a scoped restriction removes only that named scope from whatever
> the caller selects next, so an excluded scope is never evaluated merely to
> produce an omitted outcome.
>
> `Qualifier` either receives an injected `ReasonInterface` (never destroyed by
> `Qualifier`) or builds and OWNS its own engine (`bail: false`), destroyed in
> `destroy()`. An injected engine MUST be able to dispatch both quantitative and
> logical definitions — one it cannot dispatch surfaces `QualifierError('ENGINE')`
> wrapping the engine's throw. Every `qualify` call fires through `Qualifier`'s
> typed `emitter` (AGENTS §13). Source: [`src/core`](../../src/core). Surfaced
> through the `@src/core` barrel.

## Surface

Create a qualifier, author a definition, and qualify a subject:

```ts
import { createQualifier, qualificationDefinition, rulingDefinition } from '@orkestrel/qualifier'
import { atom, logicalDefinition, rule } from '@orkestrel/reason'

const gates = logicalDefinition('gates', 'Eligibility gates', [
	rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
])

const definition = qualificationDefinition('standard', 'Standard eligibility', [gates], {
	rulings: [
		rulingDefinition('license', 'gates', 'licensed', 'restriction', {
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

`qualify` accepts exactly ONE subject per call — there is no batch-of-subjects
overload. A caller that must qualify many subjects loops and calls `qualify` once
per subject.

### Types

| Type                            | Kind      | Shape                                                                                                                              |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Eligibility`                   | type      | `'eligible' \| 'ineligible' \| 'referral'` — the eligibility outcome axis.                                                         |
| `QualificationEffect`           | type      | `'restriction' \| 'referral' \| 'condition'` — an authored ruling's eligibility impact.                                            |
| `QualificationPass`             | type      | `QuantitativeDefinition \| LogicalDefinition` — one ordered derivation or rule pass.                                               |
| `QualificationProjection`       | type      | `number \| boolean \| Readonly<Record<string, unknown>>` — one pass's internal working projection.                                 |
| `QualificationContext`          | type      | `Readonly<Record<string, QualificationProjection>>` — the internal projection record stored under `QUALIFICATION_KEY`.             |
| `RulingInput`                   | interface | `{ scope?, message? }` — optional fields accepted by `rulingDefinition`.                                                           |
| `QualificationInput`            | interface | `{ description?, rulings?, metadata? }` — optional fields accepted by `qualificationDefinition`.                                   |
| `Ruling`                        | interface | `{ id, pass, rule, effect, scope?, message? }` — an authored consequence for one rule in one logical pass.                         |
| `Premise`                       | interface | `{ field?, label?, description?, comparison?, expected?, actual?, met? }` — display-neutral checked evidence.                      |
| `Finding`                       | interface | `{ id, pass, rule, effect, scope?, applied, message?, premises }` — one resolved ruling.                                           |
| `Derivation`                    | interface | `{ id, value, success, trace, errors }` — one quantitative pass's audit result.                                                    |
| `QualificationDefinition`       | interface | `{ id, name, description?, passes, rulings?, metadata? }` — a pure authored qualification definition.                              |
| `QualificationResult`           | interface | `{ id, name, eligibility, scopes, findings, derivations, success, trace, errors }` — one subject's complete qualification outcome. |
| `QualificationValidationResult` | type      | `{ valid, errors, warnings }` — semantic definition validation.                                                                    |
| `QualifierErrorCode`            | type      | `'DEFINITION' \| 'MISMATCH' \| 'DESTROYED' \| 'ENGINE'` — programmer-error codes.                                                  |
| `QualifierEventMap`             | type      | `derive(derivation)` · `finding(finding)` · `qualify(result)` · `destroy()`.                                                       |
| `QualifierOptions`              | interface | `{ engine?, validate?, labels?, on?, error? }` — input to `createQualifier`.                                                       |
| `QualifierInterface`            | interface | `emitter` + `qualify` (one subject) + `validate` + `destroy`.                                                                      |

Every public data member is `readonly`, every optional key is omitted rather than
`undefined`, and each name is single-word within its entity (AGENTS §4.1). Reason
supplies the pass primitives (`QuantitativeDefinition`, `LogicalDefinition`,
`Subject`, `Comparison`); contract supplies `FieldPath` and `JSONValue`; the emitter
supplies the observation types.

### Constants

| API                          | Kind  | Summary                                                                    |
| ---------------------------- | ----- | -------------------------------------------------------------------------- |
| `DEFAULT_QUALIFIER_VALIDATE` | const | `true` — validate authored definitions before qualification.               |
| `QUALIFICATION_KEY`          | const | `'qualification'` — the reserved internal projection namespace.            |
| `ELIGIBILITY_PRECEDENCE`     | const | Severity order: `ineligible`, `referral`, `eligible`.                      |
| `EFFECT_ELIGIBILITIES`       | const | Eligibility impact by `QualificationEffect`; `condition` remains eligible. |

Every constant is `Object.freeze`d. `EFFECT_ELIGIBILITIES` maps each
`QualificationEffect` to its eligibility impact — `condition` stays `eligible`, so a
condition never blocks its subject — and `ELIGIBILITY_PRECEDENCE` orders severity
`ineligible` > `referral` > `eligible`.

### Errors

| API                | Kind     | Summary                                              |
| ------------------ | -------- | ---------------------------------------------------- |
| `QualifierError`   | class    | Carries a `QualifierErrorCode` and optional context. |
| `isQualifierError` | function | Safely narrows a caught value to `QualifierError`.   |

`ENGINE` marks an underlying reason engine throw that fits no other code (e.g. a
missing reasoner) — the original throw is preserved as `context.cause`. A
`DEFINITION`/`INVALID` or `DESTROYED` engine throw maps to the matching code instead.

```ts
import { isQualifierError, QualifierError } from '@orkestrel/qualifier'

try {
	throw new QualifierError('DESTROYED', 'Qualifier has been destroyed')
} catch (error) {
	if (isQualifierError(error)) error.code // 'DESTROYED'
}
```

### Validators

All validators are total, exact guards built from `@orkestrel/contract` combinators.
They return `false` for adversarial input and never throw.

| API                         | Kind     | Narrows to                 |
| --------------------------- | -------- | -------------------------- |
| `isEligibility`             | const    | `Eligibility`.             |
| `isQualificationEffect`     | const    | `QualificationEffect`.     |
| `isRuling`                  | function | `Ruling`.                  |
| `isQualificationPass`       | function | `QualificationPass`.       |
| `isQualificationDefinition` | function | `QualificationDefinition`. |

```ts
import {
	isEligibility,
	isQualificationDefinition,
	isQualificationEffect,
	isQualificationPass,
	isRuling,
} from '@orkestrel/qualifier'
import { logicalDefinition } from '@orkestrel/reason'

isEligibility('referral') // true
isQualificationEffect('condition') // true
isQualificationPass(logicalDefinition('gates', 'Gates', [])) // true
isRuling({ id: 'r', pass: 'gates', rule: 'licensed', effect: 'restriction' }) // true
isQualificationDefinition({ id: 'd', name: 'D', passes: [] }) // true
```

### Helpers

Pure exported helpers form the functional core. `Qualifier` retains only the ordered
orchestration and ownership lifecycle.

| API                              | Kind     | Summary                                                              |
| -------------------------------- | -------- | -------------------------------------------------------------------- |
| `interpolateMessage`             | function | Interpolate `{{dotted.path}}` tokens against a subject.              |
| `describeComparison`             | function | Render one comparison as a display-neutral phrase.                   |
| `describeValue`                  | function | Render scalar and structured expected values.                        |
| `describePremise`                | function | Render one premise as a sentence.                                    |
| `premiseCheck`                   | function | Join an authored `Check` and evaluated `CheckResult`.                |
| `logicalPremises`                | function | Re-evaluate one rule's atoms into rich premise evidence.             |
| `findRule`                       | function | Locate one authored rule by id.                                      |
| `reasonResultToProjection`       | function | Project one reason result into the internal qualification namespace. |
| `quantitativeResultToDerivation` | function | Project a quantitative result into a `Derivation`.                   |
| `qualificationToRecord`          | function | Wrap a `QualificationContext` under `QUALIFICATION_KEY`.             |
| `mergeQualificationContext`      | function | Copy-on-write merge one pass projection into the context.            |
| `rulingToFinding`                | function | Join a ruling, rule result, subject, and evaluator into a finding.   |
| `deriveFindingEligibility`       | function | Derive eligibility from applied findings.                            |
| `combineEligibilities`           | function | Return the most severe eligibility in a list.                        |
| `deriveScopeEligibilities`       | function | Derive one eligibility per finding scope.                            |
| `findMissingReferences`          | function | Find rulings whose pass or rule does not exist.                      |
| `hasReservedKey`                 | function | Whether a subject already owns `QUALIFICATION_KEY`.                  |
| `assertSubject`                  | function | Narrow and reject malformed or reserved-key subjects.                |
| `mapEngineError`                 | function | Map an engine throw to a typed `QualifierError`.                     |
| `findEmptyLogicalPasses`         | function | Find logical passes carrying no rulings.                             |
| `findUnreadDerivations`          | function | Find quantitative passes never read by a later pass.                 |
| `qualificationDefinition`        | function | Build a fresh `QualificationDefinition`.                             |
| `rulingDefinition`               | function | Build a fresh `Ruling`.                                              |

Every helper is pure and side-effect-free — `Qualifier` composes them and keeps only
the ordered orchestration and ownership lifecycle. The message and premise renderers
(`interpolateMessage`, `describeComparison`, `describeValue`, `describePremise`,
`premiseCheck`, `logicalPremises`, `findRule`, `combineEligibilities`) each carry an
`@example` in source.

The projection and derivation core turns one reason result into a working projection,
a `Derivation`, and — for logical passes — findings and eligibility:

```ts
import {
	deriveFindingEligibility,
	deriveScopeEligibilities,
	mergeQualificationContext,
	qualificationToRecord,
	quantitativeResultToDerivation,
	reasonResultToProjection,
	rulingDefinition,
	rulingToFinding,
} from '@orkestrel/qualifier'
import {
	atom,
	createEvaluator,
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
	factorGroup,
	logicalDefinition,
	quantitativeDefinition,
	rule,
	staticFactor,
} from '@orkestrel/reason'

const engine = createReason({
	reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
	bail: false,
})
const evaluator = createEvaluator()

const cap = quantitativeDefinition('cap', 'TIV cap', [
	factorGroup('limit', 'sum', [staticFactor('base', 500_000)]),
])
const gates = logicalDefinition('gates', 'Eligibility gates', [
	rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
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
	const ruling = rulingDefinition('license', 'gates', 'licensed', 'restriction')
	const finding = rulingToFinding(ruling, gates, gatesResult, subject, evaluator)
	deriveFindingEligibility([finding]) // 'ineligible'
	deriveScopeEligibilities([finding]) // {} — the finding is unscoped
}
```

The projections stay inside the qualification namespace and the working subject is
discarded after each call. The reference-scan and subject-guard helpers back
`validate` and the reserved-key rejection:

```ts
import {
	assertSubject,
	findMissingReferences,
	hasReservedKey,
	qualificationDefinition,
	rulingDefinition,
} from '@orkestrel/qualifier'
import { atom, logicalDefinition, rule } from '@orkestrel/reason'

const gates = logicalDefinition('gates', 'Eligibility gates', [
	rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
])
const definition = qualificationDefinition('standard', 'Standard', [gates], {
	rulings: [rulingDefinition('license', 'gates', 'absent', 'restriction')],
})

findMissingReferences(definition)
// ["Ruling 'license' references missing rule 'absent' in pass 'gates'"]
hasReservedKey({ id: 's1', qualification: {} }) // true
assertSubject({ id: 's1' }) // narrows to Subject; throws QualifierError('MISMATCH') on a reserved key
```

### Factories

| API               | Kind     | Builds                  |
| ----------------- | -------- | ----------------------- |
| `createQualifier` | function | A `QualifierInterface`. |

```ts
import { createQualifier, qualificationDefinition, rulingDefinition } from '@orkestrel/qualifier'
import { atom, logicalDefinition, rule } from '@orkestrel/reason'

const gates = logicalDefinition('gates', 'Eligibility gates', [
	rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
])

const definition = qualificationDefinition('standard', 'Standard eligibility', [gates], {
	rulings: [rulingDefinition('license', 'gates', 'licensed', 'restriction')],
})

const qualifier = createQualifier()
qualifier.destroy()
```

Every factory returns a fresh value and omits absent optional keys.

### Entities

| API         | Kind  | Summary                                                                                                 |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------- |
| `Qualifier` | class | Owns or borrows one reason engine, validates definitions, runs ordered passes, and returns eligibility. |

## Methods

#### `QualifierInterface`

`qualify` takes exactly one subject and one definition — there is no
batch-of-subjects overload. `destroy` destroys the reason engine only when the
qualifier created it; an injected engine remains caller-owned. The emitter is
destroyed last.

| Method     | Returns                         | Behavior                                                                                                   |
| ---------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `qualify`  | `QualificationResult`           | Qualify one subject against one definition.                                                                |
| `validate` | `QualificationValidationResult` | Validate pass ids, ruling ids, pass references, logical rule references, and suspicious empty definitions. |
| `destroy`  | `void`                          | Idempotent teardown.                                                                                       |

```ts
import { createQualifier, qualificationDefinition, rulingDefinition } from '@orkestrel/qualifier'
import { atom, logicalDefinition, rule } from '@orkestrel/reason'

const gates = logicalDefinition('gates', 'Eligibility gates', [
	rule('licensed', [atom('licensed', 'equals', false)], atom('blocked', 'equals', true)),
])
const definition = qualificationDefinition('standard', 'Standard eligibility', [gates], {
	rulings: [rulingDefinition('license', 'gates', 'licensed', 'restriction')],
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
atom(['qualification', 'cap'], 'below', 1_000_000)
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
fail-closed: a subject with incomplete eligibility evidence should not proceed to
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
rulingDefinition('coastal-wind', 'wind-gates', 'coastal', 'restriction', {
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
import { createQualifier, qualificationDefinition, rulingDefinition } from '@orkestrel/qualifier'
import {
	atom,
	factorGroup,
	fieldFactor,
	logicalDefinition,
	quantitativeDefinition,
	rule,
	staticFactor,
	transform,
} from '@orkestrel/reason'

const cap = quantitativeDefinition('cap', 'TIV cap', [
	factorGroup('limit', 'sum', [staticFactor('base', 1_000_000)]),
])

const excess = quantitativeDefinition('excess', 'TIV excess', [
	factorGroup('amount', 'sum', [
		fieldFactor('total', 'total'),
		fieldFactor('cap', ['qualification', 'cap'], {
			transforms: [transform('multiply', -1)],
		}),
	]),
])

const gates = logicalDefinition('gates', 'Eligibility gates', [
	rule('tiv', [atom(['qualification', 'excess'], 'above', 0)], atom('blocked', 'equals', true)),
])

const definition = qualificationDefinition(
	'property',
	'Property eligibility',
	[cap, excess, gates],
	{
		rulings: [
			rulingDefinition('tiv', 'gates', 'tiv', 'restriction', {
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
const wind = logicalDefinition('wind', 'Wind eligibility', [
	rule('coastal', [atom('distance', 'to', 2)], atom('blocked', 'equals', true)),
])

const definition = qualificationDefinition('property', 'Property eligibility', [wind], {
	rulings: [
		rulingDefinition('coastal', 'wind', 'coastal', 'restriction', {
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
const condition = rulingDefinition('vacant', 'gates', 'vacant', 'condition', {
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
const referral = rulingDefinition('roof', 'gates', 'roof', 'referral', {
	message: 'Roof age requires manual review',
})
```

An unscoped applied referral returns `eligibility: 'referral'`. A caller that
qualifies for a downstream consumer should treat that outcome as terminal and skip downstream
work.

### Engine injection

A standalone `Qualifier` creates and OWNS a reason engine containing quantitative and
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

When `qualification.eligibility` is not `'eligible'`, the caller should skip
downstream work. That skip is auditable proof that eligibility stopped the pipeline.

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
const definition = qualificationDefinition(
	'property',
	'Property eligibility',
	[cap, excess, wind, gates],
	{
		rulings: [
			rulingDefinition('frame', 'wind', 'frame', 'restriction', {
				scope: 'wind',
				message: 'No wind coverage for Frame construction',
			}),
			rulingDefinition('saltwater', 'wind', 'saltwater', 'restriction', {
				scope: 'wind',
				message: 'No wind coverage within two miles of saltwater',
			}),
			rulingDefinition('excluded', 'gates', 'excluded', 'restriction', {
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

Tests mirror the source structure and use real reasoners.

### Core cases

- eligible subject with no applied rulings
- unscoped restriction returns `ineligible`
- unscoped referral returns `referral`
- condition remains `eligible`
- failed pass returns `referral` and `success: false`
- scoped restriction leaves global eligibility eligible
- scoped referral removes only the named scope
- later restriction outranks an earlier referral
- unscoped restriction stops later passes
- quantitative projections are available only under `qualification`
- caller subject is unchanged
- result objects are fresh
- reserved `qualification` subject key throws `MISMATCH`
- duplicate pass and ruling ids fail semantic validation
- missing pass and rule references fail semantic validation
- injected reason engine is not destroyed
- owned reason engine is destroyed
- event order is `derive` / `finding` before `qualify`, `destroy` last
- listener errors are isolated by the emitter

### Terminal eligibility proof

Integration tests should prove that a caller's downstream step is never invoked when
qualification is terminal:

```ts
let downstreamCount = 0

const qualification = qualifier.qualify(ineligibleSubject, definition)

if (qualification.eligibility !== 'eligible') {
	expect(qualification.eligibility).toBe('ineligible')
	expect(downstreamCount).toBe(0)
	return
}

downstreamCount += 1
```

A second test proves scoped selection:

```ts
const result = qualifier.qualify(coastalSubject, definition)

expect(result.scopes.wind).toBe('ineligible')

const selected = ['wind', 'exWind'].filter((id) => {
	const eligibility = result.scopes[id]
	return eligibility === undefined || eligibility === 'eligible'
})

expect(selected).toEqual(['exWind'])
```

### Gates

Run scoped gates before commit:

```text
npm run format
npm run lint
npm run check
npm run build
npm run test:src:core
```

Guide parity must verify every backticked export and every `QualifierInterface` method.

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
