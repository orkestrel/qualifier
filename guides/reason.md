# Reason

> A synchronous, deterministic reasoning engine: declarative, **JSON-serializable definitions** are evaluated against **subjects** (plain data records) to produce traceable **results**. Four strategies behind one dispatch surface — `quantitative` (factor-based numeric scoring), `logical` (rule-based boolean deduction with forward / backward chaining), `symbolic` (algebraic equation solving by variable isolation), `inferential` (fact derivation with unification variables and proof trees) — each a `ReasonerInterface` registered on the thin `Reason` orchestrator, with three injectable operators (`Evaluator` / `Transformer` / `Aggregator`) doing the shared arithmetic. Every result is a fresh object carrying `success`, a human-readable `trace`, and accumulated `errors`; nothing mutates its inputs.
>
> The design stance is **data in, data out, no surprises**: definitions are pure data (built by hand or with the shipped value factories), the orchestrator holds NO strategy logic (dispatch is a registry lookup by the `reasoning` discriminant), the operators are total (an unknown comparison surfaces as a `CheckResult.error`, an unknown math operation is a no-op, divide-by-zero is `NaN` — never a throw), and a reasoner never assumes `validate` ran — a malformed definition yields a failure RESULT, reserving throws for caller misuse (a coded `ReasonError`). On top of the evaluation engine sits the definitions & subjects capability layer: a pure copy-on-write helper family that changes / extends / merges / round-trips definitions as data, and two brand-guarded workspace builders — `DefinitionBuilder` (one self-owning manager per collection) and `SubjectBuilder` (one flat collection) — that accumulate state through named methods and `build()` a fresh plain payload on demand. Building happens OUTSIDE the engine: `reason` and `validate` take only the plain data, so a builder's `build()` output is passed at the call site. Deliberately absent: async reasoners, definition persistence, and probabilistic strategies beyond the multiplicative `confidence` of inferential facts. Source: [`src/core`](../src/core). Surfaced through the `@src/core` barrel.

## Surface

Create an orchestrator over the reasoners you need, build a definition, then evaluate subjects against it:

```ts
import {
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
	createQuantitativeReasoner,
	createReason,
	createStaticFactor,
} from '@orkestrel/reason'

const reason = createReason({ reasoners: [createQuantitativeReasoner()] })

const definition = createQuantitativeDefinition('risk', 'Risk score', [
	createFactorGroup('drivers', 'sum', [
		createFieldFactor('age', 'age'), // reads subject.age, parseNumber-coerced
		createStaticFactor('floor', 10), // a fixed contribution
	]),
])

const result = reason.reason({ age: 25 }, definition) // one subject → one result
if (result.reasoning === 'quantitative') result.value // 35 — narrow by the discriminant
result.trace // the step-by-step account of how the value came to be

reason.supports('quantitative') // true — a reasoner IS registered for this reasoning
reason.reasoner('quantitative')?.supports(definition) // the reasoner's own guard, same check
```

`reason` dispatches by `definition.reasoning` — pass an ARRAY of subjects and the batch overload maps them in order to an equal-length result array. Results are a discriminated union (`reasoning` names the axis): narrow with the discriminant and read the strategy-specific payload (`value` / `conclusion` / `solutions` / `derived`).

### Entity factories

| API                          | Kind     | Summary                                                                                                                                                                          |
| ---------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createReason`               | function | Create a `ReasonInterface` — the orchestrator — seeded from `ReasonOptions.reasoners`.                                                                                           |
| `createQuantitativeReasoner` | function | Create the factor-scoring reasoner (injectable `evaluator` / `transformer` / `aggregator`).                                                                                      |
| `createLogicalReasoner`      | function | Create the rule-deduction reasoner (injectable `evaluator`).                                                                                                                     |
| `createSymbolicReasoner`     | function | Create the equation-solving reasoner.                                                                                                                                            |
| `createInferentialReasoner`  | function | Create the fact-derivation reasoner.                                                                                                                                             |
| `createEvaluator`            | function | Create an `EvaluatorInterface` — the check evaluator operator.                                                                                                                   |
| `createTransformer`          | function | Create a `TransformerInterface` — the math-transform operator.                                                                                                                   |
| `createAggregator`           | function | Create an `AggregatorInterface` — the list-reduction operator.                                                                                                                   |
| `createDefinitionBuilder`    | function | Create a `DefinitionBuilderInterface` — the stateful definition builder — seeded from a `Definition` (`id` default: `seed.id`).                                                  |
| `createSubjectBuilder`       | function | Create a `SubjectBuilderInterface` — the stateful subject builder — seeded from a `Subject` (`id` default: `seed.id`; OPTIONAL — an anonymous builder when neither is a string). |
| `createGroupManager`         | function | Create a `GroupManagerInterface` — a self-owning, kind-free manager over a quantitative definition's `groups`.                                                                   |
| `createFactorManager`        | function | Create a `FactorManagerInterface` — the divergent factors manager, threaded through an injected sibling `GroupManagerInterface`.                                                 |
| `createRuleManager`          | function | Create a `RuleManagerInterface` — a self-owning, kind-free manager over a logical definition's `rules`.                                                                          |
| `createEquationManager`      | function | Create an `EquationManagerInterface` — a self-owning, kind-free manager over a symbolic definition's `equations`.                                                                |
| `createVariableManager`      | function | Create a `VariableManagerInterface` — a self-owning, kind-free manager over a symbolic definition's `variables` (`add` / `remove` only).                                         |
| `createFactManager`          | function | Create a `FactManagerInterface` — a self-owning, kind-free manager over an inferential definition's `facts`.                                                                     |
| `createInferenceManager`     | function | Create an `InferenceManagerInterface` — a self-owning, kind-free manager over an inferential definition's `inferences`.                                                          |

### Orchestrator & reasoners

| API                    | Kind  | Summary                                                                                                       |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| `Reason`               | class | The orchestrator — a registry of reasoners, dispatch by `reasoning`, a typed `emitter`, `bail` policy.        |
| `QuantitativeReasoner` | class | Factor-based numeric scoring: per-factor pipeline → group aggregation → definition aggregation.               |
| `LogicalReasoner`      | class | Rule-based boolean deduction: forward fixpoint chaining or backward goal-driven proving over `Expression`s.   |
| `SymbolicReasoner`     | class | Algebraic equation solving: bind variables (subject overrides), isolate each `target`, substitute forward.    |
| `InferentialReasoner`  | class | Fact derivation by positional unification: forward derives every fact, backward proves one with a proof tree. |

### Operators

| API           | Kind  | Summary                                                                                                |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------ |
| `Evaluator`   | class | Evaluates `Check`s against subjects — total (an unknown operator is a `CheckResult.error`, no throw).  |
| `Transformer` | class | Applies math `Transform`s — per-operation operand defaults, unknown operation is a no-op.              |
| `Aggregator`  | class | Reduces number lists per `Aggregation` — optional weights, fixed empty-input identities, never throws. |

### Entities

The definitions & subjects capability layer's stateful workspace builders: mutate through named methods, then `build()` a fresh plain payload to hand to `reason` at the call site. The managers are SELF-OWNING (each owns its own collection state and emitter, takes its own options, and has its own factory) and KIND-FREE (an off-kind manager accumulates silently and is ignored by `build()` — never a `MISMATCH`).

| API                 | Kind  | Summary                                                                                                                                                                                                                     |
| ------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DefinitionBuilder` | class | The `DEFINITION_BUILDER_BRAND`-carrying stateful builder — `groups` / `factors` / `rules` / `equations` / `variables` / `facts` / `inferences` self-owning manager properties, `build` / `merge` / `clear` / `destroy`.     |
| `GroupManager`      | class | The self-owning, kind-free manager over a quantitative definition's `groups`.                                                                                                                                               |
| `FactorManager`     | class | The divergent manager over a group's `factors`, `groupId`-threaded (holds no state; reads/writes through the sibling `GroupManager`).                                                                                       |
| `RuleManager`       | class | The self-owning, kind-free manager over a logical definition's `rules`.                                                                                                                                                     |
| `EquationManager`   | class | The self-owning, kind-free manager over a symbolic definition's `equations`.                                                                                                                                                |
| `VariableManager`   | class | The self-owning, kind-free manager over a symbolic definition's `variables` (name-keyed record) — `add` / `remove` only, no placement.                                                                                      |
| `FactManager`       | class | The self-owning, kind-free manager over an inferential definition's `facts`.                                                                                                                                                |
| `InferenceManager`  | class | The self-owning, kind-free manager over an inferential definition's `inferences`.                                                                                                                                           |
| `SubjectBuilder`    | class | The `SUBJECT_BUILDER_BRAND`-carrying stateful builder — a flat single-collection workspace — `field` / `fields` + `set` / `remove` (no argument / one key / key list) / `merge` / `clear` / `repeat` / `build` / `destroy`. |

### Value factories

Plain-data constructors for the declarative definition vocabulary — no lifecycle, no emitter, no identity. Reach for the entity factories earlier when you need a working instance instead.

| API                            | Kind     | Creates…                                                                                        |
| ------------------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `createCheck`                  | function | a `Check` — field / comparison / expected value.                                                |
| `createAtom`                   | function | an atom `Expression` wrapping one `createCheck(...)`.                                           |
| `createCompound`               | function | a compound `Expression` — a `LogicalOperator` over operands.                                    |
| `createRule`                   | function | a `Rule` from id / premises / conclusion (`name` default: the id; overrides merge).             |
| `createTransform`              | function | a `Transform` — the `operand` key is OMITTED when absent (round-trips the exact guard).         |
| `createBounds`                 | function | a `Bounds` — absent sides omitted (unbounded).                                                  |
| `createVariable`               | function | a variable `SymbolicExpression` leaf.                                                           |
| `createConstant`               | function | a constant `SymbolicExpression` leaf.                                                           |
| `createOperation`              | function | an operation `SymbolicExpression` node (`right` omitted when absent — the unary form).          |
| `createEquation`               | function | an `Equation` — left / right solved for `target` (`name` default: the id).                      |
| `createFact`                   | function | a `Fact` — `confidence` ALWAYS set (`?? DEFAULT_CONFIDENCE`), the one factory that fills it in. |
| `createInference`              | function | an `Inference` from id / premise patterns / conclusion pattern.                                 |
| `createStaticSource`           | function | a `Source` yielding a fixed number.                                                             |
| `createFieldSource`            | function | a `Source` reading a subject field as a number.                                                 |
| `createLookupSource`           | function | a `Source` mapping a stringified field value through a table.                                   |
| `createRangeSource`            | function | a `Source` banding a numeric field through ordered ranges (first match wins).                   |
| `createStaticFactor`           | function | a `Factor` over a static `Source` (`name` default: the id; overrides merge).                    |
| `createFieldFactor`            | function | a `Factor` over a field `Source`.                                                               |
| `createLookupFactor`           | function | a `Factor` over a lookup `Source`.                                                              |
| `createRangeFactor`            | function | a `Factor` over a range `Source`.                                                               |
| `createFactorGroup`            | function | a `FactorGroup` from id / aggregation / factors.                                                |
| `createQuantitativeDefinition` | function | a `QuantitativeDefinition` (`aggregation` default: `'sum'`).                                    |
| `createLogicalDefinition`      | function | a `LogicalDefinition` (`strategy` default: `'forward'`).                                        |
| `createSymbolicDefinition`     | function | a `SymbolicDefinition` (`variables` default: `{}`).                                             |
| `createInferentialDefinition`  | function | an `InferentialDefinition` from facts + inferences (`strategy` default: `'forward'`).           |

Every value factory returns a fresh object and OMITS absent optional keys entirely, so its output round-trips the exact-record validators in § Validators.

### Helpers

| API                        | Kind     | Summary                                                                                                                           |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `formatField`              | function | Format a `FieldPath` for display — the string key itself, or the array segments joined with `.`.                                  |
| `clamp`                    | function | Clamp a number to inclusive `Bounds` (either side optional; no bounds → unchanged).                                               |
| `roundTo`                  | function | Round to a fixed count of decimal places (`Math.round` semantics; extreme precisions pass the value through).                     |
| `matchesBounds`            | function | Whether a value is a number inside an inclusive `[minimum, maximum]` array range — the `between` / `outside` range test.          |
| `emptyAggregate`           | function | The empty-input identity of one `Aggregation` (`sum` / `average` → `0`, `product` → `1`, `minimum` / `maximum` → `NaN`).          |
| `resolveSource`            | function | Resolve one factor `Source` against a subject, taking the `fallback` when it does not resolve.                                    |
| `equalValues`              | function | SameValueZero equality (`NaN` equals `NaN`, `+0` equals `-0`) — the chaining reasoners' derivation equality.                      |
| `sortByPriority`           | function | Stable ascending copy-sort by `priority ?? DEFAULT_PRIORITY` — the shared factor / rule evaluation order.                         |
| `findDuplicates`           | function | The ids appearing more than once in an id-carrying list (once each) — behind `validate`'s uniqueness warnings.                    |
| `factToArityKey`           | function | A fact's predicate+arity bucket key, length-prefixed so the delimiter cannot be forged.                                           |
| `indexByArity`             | function | Bucket facts by predicate+arity (append order kept) — the inferential same-predicate-and-arity join index.                        |
| `termToKey`                | function | One fact term's dedup key — typeof-prefixed SameValueZero for primitives, reference identity for objects.                         |
| `factToKey`                | function | A fact's canonical dedup key — predicate + arity + terms, length-prefixed so no delimiter is forgeable (confidence excluded).     |
| `matchFacts`               | function | Bidirectional positional unification of a pattern fact against a candidate — bindings or `undefined`.                             |
| `instantiateFact`          | function | Substitute a fact's bound `'?'`-variables — a fresh fact, unbound terms passed through.                                           |
| `subjectToFacts`           | function | Project a subject's scalar fields into `has(key, value)` base facts plus their trace lines (skips `id` / null / objects).         |
| `computePremiseConfidence` | function | The product of each premise's FIRST matching fact's confidence, read from a predicate+arity index.                                |
| `containsVariable`         | function | Whether a `SymbolicExpression` holds an UNBOUND occurrence of a target variable (a pre-bound target does not count).              |
| `invertLeft`               | function | Invert `x op right = value` for the LEFT operand — zero-division inverse is `NaN`, a non-invertible operator throws `OPERATOR`.   |
| `invertRight`              | function | Invert `left op x = value` for the RIGHT operand — zero-division inverse is `NaN`, a non-invertible operator throws `OPERATOR`.   |
| `applyOperation`           | function | Apply one `MathOperation` to evaluated operands — divide-by-zero `NaN`, an unknown operator throws `OPERATOR`.                    |
| `resolveOperand`           | function | The effective right operand of a `MathOperation` — the supplied one, else its identity-preserving default (`1` or `0`).           |
| `extractAtoms`             | function | Every atom leaf of an expression tree, depth-first left-to-right — the shared conclusion/merge atom-walk.                         |
| `extractConclusions`       | function | Flatten a logical conclusion into its `formatField(field) = value` pairs — connectives ignored, later operands win.               |
| `findOverlayMismatches`    | function | The array-path conclusion overlay keys also read by an array-path premise elsewhere — the `validate` cross-rule mismatch warning. |
| `findUnboundVariables`     | function | An inference conclusion's `?variables` absent from every premise's terms — the `validate` unbound-variable warning.               |
| `buildErrorResult`         | function | The empty, type-shaped failure `ReasonResult` for a definition's reasoning — the orchestrator's `bail: false` fallback.           |

The definitions & subjects capability layer (§ Entities) adds a pure, copy-on-write CHANGE / EXTEND / MERGE / STORE surface over the four definition kinds plus a four-helper subject engine — none of it mutates an input, and every helper returns a fresh value.

| API                           | Kind     | Summary                                                                                                                    |
| ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `appendById`                  | function | Insert an id-carrying item into a collection — dedup-then-insert at the end, or immediately after `target`.                |
| `prependById`                 | function | Insert an id-carrying item into a collection — dedup-then-insert at the start, or immediately before `target`.             |
| `replaceById`                 | function | Swap the same-id item IN PLACE, preserving position (appends when absent).                                                 |
| `removeById`                  | function | Filter every same-id item out of a collection (no-op when absent).                                                         |
| `mergeById`                   | function | Reconcile two id-keyed collections — incoming order first, then base-only survivors, deduped.                              |
| `definitionToEnvelope`        | function | Project a `Definition` to its scalar envelope — the kind's collections drop out.                                           |
| `appendGroup`                 | function | Insert a `FactorGroup` into a `QuantitativeDefinition.groups`.                                                             |
| `prependGroup`                | function | Insert a `FactorGroup` at the start of `QuantitativeDefinition.groups`.                                                    |
| `replaceGroup`                | function | Swap a same-id `FactorGroup` in place.                                                                                     |
| `removeGroup`                 | function | Remove a `FactorGroup` by id.                                                                                              |
| `appendFactor`                | function | Insert a `Factor` into a `FactorGroup.factors`.                                                                            |
| `prependFactor`               | function | Insert a `Factor` at the start of a `FactorGroup.factors`.                                                                 |
| `replaceFactor`               | function | Swap a same-id `Factor` in place.                                                                                          |
| `removeFactor`                | function | Remove a `Factor` by id.                                                                                                   |
| `appendRule`                  | function | Insert a `Rule` into a `LogicalDefinition.rules` (the new last rule becomes the forward conclusion, absent `target`).      |
| `prependRule`                 | function | Insert a `Rule` at the start of `LogicalDefinition.rules`.                                                                 |
| `replaceRule`                 | function | Swap a same-id `Rule` in place.                                                                                            |
| `removeRule`                  | function | Remove a `Rule` by id.                                                                                                     |
| `appendEquation`              | function | Insert an `Equation` into a `SymbolicDefinition.equations` (solve order is load-bearing).                                  |
| `prependEquation`             | function | Insert an `Equation` at the start of `SymbolicDefinition.equations`.                                                       |
| `replaceEquation`             | function | Swap a same-id `Equation` in place.                                                                                        |
| `removeEquation`              | function | Remove an `Equation` by id.                                                                                                |
| `addVariable`                 | function | Upsert one entry of `SymbolicDefinition.variables`.                                                                        |
| `removeVariable`              | function | Delete one entry of `SymbolicDefinition.variables` (key omitted, never `undefined`).                                       |
| `appendFact`                  | function | Insert a `Fact` into an `InferentialDefinition.facts`.                                                                     |
| `prependFact`                 | function | Insert a `Fact` at the start of an `InferentialDefinition.facts`.                                                          |
| `replaceFact`                 | function | Swap a same-id `Fact` in place.                                                                                            |
| `removeFact`                  | function | Remove a `Fact` by id.                                                                                                     |
| `appendInference`             | function | Insert an `Inference` into an `InferentialDefinition.inferences` (declaration order is load-bearing).                      |
| `prependInference`            | function | Insert an `Inference` at the start of an `InferentialDefinition.inferences`.                                               |
| `replaceInference`            | function | Swap a same-id `Inference` in place.                                                                                       |
| `removeInference`             | function | Remove an `Inference` by id.                                                                                               |
| `mergeQuantitativeDefinition` | function | Whole-definition reconciliation onto `base.id` — id-keyed `groups`, factors recursing one level, incoming-wins scalars.    |
| `mergeLogicalDefinition`      | function | Whole-definition reconciliation onto `base.id` — id-keyed `rules`, incoming-wins scalars.                                  |
| `mergeSymbolicDefinition`     | function | Whole-definition reconciliation onto `base.id` — id-keyed `equations`, spread-merged `variables`, incoming-wins scalars.   |
| `mergeInferentialDefinition`  | function | Whole-definition reconciliation onto `base.id` — id-keyed `inferences` / `facts`, incoming-wins scalars.                   |
| `clearQuantitativeDefinition` | function | Delete one optional `QuantitativeDefinition` field (`description` / `base` / `bounds` / `precision`).                      |
| `clearLogicalDefinition`      | function | Delete one optional `LogicalDefinition` field (`description` / `depth`).                                                   |
| `clearSymbolicDefinition`     | function | Delete one optional `SymbolicDefinition` field (`description` / `precision`).                                              |
| `clearInferentialDefinition`  | function | Delete one optional `InferentialDefinition` field (`description` / `depth`).                                               |
| `parseDefinition`             | function | Parse JSON into a `Definition` — `parseJSONAs` composed with `isDefinition`, failing safe to `undefined`.                  |
| `assignField`                 | function | Upsert one `Subject` field — copy-on-write spread (id-agnostic).                                                           |
| `removeField`                 | function | Delete one `Subject` field (key omitted, never `undefined`).                                                               |
| `mergeSubjects`               | function | Reconcile two `Subject`s — incoming-wins spread, base `id` preserved when present.                                         |
| `repeatSubject`               | function | Produce `count` deterministic clones of a `Subject`, minting `` `${baseId}-${index}` `` ids when the base has a string id. |

### Validators

Total guards return `false`, never throw, for adversarial input such as junk, cycles, and hostile prototypes. Input guards compose the [contracts](contract.md) combinators. Result guards use bespoke open member checks and retain those combinators for nested values. Exactness follows who produces the value, not who declares the type: caller-supplied input records are exact, while package or foreign-interface result records are open to extra members. Numeric input fields guard with `isFiniteNumber` (JSON cannot carry `NaN` / `±Infinity`); the recursive input shapes recurse through `lazyOf`.

| API                        | Kind     | Narrows to                                                                                                                                                                                            |
| -------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isReasoning`              | const    | `Reasoning`.                                                                                                                                                                                          |
| `isChainingStrategy`       | const    | `ChainingStrategy`.                                                                                                                                                                                   |
| `isMathOperation`          | const    | `MathOperation`.                                                                                                                                                                                      |
| `isAggregation`            | const    | `Aggregation`.                                                                                                                                                                                        |
| `isComparison`             | const    | `Comparison`.                                                                                                                                                                                         |
| `isLogicalOperator`        | const    | `LogicalOperator`.                                                                                                                                                                                    |
| `isFieldPath`              | const    | `FieldPath` — a string or an array of strings.                                                                                                                                                        |
| `isNumberRecord`           | const    | `Readonly<Record<string, number>>` — the open dictionary of a lookup `table` / `variables`.                                                                                                           |
| `isCheck`                  | function | `Check` — the `value` key must be PRESENT, but may hold anything (including `null`).                                                                                                                  |
| `isTransform`              | function | `Transform`.                                                                                                                                                                                          |
| `isBounds`                 | function | `Bounds`.                                                                                                                                                                                             |
| `isFactorRange`            | function | `FactorRange`.                                                                                                                                                                                        |
| `isSource`                 | function | `Source` — any of the four origins.                                                                                                                                                                   |
| `isFactor`                 | function | `Factor`.                                                                                                                                                                                             |
| `isFactorGroup`            | function | `FactorGroup`.                                                                                                                                                                                        |
| `isExpression`             | function | `Expression` — recursive through `lazyOf` (deep / cyclic input contained → `false`).                                                                                                                  |
| `isRule`                   | function | `Rule`.                                                                                                                                                                                               |
| `isSymbolicExpression`     | function | `SymbolicExpression` — recursive through `lazyOf`.                                                                                                                                                    |
| `isEquation`               | function | `Equation`.                                                                                                                                                                                           |
| `isFact`                   | function | `Fact` — `terms` is a bare array (elements unrestricted).                                                                                                                                             |
| `isInference`              | function | `Inference`.                                                                                                                                                                                          |
| `isQuantitativeDefinition` | function | `QuantitativeDefinition`.                                                                                                                                                                             |
| `isLogicalDefinition`      | function | `LogicalDefinition`.                                                                                                                                                                                  |
| `isSymbolicDefinition`     | function | `SymbolicDefinition`.                                                                                                                                                                                 |
| `isInferentialDefinition`  | function | `InferentialDefinition`.                                                                                                                                                                              |
| `isDefinition`             | function | `Definition` — the union of the four definition guards.                                                                                                                                               |
| `isQuantitativeClearKey`   | const    | `QuantitativeClearKey` — an optional quantitative field `clearQuantitativeDefinition` can delete.                                                                                                     |
| `isLogicalClearKey`        | const    | `LogicalClearKey` — an optional logical field `clearLogicalDefinition` can delete.                                                                                                                    |
| `isSymbolicClearKey`       | const    | `SymbolicClearKey` — an optional symbolic field `clearSymbolicDefinition` can delete.                                                                                                                 |
| `isInferentialClearKey`    | const    | `InferentialClearKey` — an optional inferential field `clearInferentialDefinition` can delete.                                                                                                        |
| `isResultFact`             | function | `Fact` as a result member — open to extra members and prototypes; optional `confidence` accepts every JavaScript number.                                                                              |
| `isCheckResult`            | function | `CheckResult` — open result object; `actual` must be present but remains unrestricted. A required `actual: undefined` does not survive `JSON.stringify`, so the JSON round-tripped result is refused. |
| `isFactorResult`           | function | `FactorResult` — open result object; optional `raw` / `checks` are absent-or-valid.                                                                                                                   |
| `isGroupResult`            | function | `GroupResult` — open result object with open nested factor results.                                                                                                                                   |
| `isRuleResult`             | function | `RuleResult` — open result object with boolean premises.                                                                                                                                              |
| `isProofNode`              | function | `ProofNode` — open, iterative, cycle-safe tree bounded by `GUARD_DEPTH_LIMIT`.                                                                                                                        |
| `isQuantitativeResult`     | function | `QuantitativeResult` — open result object; numeric members accept every JavaScript number.                                                                                                            |
| `isLogicalResult`          | function | `LogicalResult` — open result object with open nested rule results.                                                                                                                                   |
| `isSymbolicResult`         | function | `SymbolicResult` — open result object whose `solutions` check covers every own string-named member, including non-enumerable members, and requires each value to be a number.                         |
| `isInferentialResult`      | function | `InferentialResult` — open result object with open `derived` facts checked by `isResultFact`.                                                                                                         |
| `isReasonResult`           | function | `ReasonResult` — the union of the four result guards.                                                                                                                                                 |
| `isReasonValidationResult` | function | `ReasonValidationResult` — open result object with boolean `valid` and string-array `errors` / `warnings`.                                                                                            |
| `isDefinitionBuilder`      | function | `DefinitionBuilderInterface` — the builder BRAND guard (`DEFINITION_BUILDER_BRAND`), not the data union.                                                                                              |
| `isSubjectBuilder`         | function | `SubjectBuilderInterface` — the builder BRAND guard (`SUBJECT_BUILDER_BRAND`), not the plain `Subject`.                                                                                               |

### Errors

| API             | Kind     | Summary                                                                                                                      |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ReasonError`   | class    | Carries a `ReasonErrorCode` (`MISSING` / `INVALID` / `MISMATCH` / `DESTROYED` / `TARGET` / `OPERATOR`) + optional `context`. |
| `isReasonError` | function | Narrow an unknown caught value to a `ReasonError`.                                                                           |

### Constants

| API                        | Kind  | Summary                                                                                                                                                                |
| -------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_REASON_BAIL`      | const | `true` — a reasoner throw is rethrown after the `error` emit (domain-qualified name — keeps the barrel collision-free as sibling modules add their own bail defaults). |
| `DEFAULT_VALIDATE`         | const | `false` — per-call validation is opt-in.                                                                                                                               |
| `DEFAULT_DEPTH`            | const | `10` — the forward-iteration / backward-recursion cap of the chaining reasoners.                                                                                       |
| `DEFAULT_BASE`             | const | `0` — added before aggregation at both group and definition level.                                                                                                     |
| `DEFAULT_PRECISION`        | const | `4` — decimal places for quantitative values and symbolic solutions.                                                                                                   |
| `DEFAULT_CONFIDENCE`       | const | `1` — for facts, inferences, and injected subject facts.                                                                                                               |
| `DEFAULT_WEIGHT`           | const | `1` — per-factor weight at group aggregation.                                                                                                                          |
| `DEFAULT_PRIORITY`         | const | `0` — factor / rule evaluation order (ascending, stable).                                                                                                              |
| `CONFIDENCE_PRECISION`     | const | `4` — fixed rounding of derived-fact confidences (NOT per-definition overridable).                                                                                     |
| `INVERTIBLE_OPERATIONS`    | const | The operations symbolic isolation can invert: `add` / `subtract` / `multiply` / `divide`.                                                                              |
| `EVALUATOR_ID`             | const | `'evaluator'` — the default `Evaluator` id.                                                                                                                            |
| `TRANSFORMER_ID`           | const | `'transformer'` — the default `Transformer` id.                                                                                                                        |
| `AGGREGATOR_ID`            | const | `'aggregator'` — the default `Aggregator` id.                                                                                                                          |
| `QUANTITATIVE_ID`          | const | `'quantitative'` — the default `QuantitativeReasoner` id.                                                                                                              |
| `LOGICAL_ID`               | const | `'logical'` — the default `LogicalReasoner` id.                                                                                                                        |
| `SYMBOLIC_ID`              | const | `'symbolic'` — the default `SymbolicReasoner` id.                                                                                                                      |
| `INFERENTIAL_ID`           | const | `'inferential'` — the default `InferentialReasoner` id.                                                                                                                |
| `DEFINITION_BUILDER_BRAND` | const | A `unique symbol` — the `DefinitionBuilder` builder brand key (`isDefinitionBuilder` reads it through `Reflect.get`).                                                  |
| `SUBJECT_BUILDER_BRAND`    | const | A `unique symbol` — the `SubjectBuilder` builder brand key (`isSubjectBuilder` reads it through `Reflect.get`), distinct from `DEFINITION_BUILDER_BRAND`.              |

### Types

| Type                          | Kind      | Shape                                                                                                                                                                                                                    |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Reasoning`                   | type      | `'quantitative' \| 'logical' \| 'symbolic' \| 'inferential'` — the definition / result axis.                                                                                                                             |
| `ChainingStrategy`            | type      | `'forward' \| 'backward'`.                                                                                                                                                                                               |
| `MathOperation`               | type      | `'add' \| 'subtract' \| 'multiply' \| 'divide' \| 'percentage' \| 'minimum' \| 'maximum' \| 'average' \| 'power' \| 'round' \| 'ceil' \| 'floor' \| 'abs'`.                                                              |
| `Aggregation`                 | type      | `'sum' \| 'product' \| 'average' \| 'minimum' \| 'maximum'`.                                                                                                                                                             |
| `Comparison`                  | type      | `'equals' \| 'not' \| 'above' \| 'below' \| 'from' \| 'to' \| 'any' \| 'none' \| 'between' \| 'outside'`.                                                                                                                |
| `LogicalOperator`             | type      | `'and' \| 'or' \| 'not' \| 'implies' \| 'xor'`.                                                                                                                                                                          |
| `Subject`                     | type      | `Readonly<Record<string, unknown>>` — the data record being reasoned about.                                                                                                                                              |
| `Check`                       | interface | `{ field, operator, value }` — one field predicate (`value` is `unknown`).                                                                                                                                               |
| `CheckResult`                 | interface | `{ field, met, actual, error? }` — `error` only when evaluation ITSELF failed.                                                                                                                                           |
| `Transform`                   | interface | `{ operation, operand? }` — one math step.                                                                                                                                                                               |
| `Bounds`                      | interface | `{ minimum?, maximum? }` — an inclusive clamp, either side open.                                                                                                                                                         |
| `StaticSource`                | interface | `{ origin: 'static', value }`.                                                                                                                                                                                           |
| `FieldSource`                 | interface | `{ origin: 'field', field }` — `parseNumber`-coerced from the subject.                                                                                                                                                   |
| `LookupSource`                | interface | `{ origin: 'lookup', field, table }` — a present value keys the table's OWN keys; a missing / `null` field falls back.                                                                                                   |
| `RangeSource`                 | interface | `{ origin: 'range', field, ranges }` — first matching band wins.                                                                                                                                                         |
| `Source`                      | type      | `StaticSource \| FieldSource \| LookupSource \| RangeSource`, discriminated by `origin`.                                                                                                                                 |
| `FactorRange`                 | interface | `{ bounds?, value }` — one band (a boundless band is a catch-all).                                                                                                                                                       |
| `Factor`                      | interface | id / `name` / `source` + the pipeline knobs: `fallback?` / `checks?` / `transforms?` / `bounds?` / `weight?` / `priority?` / `enabled?` / `required?`.                                                                   |
| `FactorGroup`                 | interface | id / `name` / `factors` / `aggregation` + `base?` / `bounds?` / `enabled?` / `strict?`.                                                                                                                                  |
| `QuantitativeDefinition`      | interface | `reasoning: 'quantitative'` + `groups` / `aggregation` / `base?` / `bounds?` / `precision?`.                                                                                                                             |
| `Atom`                        | interface | `{ form: 'atom', check }` — a leaf boolean expression.                                                                                                                                                                   |
| `Compound`                    | interface | `{ form: 'compound', operator, operands }`.                                                                                                                                                                              |
| `Expression`                  | type      | `Atom \| Compound`, discriminated by `form`.                                                                                                                                                                             |
| `Rule`                        | interface | id / `name` / `premises` / `conclusion` + `priority?` / `enabled?`.                                                                                                                                                      |
| `LogicalDefinition`           | interface | `reasoning: 'logical'` + `rules` / `strategy` / `depth?`.                                                                                                                                                                |
| `Variable`                    | interface | `{ form: 'variable', name }` — a symbolic leaf.                                                                                                                                                                          |
| `Constant`                    | interface | `{ form: 'constant', value }` — a symbolic leaf.                                                                                                                                                                         |
| `Operation`                   | interface | `{ form: 'operation', operator, left, right? }` — `right` absent on the unary operators.                                                                                                                                 |
| `SymbolicExpression`          | type      | `Variable \| Constant \| Operation`, discriminated by `form`.                                                                                                                                                            |
| `Equation`                    | interface | id / `name` / `left` / `right` / `target` — `left = right` solved for `target`.                                                                                                                                          |
| `SymbolicDefinition`          | interface | `reasoning: 'symbolic'` + `equations` / `variables` / `precision?`.                                                                                                                                                      |
| `Fact`                        | interface | `{ id, predicate, terms, confidence? }` — a `'?'`-prefixed string term is a unification variable.                                                                                                                        |
| `Inference`                   | interface | id / `name` / `premises` (patterns) / `conclusion` (pattern) + `confidence?` / `enabled?`.                                                                                                                               |
| `InferentialDefinition`       | interface | `reasoning: 'inferential'` + `inferences` / `facts` / `strategy` / `depth?`.                                                                                                                                             |
| `Definition`                  | type      | The union of the four definitions, discriminated by `reasoning`.                                                                                                                                                         |
| `DefinitionEnvelope`          | type      | The scalar-only projection of each definition kind (collections omitted) — the `DefinitionBuilder` implementation's private envelope shape.                                                                              |
| `QuantitativeClearKey`        | type      | `'description' \| 'base' \| 'bounds' \| 'precision'` — the clearable optional quantitative fields.                                                                                                                       |
| `LogicalClearKey`             | type      | `'description' \| 'depth'` — the clearable optional logical fields.                                                                                                                                                      |
| `SymbolicClearKey`            | type      | `'description' \| 'precision'` — the clearable optional symbolic fields.                                                                                                                                                 |
| `InferentialClearKey`         | type      | `'description' \| 'depth'` — the clearable optional inferential fields.                                                                                                                                                  |
| `LogicalChainingResult`       | interface | `{ conclusion, rules }` — one `LogicalReasoner` chaining pass, forward or backward.                                                                                                                                      |
| `InferentialChainingResult`   | interface | `{ derived, proof? }` — one `InferentialReasoner` chaining pass; `proof` only from the backward pass.                                                                                                                    |
| `FactorResult`                | interface | `{ id, applied, value, raw?, checks? }` — `raw` is the pre-transform source value.                                                                                                                                       |
| `GroupResult`                 | interface | `{ id, applied, value, factors }` — disabled factors omitted entirely.                                                                                                                                                   |
| `QuantitativeResult`          | interface | `reasoning: 'quantitative'` + `value` / `groups` / `count` / `success` / `trace` / `errors`.                                                                                                                             |
| `RuleResult`                  | interface | `{ id, applied, premises }` — per-premise truth values; `applied` is true exactly when every premise held.                                                                                                               |
| `LogicalResult`               | interface | `reasoning: 'logical'` + `conclusion` / `rules` / `count` / `success` / `trace` / `errors`.                                                                                                                              |
| `SymbolicResult`              | interface | `reasoning: 'symbolic'` + `solutions` (bindings keyed by each equation's `target`) / `success` / `trace` / `errors`.                                                                                                     |
| `ProofNode`                   | interface | `{ fact, inference?, children?, depth }` — one node of a backward proof tree.                                                                                                                                            |
| `InferentialResult`           | interface | `reasoning: 'inferential'` + `derived` / `proof?` / `success` / `trace` / `errors`.                                                                                                                                      |
| `ReasonResult`                | type      | The union of the four results, discriminated by `reasoning`.                                                                                                                                                             |
| `ReasonValidationResult`      | interface | `{ valid, errors, warnings }` — `valid` exactly when `errors` is empty.                                                                                                                                                  |
| `EvaluatorOptions`            | interface | `{ id? }` — input to `createEvaluator`.                                                                                                                                                                                  |
| `TransformerOptions`          | interface | `{ id? }` — input to `createTransformer`.                                                                                                                                                                                |
| `AggregatorOptions`           | interface | `{ id? }` — input to `createAggregator`.                                                                                                                                                                                 |
| `QuantitativeReasonerOptions` | interface | `{ id?, evaluator?, transformer?, aggregator? }` — injectable operators.                                                                                                                                                 |
| `LogicalReasonerOptions`      | interface | `{ id?, evaluator? }`.                                                                                                                                                                                                   |
| `SymbolicReasonerOptions`     | interface | `{ id? }`.                                                                                                                                                                                                               |
| `InferentialReasonerOptions`  | interface | `{ id? }`.                                                                                                                                                                                                               |
| `EvaluatorInterface`          | interface | `id` + `evaluate` / `batch` — the check-evaluation operator contract.                                                                                                                                                    |
| `TransformerInterface`        | interface | `id` + `apply` / `chain` — the math-transform operator contract.                                                                                                                                                         |
| `AggregatorInterface`         | interface | `id` + `aggregate` — the list-reduction operator contract.                                                                                                                                                               |
| `ReasonerInterface`           | interface | `id` / `reasoning` + `supports` / `validate` / `reason` — one strategy adapter per `Reasoning`.                                                                                                                          |
| `ReasonErrorCode`             | type      | `'MISSING' \| 'INVALID' \| 'MISMATCH' \| 'DESTROYED' \| 'TARGET' \| 'OPERATOR'`.                                                                                                                                         |
| `ReasonEventMap`              | type      | The orchestrator's push observation surface — `register(reasoning)` · `reason(result)` · `error(error)` · `destroy()`.                                                                                                   |
| `ReasonOptions`               | interface | `{ reasoners?, bail?, validate?, on?, error? }` — input to `createReason`.                                                                                                                                               |
| `ReasonInterface`             | interface | `emitter` + `reason` / `register` / `reasoner` / `reasoners` / `supports` / `validate` / `destroy`.                                                                                                                      |
| `GroupManagerInterface`       | interface | The self-owning, kind-free manager over `groups` — `emitter` + `group` / `groups` + `append` / `prepend` / `replace` / `remove` / `seat` / `destroy`.                                                                    |
| `GroupManagerEventMap`        | type      | `GroupManager`'s push surface — `append(id)` · `prepend(id)` · `replace(id)` · `remove(id)` · `destroy()`.                                                                                                               |
| `GroupManagerOptions`         | interface | `{ groups?, on?, error? }` — input to `createGroupManager`.                                                                                                                                                              |
| `FactorManagerInterface`      | interface | The divergent manager over a group's `factors`, `groupId`-threaded — `emitter` + `factor` / `factors` + `append` / `prepend` / `replace` / `remove` / `destroy`.                                                         |
| `FactorManagerEventMap`       | type      | `FactorManager`'s push surface — `append(id)` · `prepend(id)` · `replace(id)` · `remove(id)` · `destroy()`.                                                                                                              |
| `FactorManagerOptions`        | interface | `{ on?, error? }` — input to `createFactorManager` (the sibling `GroupManager` is a constructor argument).                                                                                                               |
| `RuleManagerInterface`        | interface | The self-owning, kind-free manager over `rules` — `emitter` + `rule` / `rules` + `append` / `prepend` / `replace` / `remove` / `seat` / `destroy`.                                                                       |
| `RuleManagerEventMap`         | type      | `RuleManager`'s push surface — `append(id)` · `prepend(id)` · `replace(id)` · `remove(id)` · `destroy()`.                                                                                                                |
| `RuleManagerOptions`          | interface | `{ rules?, on?, error? }` — input to `createRuleManager`.                                                                                                                                                                |
| `EquationManagerInterface`    | interface | The self-owning, kind-free manager over `equations` — `emitter` + `equation` / `equations` + `append` / `prepend` / `replace` / `remove` / `seat` / `destroy`.                                                           |
| `EquationManagerEventMap`     | type      | `EquationManager`'s push surface — `append(id)` · `prepend(id)` · `replace(id)` · `remove(id)` · `destroy()`.                                                                                                            |
| `EquationManagerOptions`      | interface | `{ equations?, on?, error? }` — input to `createEquationManager`.                                                                                                                                                        |
| `FactManagerInterface`        | interface | The self-owning, kind-free manager over `facts` — `emitter` + `fact` / `facts` + `append` / `prepend` / `replace` / `remove` / `seat` / `destroy`.                                                                       |
| `FactManagerEventMap`         | type      | `FactManager`'s push surface — `append(id)` · `prepend(id)` · `replace(id)` · `remove(id)` · `destroy()`.                                                                                                                |
| `FactManagerOptions`          | interface | `{ facts?, on?, error? }` — input to `createFactManager`.                                                                                                                                                                |
| `InferenceManagerInterface`   | interface | The self-owning, kind-free manager over `inferences` — `emitter` + `inference` / `inferences` + `append` / `prepend` / `replace` / `remove` / `seat` / `destroy`.                                                        |
| `InferenceManagerEventMap`    | type      | `InferenceManager`'s push surface — `append(id)` · `prepend(id)` · `replace(id)` · `remove(id)` · `destroy()`.                                                                                                           |
| `InferenceManagerOptions`     | interface | `{ inferences?, on?, error? }` — input to `createInferenceManager`.                                                                                                                                                      |
| `VariableManagerInterface`    | interface | The self-owning, kind-free manager over `variables` (name-keyed record) — `emitter` + `variable` / `variables` + `add` / `remove` / `seat` / `destroy`.                                                                  |
| `VariableManagerEventMap`     | type      | `VariableManager`'s push surface — `add(name)` · `remove(name)` · `destroy()`.                                                                                                                                           |
| `VariableManagerOptions`      | interface | `{ variables?, on?, error? }` — input to `createVariableManager`.                                                                                                                                                        |
| `DefinitionBuilderEventMap`   | type      | The `DefinitionBuilder`'s push surface — `merge(reasoning)` · `clear(key)` · `destroy()` (per-element mutations live on the managers' own emitters).                                                                     |
| `DefinitionBuilderInterface`  | interface | The `DEFINITION_BUILDER_BRAND`-carrying stateful builder — `groups` / `factors` / `rules` / `equations` / `variables` / `facts` / `inferences` self-owning manager properties + `build` / `merge` / `clear` / `destroy`. |
| `DefinitionBuilderOptions`    | interface | `{ id?, groups?, factors?, rules?, equations?, variables?, facts?, inferences?, on?, error? }` — input to `createDefinitionBuilder` (each manager slot is bring-your-own).                                               |
| `SubjectBuilderEventMap`      | type      | The `SubjectBuilder`'s push surface — `set(key, value)` · `remove(key)` · `merge(incoming)` · `clear()` · `destroy()`.                                                                                                   |
| `SubjectBuilderInterface`     | interface | The `SUBJECT_BUILDER_BRAND`-carrying stateful builder — `field` / `fields` + `set` / `remove` (no argument / one key / key list) / `merge` / `clear` / `repeat` / `build` / `destroy`.                                   |
| `SubjectBuilderOptions`       | interface | `{ id?, on?, error? }` — input to `createSubjectBuilder`; `id` is OPTIONAL — an anonymous builder results when neither `id` nor `seed.id` is present.                                                                    |

## Methods

The public methods of each behavioral interface — one table per type, keyed by its backticked name, every call-signature member listed (the `readonly` data members — `emitter` on the orchestrator, the builders, and every manager; `id` / `reasoning` on reasoners and operators — stay off the method tables). Each implementing class (`Reason`; the four reasoners; `Evaluator` / `Transformer` / `Aggregator`; the `DefinitionBuilder` / `SubjectBuilder` builders and the manager classes) exposes exactly its interface's methods, so this doubles as the per-instance method surface.

#### `ReasonInterface`

The array overload of `reason` is declared FIRST so a subject list resolves to the batch form. After `destroy()`, every method except `destroy` itself throws `DESTROYED` (the `emitter` getter keeps working). `reason` and `validate` take plain data only — a `DefinitionBuilderInterface` / `SubjectBuilderInterface`'s `build()` output is passed instead, by the caller.

| Method      | Returns                          | Behavior                                                                              |
| ----------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| `reason`    | `ReasonResult` (or array)        | Dispatch one subject — or map a subject array in order — to the registered reasoner.  |
| `register`  | `void`                           | Register a reasoner (same-`reasoning` replaces); emits `register`.                    |
| `reasoner`  | `ReasonerInterface \| undefined` | Look up ONE reasoner by reasoning.                                                    |
| `reasoners` | `readonly ReasonerInterface[]`   | List ALL registered reasoners (a fresh array).                                        |
| `supports`  | `boolean`                        | Whether a reasoner is registered for a reasoning.                                     |
| `validate`  | `ReasonValidationResult`         | Delegate to the reasoner — a missing reasoner is an invalid RESULT here, not a throw. |
| `destroy`   | `void`                           | Clear the registry, emit `destroy`, destroy the emitter LAST; idempotent.             |

#### `ReasonerInterface`

`supports` / `validate` / `reason` take plain data only — a `DefinitionBuilderInterface` / `SubjectBuilderInterface`'s `build()` output is passed instead, by the caller.

| Method     | Returns                  | Behavior                                                                                           |
| ---------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `supports` | `boolean`                | Whether the definition's `reasoning` equals this reasoner's.                                       |
| `validate` | `ReasonValidationResult` | Structural errors + soft warnings, without evaluating anything.                                    |
| `reason`   | `ReasonResult`           | Evaluate one subject. Throws ONLY `MISMATCH` (wrong reasoning) — malformation is a failure result. |

#### `EvaluatorInterface`

| Method     | Returns                  | Behavior                                                                                         |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `evaluate` | `CheckResult`            | Resolve `check.field` from the subject and compare; an unknown operator is an in-result `error`. |
| `batch`    | `readonly CheckResult[]` | Evaluate many checks positionally against one subject.                                           |

#### `TransformerInterface`

| Method  | Returns  | Behavior                                                                                        |
| ------- | -------- | ----------------------------------------------------------------------------------------------- |
| `apply` | `number` | One math step — absent operand default: `1` for `multiply` / `divide` / `power`, `0` otherwise. |
| `chain` | `number` | Left-fold a transform list over the value (`NaN` flows through — no step is skipped).           |

#### `AggregatorInterface`

| Method      | Returns  | Behavior                                                                                                                |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `aggregate` | `number` | Reduce the values per aggregation; `weights` honored ONLY on an exact length match (`minimum` / `maximum` ignore them). |

#### `GroupManagerInterface`

The self-owning manager over a quantitative definition's `groups`. Managers are KIND-FREE — an off-kind collection is ignored by `build()`, never a throw. A call after `destroy()` throws `DESTROYED`.

| Method    | Returns                    | Behavior                                                                                                                                                           |
| --------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `group`   | `FactorGroup \| undefined` | Look up ONE group by id.                                                                                                                                           |
| `groups`  | `readonly FactorGroup[]`   | List ALL groups in order.                                                                                                                                          |
| `append`  | `void`                     | Insert a group, dedup-then-insert at the end or after `target` (`TARGET` on a naming miss).                                                                        |
| `prepend` | `void`                     | Insert a group, dedup-then-insert at the start or before `target` (`TARGET` on a naming miss).                                                                     |
| `replace` | `void`                     | Swap a same-id group in place (appends when absent).                                                                                                               |
| `remove`  | `boolean \| void`          | Remove groups — no argument every one, one id that one, an id list those; the id forms report whether every named id existed, and each removal emits one `remove`. |
| `seat`    | `void`                     | Replace the whole collection in one silent call — the owning builder's bulk re-seat channel.                                                                       |
| `destroy` | `void`                     | Idempotent teardown — emits `destroy`, then destroys the emitter LAST.                                                                                             |

#### `FactorManagerInterface`

The divergent manager over a `FactorGroup`'s `factors`, threaded through the required `groupId` locator — it holds no state of its own, reading and writing through the sibling `GroupManager`. `groupId` naming no existing group throws `TARGET` (with `groupId` in the context); a call after `destroy()` throws `DESTROYED`.

| Method    | Returns               | Behavior                                                                                                                                                             |
| --------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `factor`  | `Factor \| undefined` | Look up ONE factor by group id + id.                                                                                                                                 |
| `factors` | `readonly Factor[]`   | List ALL factors of one group in order.                                                                                                                              |
| `append`  | `void`                | Insert a factor into the named group, dedup-then-insert at the end or after `target`.                                                                                |
| `prepend` | `void`                | Insert a factor into the named group, dedup-then-insert at the start or before `target`.                                                                             |
| `replace` | `void`                | Swap a same-id factor in place within the named group (appends when absent).                                                                                         |
| `remove`  | `boolean \| void`     | Remove factors of the named group — the locator alone every one, a further id that one, a further id list those; the id forms report whether every named id existed. |
| `destroy` | `void`                | Idempotent teardown — emits `destroy`, then destroys the emitter LAST.                                                                                               |

#### `RuleManagerInterface`

The self-owning manager over a logical definition's `rules`. Rule order is load-bearing — the forward conclusion is the LAST declared non-disabled rule. Managers are KIND-FREE — an off-kind collection is ignored by `build()`, never a throw. A call after `destroy()` throws `DESTROYED`.

| Method    | Returns             | Behavior                                                                                                                     |
| --------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `rule`    | `Rule \| undefined` | Look up ONE rule by id.                                                                                                      |
| `rules`   | `readonly Rule[]`   | List ALL rules in order.                                                                                                     |
| `append`  | `void`              | Insert a rule, dedup-then-insert at the end or after `target` — absent `target` makes it the new forward conclusion.         |
| `prepend` | `void`              | Insert a rule, dedup-then-insert at the start or before `target`.                                                            |
| `replace` | `void`              | Swap a same-id rule in place (appends when absent).                                                                          |
| `remove`  | `boolean \| void`   | Remove rules — no argument every one, one id that one, an id list those; the id forms report whether every named id existed. |
| `seat`    | `void`              | Replace the whole collection in one silent call — the owning builder's bulk re-seat channel.                                 |
| `destroy` | `void`              | Idempotent teardown — emits `destroy`, then destroys the emitter LAST.                                                       |

#### `EquationManagerInterface`

The self-owning manager over a symbolic definition's `equations`. Equation order is strongly load-bearing — equations solve strictly in order and each rounded solution feeds forward. Managers are KIND-FREE — an off-kind collection is ignored by `build()`, never a throw. A call after `destroy()` throws `DESTROYED`.

| Method      | Returns                 | Behavior                                                                                                                         |
| ----------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `equation`  | `Equation \| undefined` | Look up ONE equation by id.                                                                                                      |
| `equations` | `readonly Equation[]`   | List ALL equations in solve order.                                                                                               |
| `append`    | `void`                  | Insert an equation, dedup-then-insert at the end or after `target`.                                                              |
| `prepend`   | `void`                  | Insert an equation, dedup-then-insert at the start or before `target`.                                                           |
| `replace`   | `void`                  | Swap a same-id equation in place (appends when absent).                                                                          |
| `remove`    | `boolean \| void`       | Remove equations — no argument every one, one id that one, an id list those; the id forms report whether every named id existed. |
| `seat`      | `void`                  | Replace the whole collection in one silent call — the owning builder's bulk re-seat channel.                                     |
| `destroy`   | `void`                  | Idempotent teardown — emits `destroy`, then destroys the emitter LAST.                                                           |

#### `FactManagerInterface`

The self-owning manager over an inferential definition's `facts`. Managers are KIND-FREE — an off-kind collection is ignored by `build()`, never a throw. A call after `destroy()` throws `DESTROYED`.

| Method    | Returns             | Behavior                                                                                                                     |
| --------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `fact`    | `Fact \| undefined` | Look up ONE fact by id.                                                                                                      |
| `facts`   | `readonly Fact[]`   | List ALL facts in order.                                                                                                     |
| `append`  | `void`              | Insert a fact, dedup-then-insert at the end or after `target`.                                                               |
| `prepend` | `void`              | Insert a fact, dedup-then-insert at the start or before `target`.                                                            |
| `replace` | `void`              | Swap a same-id fact in place (appends when absent).                                                                          |
| `remove`  | `boolean \| void`   | Remove facts — no argument every one, one id that one, an id list those; the id forms report whether every named id existed. |
| `seat`    | `void`              | Replace the whole collection in one silent call — the owning builder's bulk re-seat channel.                                 |
| `destroy` | `void`              | Idempotent teardown — emits `destroy`, then destroys the emitter LAST.                                                       |

#### `InferenceManagerInterface`

The self-owning manager over an inferential definition's `inferences`. Inference order is load-bearing — backward proving iterates in declaration order and returns on first success. Managers are KIND-FREE — an off-kind collection is ignored by `build()`, never a throw. A call after `destroy()` throws `DESTROYED`.

| Method       | Returns                  | Behavior                                                                                                                          |
| ------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `inference`  | `Inference \| undefined` | Look up ONE inference by id.                                                                                                      |
| `inferences` | `readonly Inference[]`   | List ALL inferences in order.                                                                                                     |
| `append`     | `void`                   | Insert an inference, dedup-then-insert at the end or after `target`.                                                              |
| `prepend`    | `void`                   | Insert an inference, dedup-then-insert at the start or before `target`.                                                           |
| `replace`    | `void`                   | Swap a same-id inference in place (appends when absent).                                                                          |
| `remove`     | `boolean \| void`        | Remove inferences — no argument every one, one id that one, an id list those; the id forms report whether every named id existed. |
| `seat`       | `void`                   | Replace the whole collection in one silent call — the owning builder's bulk re-seat channel.                                      |
| `destroy`    | `void`                   | Idempotent teardown — emits `destroy`, then destroys the emitter LAST.                                                            |

#### `VariableManagerInterface`

The self-owning manager over a symbolic definition's `variables` — a name-keyed unordered record, so `add` / `remove` are the only write verbs (no `append` / `prepend`). Managers are KIND-FREE — an off-kind collection is ignored by `build()`, never a throw. A call after `destroy()` throws `DESTROYED`.

| Method      | Returns                            | Behavior                                                                                                                                                                 |
| ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `variable`  | `number \| undefined`              | Look up ONE variable's value by name.                                                                                                                                    |
| `variables` | `Readonly<Record<string, number>>` | The whole name-keyed record.                                                                                                                                             |
| `add`       | `void`                             | Upsert one entry — emits the `add` event with the variable name.                                                                                                         |
| `remove`    | `boolean \| void`                  | Remove variables by NAME — no argument every one, one name that one, a name list those; each removal omits the key (never `undefined`) and emits `remove` with the name. |
| `seat`      | `void`                             | Replace the whole record in one silent call — the owning builder's bulk re-seat channel.                                                                                 |
| `destroy`   | `void`                             | Idempotent teardown — emits `destroy`, then destroys the emitter LAST.                                                                                                   |

#### `DefinitionBuilderInterface`

The `DEFINITION_BUILDER_BRAND`-carrying stateful builder accumulating a `Definition` through its self-owning manager properties (`groups` / `factors` / `rules` / `equations` / `variables` / `facts` / `inferences`, each listed earlier) plus a private scalar envelope. After `destroy()`, every method except `destroy` itself and the `emitter` / manager-property getters throws `DESTROYED`.

| Method    | Returns      | Behavior                                                                                                                                         |
| --------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `build`   | `Definition` | TOTAL, deterministic — a fresh plain `Definition` snapshot (envelope + the kind's managers), every call.                                         |
| `merge`   | `void`       | Reconcile with an incoming plain `Definition` of the SAME `reasoning` — distributes scalars into the envelope and collections into the managers. |
| `clear`   | `void`       | Delete one optional envelope field for the instance's `reasoning`; a non-clearable `key` throws `MISMATCH`.                                      |
| `destroy` | `void`       | Idempotent teardown — cascades `destroy` to every manager, then destroys the builder emitter LAST.                                               |

#### `SubjectBuilderInterface`

The `SUBJECT_BUILDER_BRAND`-carrying stateful builder accumulating a `Subject`. The array overload of `remove` is declared FIRST so a key list resolves to the batch form. After `destroy()`, every method except `destroy` itself and the `emitter` getter throws `DESTROYED`.

| Method    | Returns              | Behavior                                                                                                                                                                                                    |
| --------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field`   | `unknown`            | Read ONE top-level field by key.                                                                                                                                                                            |
| `fields`  | `Subject`            | A live read of the whole current record.                                                                                                                                                                    |
| `set`     | `void`               | Upsert one field (delegates to `assignField`); `set('id', …)` throws — id is immutable, id-ful or anonymous alike.                                                                                          |
| `remove`  | `boolean \| void`    | Remove non-id fields — no argument every one, one key that one, a key list those; the keyed forms report whether every named key existed, and the no-argument form emits one `remove` per key in key order. |
| `merge`   | `void`               | Reconcile with an incoming plain `Subject`; incoming wins, base `id` kept.                                                                                                                                  |
| `clear`   | `void`               | Remove every non-id field.                                                                                                                                                                                  |
| `repeat`  | `readonly Subject[]` | Produce `count` deterministic minted-id clones as plain payloads — a pure read, does NOT emit.                                                                                                              |
| `build`   | `Subject`            | TOTAL, deterministic — a fresh durable payload snapshot of the current state, every call.                                                                                                                   |
| `destroy` | `void`               | Idempotent teardown — destroys the emitter LAST.                                                                                                                                                            |

## Contract

These invariants hold across `src/core` ↔ `reason.md`:

1. **DOC ↔ SOURCE bijection.** Every `function` / `class` / `const` / `interface` / `type` row in the `## Surface` tables is a real export of the reason source tree, and every export appears as a Surface row — exhaustive, both directions.
2. **Deterministic, synchronous, immutable.** Same subject + same definition → the same result, every time — no clocks, no randomness, no I/O, nothing async. No input is ever mutated; every result (and every builder output) is a fresh object. A result always carries `success`, a `trace` narrating each step, and the accumulated `errors` — an error does NOT abort the run (the value / conclusion / solutions are still computed from whatever applied), it makes `success` false. Expression evaluation and symbolic isolation recurse with the input expression's own depth, so a pathologically deep hand-built expression (on the order of `10,000` levels of nesting) is OUTSIDE the supported contract and may exhaust the call stack; `extractAtoms` and `containsVariable` are the exception — both walk ITERATIVELY and stay total at any depth. The two workspace builders (and their managers) are the deliberate stateful exception to statelessness, not to immutability: they mutate NOTHING they are given (the seed is spread on construction, every mutation is copy-on-write through the pure helper family), and `build()` returns a fresh payload deterministically derived from the current state, every call — handed to `reason` by the caller, never built inside the engine.
3. **Dispatch and `bail`.** The orchestrator is a thin router: registry lookup by `definition.reasoning`, one reasoner per reasoning, re-registration replaces. A registry miss throws `MISSING` and a pre-run validation failure (only when the `validate` option is on) throws `INVALID` — both are caller misuse, BYPASS `bail`, and emit nothing. A reasoner throw always emits `error` with the raw thrown value; under `bail: true` (the default) it is rethrown, under `bail: false` it becomes an empty type-shaped failure result. Only successful results emit `reason`. The batch overload maps subjects in order (per-subject validation when on).
4. **Failure results, not throws, inside a reasoner.** A reasoner's single throw is `MISMATCH` (handed a definition of a different reasoning); every structural malformation — missing / non-array `groups` / `rules` / `equations` / `facts` — yields a failure RESULT, because the runtime never assumes `validate` ran. The operators are total the same way: an unknown `Comparison` surfaces as `CheckResult.error` (`met: false`), an unknown `MathOperation` returns the value unchanged, divide-by-zero is `NaN`, and the `Aggregator` has fixed empty-input identities (`sum` / `average` → `0`, `product` → `1`, `minimum` / `maximum` → `NaN`). Definition arrays (`facts` / `inferences` / `rules` / `equations` / `groups` / `factors`) are iterated defensively — an array hole, `null`, or other ill-typed junk entry is skipped rather than crashing evaluation.
5. **Guard totality and exactness.** Every validator is a total `Guard` — adversarial input (cycles, depth, hostile prototypes) returns `false`, never throws. Caller-supplied INPUT records are exact and their numeric fields require `isFiniteNumber` because definitions must survive JSON. RESULT guards accept open objects, including class instances, and guard published numeric members with `isNumber`, including `NaN` and infinities. Nested result members follow the same posture; `isInferentialResult` checks `derived` with the open `isResultFact` guard. The recursive input shapes enter through `lazyOf`; `isProofNode` uses a bounded iterative traversal. Builders omit absent optional input keys so their outputs round-trip the input guards. Numeric subject reads coerce through the contracts `parseNumber` — an unresolvable field (including `NaN` / `±Infinity` subject values) takes the `fallback` path, never the non-finite error path (still reachable through static sources and transform / inversion results).
6. **Observation is a pure side-channel.** The `Reason` owns a typed `emitter` (`ReasonEventMap` — `register(reasoning)` / `reason(result)` / `error(error)` / `destroy()`); each MANAGER owns its own (`{X}ManagerEventMap` — its mutation verbs, element-id payloads, plus `destroy`), and the builders keep reduced maps of the operations that are theirs alone (`DefinitionBuilderEventMap` — `merge` / `clear` / `destroy`; `SubjectBuilderEventMap` — `set` / `remove` / `merge` / `clear` / `destroy`); reasoners and operators are event-free by design (stateless evaluators have no observable lifecycle). Every event is emitted directly and synchronously, AFTER the mutation it reports; listener isolation is the emitter's own — a throwing listener routes to the `error` OPTION handler (`(error, event)`), never onto the domain map. `destroy()` clears the registry, emits `destroy`, then destroys the emitter LAST; it is idempotent, and afterwards every method except the `emitter` getter and `destroy` itself throws `DESTROYED`. The managers follow the identical lifecycle, and `DefinitionBuilder.destroy()` cascades to every manager FIRST, its own emitter last.
7. **Coded errors.** Every throw out of this module is a `ReasonError` with a machine-readable `code` (`MISSING` / `INVALID` / `MISMATCH` / `DESTROYED` / `TARGET` / `OPERATOR`) and — except `DESTROYED` — a `context` carrying the definition id and the reasoning involved, or the offending `id` / `target` / `groupId` for `TARGET`, the `key` for a non-clearable `clear`, and the `operator` for `OPERATOR`; `catch` blocks narrow with `isReasonError`, never `as`. `MISMATCH` covers a cross-reasoning definition handed to a reasoner or to `DefinitionBuilder.merge`, a `clear` key that is not clearable for the builder's reasoning, and a write to a `SubjectBuilder`'s immutable `id`; `DESTROYED` covers any use of a destroyed orchestrator, builder, or manager; `OPERATOR` covers a math operator outside the accepted vocabulary — `invertLeft` / `invertRight` on a non-invertible operation, and `applyOperation` on an unknown one.
8. **DOC ↔ SOURCE method bijection.** Every behavioral interface's `## Methods` table lists exactly its public methods (call-signature members) — exhaustive, both directions — and each implementing class exposes the same public methods, no more. A renamed / added / removed method breaks the gate until the table is reconciled.

These runtime rules hold alongside the numbered invariants. Derivation bookkeeping compares with SameValueZero (`equalValues`), so a NaN-valued conclusion or fact term derives once and the fixpoint converges. The definition-level quantitative value is finite-checked after rounding (`Definition "<id>" produced non-finite value: <v>`). `roundTo` passes the value through unchanged at extreme precisions whose scale factor overflows. Inverting a left-operand divide by zero (`x / 0 = c`) yields the non-finite equation error. A lookup reads only OWN table keys, and a missing / `null` field takes the `fallback` before any `''` key. The malformed-shape paths stay graceful — a missing / non-array `premises` on a backward logical rule errors and excludes it, on a backward inferential candidate skips it silently, and a missing factor `source` resolves to the fallback path. `validate` adds uniqueness / confidence / overlay-mismatch / unbound-variable WARNINGS (`Duplicate <noun> id "<id>"`, `confidence outside [0, 1]`, the array-path overlay-key mismatch, the unbound `?variable` conclusion) while runtime behavior around duplicates — and around every other warned shape — is unchanged. Still out of scope: asynchronous reasoners, definition persistence, and contract-DSL shapes for the definition family (the plain guards in § Validators suffice) — all additive, leaving the preceding surface unchanged.

## Patterns

### Quantitative scoring

Each factor runs a pipeline — `checks` gate (ALL must be met) → `source` resolve (`fallback` when unresolvable) → finite check → `transforms` chain → `bounds` clamp — in ascending `priority` order (stable). A group's value is its `base` plus the weighted aggregation of the factors that APPLIED, clamped but never rounded; `strict: true` makes the group all-or-nothing. The definition's value aggregates the applied groups (no weights at this level), clamps, rounds to `precision`, then is finite-CHECKED: the `Aggregator`'s empty-input `NaN` for `minimum` / `maximum` is its deliberate "no data" signal, so aggregating zero applied groups under those surfaces as a `Definition "<id>" produced non-finite value: NaN` error (`success: false`, the `NaN` left visible in `value`) rather than a silent success. An UNAPPLIED group's `GroupResult.value` may still be `NaN` the same way — it is excluded from the definition aggregate, so only its own record shows it.

```ts
import {
	createBounds,
	createCheck,
	createFactorGroup,
	createFieldFactor,
	createLookupFactor,
	createQuantitativeDefinition,
	createQuantitativeReasoner,
	createReason,
	createTransform,
} from '@orkestrel/reason'

const reason = createReason({ reasoners: [createQuantitativeReasoner()] })

const definition = createQuantitativeDefinition('premium', 'Premium', [
	createFactorGroup(
		'risk',
		'sum',
		[
			createFieldFactor('age', 'age', {
				checks: [createCheck('licensed', 'equals', true)], // gate: all checks must be met
				transforms: [createTransform('percentage', 50)], // then 50% of the raw value
				bounds: createBounds(0, 40), // then clamp
				required: true, // a gate/resolve failure becomes a result ERROR
			}),
			createLookupFactor('region', 'region', { CA: 12, NY: 8 }, { fallback: 5, weight: 2 }),
		],
		{ base: 100 },
	),
])

const result = reason.reason({ age: 40, licensed: true, region: 'CA' }, definition)
if (result.reasoning === 'quantitative') {
	result.value // 144 — 100 + sum(20 · 1, 12 · 2), precision-rounded
	result.groups[0]?.factors // the per-factor breakdown (raw vs value)
}
```

An `enabled: false` factor or group is skipped and OMITTED from results; a `required` factor that fails its gate or cannot resolve adds an error (`success: false`) while the rest of the run continues.

The three operators (`Evaluator` / `Transformer` / `Aggregator`) are usable directly, independent of any reasoner — the `QuantitativeReasoner` composes them internally, but each is a total, injectable seam:

```ts
import {
	createAggregator,
	createCheck,
	createEvaluator,
	createTransform,
	createTransformer,
} from '@orkestrel/reason'

const evaluator = createEvaluator()
evaluator.evaluate(createCheck('age', 'above', 18), { age: 25 }) // { field: 'age', met: true, actual: 25 }
evaluator.batch([createCheck('age', 'above', 18)], { age: 25 }) // one CheckResult per check, positionally

const transformer = createTransformer()
transformer.apply(10, createTransform('multiply', 2)) // 20 — one math step
transformer.chain(10, [createTransform('add', 5), createTransform('multiply', 2)]) // 30 — left-folded

const aggregator = createAggregator()
aggregator.aggregate([10, 20, 30], 'sum') // 60
```

### Numeric domains

`reason` runs on ordinary JS `number` — binary floating point, not decimal. A definition's `value` rounds to `precision` (`DEFAULT_PRECISION = 4`) only ONCE, at the end of the pipeline (`transforms` → `bounds` → terminal round, preceding), so intermediate float error from earlier steps has already accumulated before that single round ever sees it. TC39 `Decimal` is still Stage 1, so until it lands the compliant answer for a money-like domain is a scaled-integer recipe, not a new dependency.

**Scaled integers.** Represent a money amount as integer minor units (cents), a rate as integer basis points (`1e-4` units), a ppm quantity as integer `1e-6` units — do the arithmetic on the scaled integers and divide back only for display. Binary floating point cannot represent most decimal fractions exactly:

```ts
0.1 + 0.2 // 0.30000000000000004 — not 0.3
```

Summing one hundred `$0.1` line items as floats drifts the same way (`9.99999999999998`, not `10`), while summing the equivalent `10`-cent integers is exact: `1000` cents accumulated, divided back once → `$10.00`.

**When `roundTo(4)` is sufficient.** A single terminal rounding of a SHALLOW computation recovers the intended decimal — the preceding float noise is well inside the half-ulp window at 4 places:

```ts
roundTo(0.1 + 0.2, 4) // 0.3
```

**When `roundTo(4)` is NOT sufficient.**

(a) A domain finer than 4 decimals loses precision to `precision: 4` itself, not to float error — a ppm quantity (`1e-6` units) truncates to `0`:

```ts
roundTo(1 / 1_000_000, 4) // 0 — the ppm value is gone
roundTo(1 / 1_000_000, 6) // 0.000001 — recovered only at a finer precision
```

(b) Error that compounds across several `percentage` / `divide` steps BEFORE the terminal round can cross a half-ulp boundary at the 4th place even though rounding still happens only once. Three chained 5% / 5% / 15% increases on `100` followed by a `divide` by `6` land EXACTLY on a rounding boundary, `21.13125`, which rounds half-up to `21.1313` — but the float chain's accumulated binary error lands just under it, so `roundTo` rounds the wrong way:

```ts
;(100 * 1.05 * 1.05 * 1.15) / 6 // 21.131249999999998 — not the exact 21.13125
roundTo((100 * 1.05 * 1.05 * 1.15) / 6, 4) // 21.1312 — rounds DOWN, wrong
roundTo(21.13125, 4) // 21.1313 — the exact value would round UP
```

The scaled-integer fix carries the SAME chain as an exact rational (numerator over denominator) instead of folding a float at every step, and divides + rounds only once at the very end:

```ts
const numerator = 100n * 105n * 105n * 115n // the three +5% / +5% / +15% multipliers
const denominator = 100n * 100n * 100n * 6n // their scale, plus the final /6
const scaled = (numerator * 20000n) / denominator // ×2 so the half bit survives truncation
const rounded = scaled % 2n >= 1n ? scaled / 2n + 1n : scaled / 2n // one terminal round-half-up
Number(rounded) / 10000 // 21.1313 — matches the exact value
```

**Cross-reference.** The quantitative pipeline's `transforms` are opaque math steps and its terminal round is a single `roundTo(precision)` call — inject the scale factor before the first `transform` (convert the field/static source into scaled-integer minor units) and divide back out after reading `result.value`, rather than trying to make the pipeline itself decimal-exact.

### Logical chaining — forward and backward

Forward chaining runs the rules (ascending `priority`) to a fixpoint: each firing rule asserts its conclusion's atoms as derived facts overlaid on the subject (keyed by `formatField`), until an iteration derives nothing or `depth` is hit; the reported `rules` are then re-evaluated in ORIGINAL order against the final overlay, and `conclusion` is the LAST rule's conclusion. Backward chaining proves EVERY enabled, conclusion-bearing rule goal-first in priority order (each proof sharing the growing derived overlay) — recursing into rules whose conclusions can establish a premise, with a visited-rule cycle guard, the `depth` cap, and negation-as-failure for `not`; the overall `conclusion` is the last priority-sorted rule's result.

```ts
import {
	createAtom,
	createCompound,
	createLogicalDefinition,
	createLogicalReasoner,
	createReason,
	createRule,
} from '@orkestrel/reason'

const reason = createReason({ reasoners: [createLogicalReasoner()] })

const rules = [
	createRule('adult', [createAtom('age', 'from', 18)], createAtom('adult', 'equals', true)),
	createRule(
		'eligible',
		[
			createCompound('and', [
				createAtom('adult', 'equals', true),
				createAtom('accidents', 'below', 2),
			]),
		],
		createAtom('eligible', 'equals', true),
	),
]

const forward = reason.reason(
	{ age: 25, accidents: 0 },
	createLogicalDefinition('e', 'Eligibility', rules),
)
if (forward.reasoning === 'logical') forward.conclusion // true — 'eligible' through the derived 'adult'

// Backward: prove the last rule's conclusion, recursing only where needed.
const goal = createLogicalDefinition('e', 'Eligibility', rules, { strategy: 'backward', depth: 5 })
```

Connectives evaluate eagerly (every operand evaluates — no short-circuit): `not` reads only its first operand, `implies` is vacuously true below two operands, `xor` is false. Conclusion extraction ignores connectives — EVERY atom inside a firing rule's conclusion is asserted.

Three quirks to design around. **Derived-overlay keys are `formatField` strings**: a conclusion written with an ARRAY path derives the dot-joined flat key, so a chained premise must read it with the dotted-STRING form — an array-path premise descends into nesting the overlay never creates. **A `premises: []` rule diverges by strategy**: forward reports `Rule "<id>" has no premises — skipped` (an error, the rule excluded); backward applies it VACUOUSLY (no premise can fail), which is the intended rule rather than a defect. **The fixpoint snapshots per iteration**: a derivation made mid-pass is invisible until the NEXT pass (unlike the inferential reasoner's live fact list), so a `depth` cap truncates chains one hop per iteration regardless of declaration order.

### Symbolic solving

Bindings start from the definition's `variables`, then numeric subject fields OVERRIDE same-named variables (every own key except `id`, coerced with `parseNumber`). Equations solve strictly in order: when the `target` is unbound and sits on exactly one side, it is isolated algebraically through the `INVERTIBLE_OPERATIONS`; each solution is rounded to `precision` BEFORE feeding forward into later equations. A failing equation (unbound variable, non-invertible isolation, non-finite value) records an error and a `FAILED` trace — the run continues.

```ts
import {
	createConstant,
	createEquation,
	createOperation,
	createReason,
	createSymbolicDefinition,
	createSymbolicReasoner,
	createVariable,
} from '@orkestrel/reason'

const reason = createReason({ reasoners: [createSymbolicReasoner()] })

const definition = createSymbolicDefinition(
	'pricing',
	'Pricing',
	[
		// net + tax = total → isolate: net = total - tax
		createEquation(
			'net',
			createOperation('add', createVariable('net'), createVariable('tax')),
			createVariable('total'),
			'net',
		),
		// discount = net * 10 / 100 — 'net' has just been fed forward
		createEquation(
			'discount',
			createVariable('discount'),
			createOperation(
				'divide',
				createOperation('multiply', createVariable('net'), createConstant(10)),
				createConstant(100),
			),
			'discount',
		),
	],
	{ variables: { tax: 5 } },
)

const result = reason.reason({ total: 25 }, definition) // subject overrides / supplies bindings
if (result.reasoning === 'symbolic') result.solutions // { net: 20, discount: 2 }
definition.equations // the two equations in the preceding fence, in solve order
```

### Inferential derivation and proof

Scalar subject fields are injected as `has(key, value)` base facts. Forward chaining unifies each enabled inference's premise patterns against the known facts (a `'?'`-prefixed string term is a variable; bindings must be consistent within a match, relational-join style) and derives every instantiated conclusion to a fixpoint — deduplicated, each with confidence = the product of its premise facts' confidences × the inference's own, rounded to `CONFIDENCE_PRECISION`. Backward proving returns the FIRST provable conclusion with its `ProofNode` tree.

```ts
import {
	createFact,
	createInference,
	createInferentialDefinition,
	createInferentialReasoner,
	createReason,
} from '@orkestrel/reason'

const reason = createReason({ reasoners: [createInferentialReasoner()] })

const definition = createInferentialDefinition(
	'family',
	'Family',
	[createFact('f1', 'parent', ['alice', 'bob']), createFact('f2', 'parent', ['bob', 'carol'], 0.9)],
	[
		createInference(
			'grand',
			[createFact('p1', 'parent', ['?x', '?y']), createFact('p2', 'parent', ['?y', '?z'])],
			createFact('c1', 'grandparent', ['?x', '?z']),
		),
	],
)

const result = reason.reason({}, definition)
if (result.reasoning === 'inferential') {
	result.derived // grandparent('alice', 'carol') — confidence 0.9 (1 × 0.9 × 1)
}
definition.facts // the two seed facts in the preceding fence
definition.inferences // the one inference rule in the preceding fence

// Backward: prove one conclusion and return its proof tree.
const proved = reason.reason(
	{},
	createInferentialDefinition(
		'family',
		'Family',
		[createFact('f1', 'parent', ['alice', 'bob']), createFact('f2', 'parent', ['bob', 'carol'])],
		[
			createInference(
				'grand',
				[createFact('p1', 'parent', ['?x', '?y']), createFact('p2', 'parent', ['?y', '?z'])],
				createFact('c1', 'grandparent', ['?x', '?z']),
			),
		],
		{ strategy: 'backward' },
	),
)
if (proved.reasoning === 'inferential') proved.proof // the ProofNode tree, depth-annotated
```

Backward proving is a predicate-level reachability HEURISTIC, not full resolution: each premise is proved independently under the goal's bindings (no cross-premise binding consistency), and a proven goal's `derived` fact may keep uninstantiated `?variables` in its `terms`. A goal that is already a base fact still reports a `derived` duplicate stamped with the inference's confidence, over a bare fact-leaf proof node (no `inference` / `children` keys). Forward chaining is the sound engine — reach for backward when a cheap proof tree is the point. Forward's `knownFacts` also grows LIVE within an iteration (a fact derived early in a pass can feed a later inference in the SAME pass), so a `depth`-capped run derives more when inferences are declared in dependency order — the opposite temperament to the logical reasoner's per-iteration snapshot.

### Shaping definitions as data

A definition is plain data, so deriving a changed one is a pure function call — the capability-layer helpers cover every collection with `append` / `prepend` / `replace` / `remove`, whole definitions with `merge*`, optional fields with `clear*`, and the JSON boundary with `parseDefinition`. Every call returns a FRESH definition; the input is never touched. Insertions dedup-then-insert (re-adding an id MOVES it — `replace*` is the position-preserving update), and an optional `target` id places the new element relative to an existing one; a `target` naming nothing throws `TARGET`.

```ts
import {
	appendFactor,
	appendGroup,
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
	createStaticFactor,
	mergeQuantitativeDefinition,
	parseDefinition,
	replaceGroup,
} from '@orkestrel/reason'

const base = createQuantitativeDefinition('risk', 'Risk', [
	createFactorGroup('drivers', 'sum', [createStaticFactor('floor', 10)]),
])

// Grow a group, then swap the grown group back in — position preserved.
const drivers = base.groups[0]
const grown =
	drivers === undefined
		? base
		: replaceGroup(base, appendFactor(drivers, createFieldFactor('age', 'age')))

// Append a sibling group after 'drivers' (target names the anchor id).
const wide = appendGroup(
	grown,
	createFactorGroup('region', 'sum', [createStaticFactor('flat', 5)]),
	'drivers',
)

// Reconcile a revision wholesale — id-keyed collections merge, incoming scalars win.
const merged = mergeQuantitativeDefinition(
	wide,
	createQuantitativeDefinition('risk', 'Risk v2', []),
)

// The JSON round-trip: stringify any definition, narrow it back fail-safe.
const restored = parseDefinition(JSON.stringify(merged)) // Definition | undefined — junk parses to undefined
```

The subject engine mirrors this on the other end of `reason(subject, definition)` — `assignField` / `removeField` upsert and delete top-level fields copy-on-write (deleting OMITS the key, never writes `undefined`), `mergeSubjects` reconciles incoming-wins with the base `id` preserved, and `repeatSubject` mints `count` deterministic clones (`` `${baseId}-0` ``, `` `${baseId}-1` ``, … — no randomness) for batch runs.

### The definition workspace — `DefinitionBuilder`

For INCREMENTAL authoring — a builder UI, an MCP session, anything that accumulates a definition across many steps — wrap the data in the stateful builder. Each manager is SELF-OWNING: it owns one collection with single-word verbs, mutations delegate to the preceding pure helpers, copy-on-write into the manager's OWN private state, and emit through the manager's OWN emitter. Managers are also BRING-YOUR-OWN: the builder constructs seed-filled defaults, but any slot accepts a pre-built manager (`createDefinitionBuilder(seed, { rules: createRuleManager({ rules }) })`) — the bring-your-own-manager construction pattern. The engine never builds for you: call `build()` and hand the fresh plain `Definition` to `reason` / `validate` at the call site.

```ts
import {
	createCheck,
	createQuantitativeReasoner,
	createReason,
	createDefinitionBuilder,
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
	createStaticFactor,
} from '@orkestrel/reason'

const draft = createDefinitionBuilder(
	createQuantitativeDefinition('risk', 'Risk', [
		createFactorGroup('drivers', 'sum', [createStaticFactor('floor', 10)]),
	]),
)

draft.factors.append('drivers', createFieldFactor('age', 'age')) // into the named group
draft.factors.replace(
	'drivers',
	createFieldFactor('age', 'age', { checks: [createCheck('licensed', 'equals', true)] }),
) // in place
draft.groups.append(createFactorGroup('region', 'sum', [createStaticFactor('flat', 5)]))
draft.groups.prepend(createFactorGroup('base', 'sum', [createStaticFactor('seed', 1)])) // insert at the start
draft.groups.group('region') // FactorGroup | undefined — the accessors read
draft.clear('description') // delete one optional field for this reasoning

const reason = createReason({ reasoners: [createQuantitativeReasoner()] })
const result = reason.reason({ age: 25, licensed: true }, draft.build()) // build OUTSIDE, pass the payload
if (result.reasoning === 'quantitative') result.value // 41 — 1 + (10 + 25) + 5

draft.groups.seat([createFactorGroup('only', 'sum', [])]) // swap a whole collection in one silent step — an authoring surface's "load this revision"
const payload = draft.build() // a fresh plain Definition every call — store it, ship it, reason over it
draft.destroy() // idempotent; cascades to the managers; afterwards mutation throws DESTROYED
```

Managers are KIND-FREE: an off-kind mutation (`draft.rules.append(...)` on a quantitative draft) is INERT, never a throw — the rules accumulate in the `RuleManager` but `build()` composes only the collections belonging to the draft's `reasoning`, so they never surface in the payload. Design around this deliberately: nothing warns about off-kind state. `merge` requires the same `reasoning` (else `MISMATCH`) and re-seats collections through each manager's `seat` SILENTLY (no per-element events) — the same channel an authoring surface calls to swap a whole collection in one step; re-seeding is `createDefinitionBuilder(parseDefinition(text) ?? fallback)` — `build()` output and `parseDefinition` are exact inverses across the JSON boundary. Rule and equation order stay load-bearing exactly as in the plain data: `rules.append` without a `target` makes the new rule the forward conclusion; `equations.append` places it last in the solve order. One nesting echo: factors live INSIDE groups, so a `factors` mutation writes the updated group back through the sibling `GroupManager` — the factor event fires on `factors.emitter` AND a `replace` fires on `groups.emitter` for the containing group.

Every manager exposes the same accessor pair over its own collection — here each one is read on a draft of its own `reasoning`:

```ts
import {
	createAtom,
	createConstant,
	createDefinitionBuilder,
	createEquation,
	createFact,
	createInference,
	createInferentialDefinition,
	createLogicalDefinition,
	createRule,
	createSymbolicDefinition,
	createVariable,
} from '@orkestrel/reason'

const logical = createDefinitionBuilder(createLogicalDefinition('elig', 'Eligibility', []))
logical.rules.append(
	createRule('adult', [createAtom('age', 'from', 18)], createAtom('adult', 'equals', true)),
)
logical.rules.rule('adult')?.name // 'adult' — `name` default: the id
logical.rules.rules().length // 1

const symbolic = createDefinitionBuilder(createSymbolicDefinition('rate', 'Rate', []))
symbolic.equations.append(createEquation('e1', createVariable('x'), createConstant(42), 'x'))
symbolic.equations.equation('e1')?.target // 'x'
symbolic.variables.add('x', 42)
symbolic.variables.variable('x') // 42

const inferential = createDefinitionBuilder(
	createInferentialDefinition('mortality', 'Mortality', [], []),
)
inferential.facts.append(createFact('f1', 'human', ['socrates']))
inferential.facts.fact('f1')?.predicate // 'human'
inferential.inferences.append(
	createInference(
		'mortal',
		[createFact('p1', 'human', ['?x'])],
		createFact('c1', 'mortal', ['?x']),
	),
)
inferential.inferences.inference('mortal')?.name // 'mortal'
```

### The subject workspace — `SubjectBuilder`

The subject side is one flat collection of fields, so verbs sit directly on the builder (no managers, no `append` / `prepend`). The `id` is OPTIONAL and immutable through the builder — when absent the builder is ANONYMOUS (`.id` is `undefined`, `build()` emits no `id` key); `repeat` turns one accumulated subject into a deterministic batch.

```ts
import { createQuantitativeReasoner, createReason, createSubjectBuilder } from '@orkestrel/reason'

const reason = createReason({ reasoners: [createQuantitativeReasoner()] })

const applicant = createSubjectBuilder({ id: 'alice', age: 25 })
applicant.set('region', 'CA')
applicant.merge({ licensed: true, accidents: 0 }) // incoming wins, id kept
applicant.remove(['accidents']) // batch form first — returns whether ALL existed
applicant.fields() // { id: 'alice', age: 25, region: 'CA', licensed: true } — the plural read

const result = reason.reason(applicant.build(), definition) // build OUTSIDE, pass the payload
const cohort = applicant.repeat(3) // plain subjects: ids 'alice-0', 'alice-1', 'alice-2'
const results = reason.reason(cohort, definition) // the batch overload, as ever
```

`fields()` reads the whole current record and `field(key)` one top-level key — nested records are composed as VALUES (read deep at evaluation time through `FieldPath` arrays), not navigated by the builder. `set('id', …)` and `remove('id')` throw `MISMATCH`: the id is the builder's identity and the `repeat` minting base.

### Observing

The `Reason` exposes a typed `emitter` for fire-and-forget observers — logging, metrics, an audit trail. Subscribe through `reason.emitter.on(...)`, or wire initial listeners through the reserved `on` option with the `error` option as the emitter's OWN listener-error handler.

```ts
import { createQuantitativeReasoner, createReason } from '@orkestrel/reason'

const reason = createReason({
	reasoners: [createQuantitativeReasoner()],
	on: { error: (error) => console.error('reasoner threw:', error) }, // initial listeners
	error: (error, event) => console.warn(`listener threw on "${event}"`, error), // the isolation handler
})

reason.emitter.on('register', (reasoning) => console.log(`registered ${reasoning}`))
reason.emitter.on('reason', (result) => metrics.record(result.reasoning, result.success))
```

The event vocabulary:

| Entity              | Event map                   | Events                                                                                                                          |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Reason`            | `ReasonEventMap`            | `register(reasoning)` · `reason(result)` · `error(error)` · `destroy()`                                                         |
| `DefinitionBuilder` | `DefinitionBuilderEventMap` | `merge(reasoning)` · `clear(key)` · `destroy()` (per-element mutations fire on the managers' OWN emitters)                      |
| the list managers   | `{X}ManagerEventMap`        | `append(id)` · `prepend(id)` · `replace(id)` · `remove(id)` · `destroy()` — Group / Factor / Rule / Equation / Fact / Inference |
| `VariableManager`   | `VariableManagerEventMap`   | `add(name)` · `remove(name)` · `destroy()` — the name-keyed record has no placement verbs                                       |
| `SubjectBuilder`    | `SubjectBuilderEventMap`    | `set(key, value)` · `remove(key)` · `merge(incoming)` · `clear()` · `destroy()`                                                 |

`register` fires per registration (constructor seeding does NOT fire it); `reason` fires once per result the reasoner RETURNS, synchronously before it returns — this includes a `success: false` result the reasoner returns normally (a malformed definition, say), not only successes. A reasoner THROW never fires `reason`: it fires `error` with the raw thrown value instead, then either rethrows (`bail: true`, the default) or is converted into a type-shaped failure result (`bail: false`) that IS returned to the caller but does NOT fire `reason`; `destroy` fires once. `MISSING` / `INVALID` throws emit nothing — they are caller misuse, not reasoning outcomes. Reasoners and operators are event-free by design; observe the orchestrator — or the workspace builders, which take the same `on` / `error` options and emit one verb-named event per mutation through their own emitters (each `DefinitionBuilder` manager owns its OWN emitter — the builder's own emitter carries only `merge` / `clear` / `destroy`; `variables.add` reports as `add` and `variables.remove` as `remove`, each carrying the variable NAME; a pure read — `build`, `repeat`, the accessors — never emits).

```ts
const draft = createDefinitionBuilder(seed, {
	on: { merge: (reasoning) => audit.record('merge', reasoning) }, // builder-level listeners
})
draft.groups.emitter.on('append', (id) => audit.record('group.append', id)) // per-manager mutation events
draft.emitter.on('merge', (reasoning) => console.log(`merged a ${reasoning} revision`))
```

### Narrowing untrusted definitions

Definitions are JSON-serializable data, so they arrive from storage / the wire as `unknown`. Narrow in two passes: the structural guard (`isDefinition` — exact records, total on adversarial input), then the semantic pass (`validate` — ids present, sources declared, non-empty rule sets) whose `warnings` flag runnable-but-suspicious definitions.

```ts
import { createLogicalReasoner, createReason, isDefinition } from '@orkestrel/reason'
import { parseJSON } from '@orkestrel/contract'

const reason = createReason({ reasoners: [createLogicalReasoner()] })
const parsed = parseJSON(text) // unknown — the JSON boundary: narrow, never assert

if (isDefinition(parsed)) {
	const validation = reason.validate(parsed) // the semantic pass — returns, never throws
	if (validation.valid) reason.reason(subject, parsed)
	else console.warn(validation.errors, validation.warnings)
}
```

`warnings` flag the runnable-but-suspicious: empty collections, duplicate rule / group / factor / equation / inference ids (`Duplicate <noun> id "<id>"`, once per duplicated id), inferential confidences outside `[0, 1]`, a logical conclusion's array-path overlay key also read through an array-path premise elsewhere (`Overlay key "<key>" is written through an array path AND also read through an array path — the flat overlay key will not resolve`, `findOverlayMismatches`), and an inferential conclusion `?variable` unbound by all of its inference's premises (`Inference "<id>" conclusion variable "<variable>" is unbound by all premises`, `findUnboundVariables`). The RUNTIME stays permissive about all of them — duplicates in particular are first/last-wins artifacts (a group's weight lookup takes the FIRST same-id factor; a degenerate forward rule id-poisons its valid same-id twin out of the run), which is exactly why `validate` warns.

Prefer this at boundaries over the orchestrator's `validate: true` option (which throws `INVALID` per call); use the option when a throw IS the right failure mode — for example definitions authored in code, where invalidity is a programmer error.

### Practices

- **Register every reasoner before the first `reason` call** — dispatch is a registry lookup; a miss throws `MISSING` regardless of `bail`.
- **Build definitions with the value factories** — they default `name` to the id, omit absent optional keys (so outputs round-trip the EXACT-record validators), and keep call sites terse.
- **Gate untrusted definitions twice** — `isDefinition` for shape at the boundary, `validate` for semantics; reserve the `validate: true` option for programmer-error contexts.
- **Keep ids unique** — `validate` only WARNS on duplicates; the runtime resolves them first/last-wins, silently.
- **Check `success` before trusting the payload** — errors accumulate without aborting, so a `value` / `conclusion` computed alongside errors is a partial answer.
- **Read the `trace` when a result surprises you** — every skip, gate, derivation, and convergence is narrated step by step.
- **Use `FieldPath` arrays for nested access** — `['address', 'city']` descends; a dotted string like `'address.city'` is ONE literal key, never split.
- **Choose `bail` deliberately** — the default (`true`) rethrows a reasoner throw after the `error` emit; `bail: false` degrades it to an empty failure result for batch pipelines that must keep going.
- **Reach for the helpers to derive, the workspace builders to accumulate** — a one-shot change is a pure helper call on plain data; a definition or subject built up across many steps (a builder UI, an MCP session) lives in a `createDefinitionBuilder` / `createSubjectBuilder` workspace.
- **`build()` at the call site, always** — the engine takes only plain data; `reason.reason(subject.build(), draft.build())` makes the build step visible, and the payload is exactly what ran.
- **Gate authoring verbs by `reasoning`** — managers are kind-free, so an off-kind mutation accumulates silently and never surfaces in `build()`; offer only the current kind's verbs on an authoring surface.
- **Store `build()` output, not builders** — `JSON.stringify(draft.build())` out, `parseDefinition` back in, re-seed a fresh builder; the builder itself is a live workspace, not a payload.
- **Mind the two meanings of `is…` at the boundary** — `isDefinition` narrows the plain DATA; `isDefinitionBuilder` / `isSubjectBuilder` are the builder BRAND guards. A plain record carrying a `build` function is still data — only the brand makes a builder. A `Subject` is any plain record, so narrow one with `isRecord` from `@orkestrel/contract` — this package publishes no guard for it.
- **Destroy when done** — `destroy()` releases the registry and the emitter (the builders cascade to their managers first); a destroyed instance throws `DESTROYED` on use (narrow with `isReasonError`).

## Tests

- [`tests/guides.test.ts`](../tests/guides.test.ts) — the `## Surface` ↔ `src/core` bijection (value + type exports) and the `## Methods` ↔ interface-method bijection.
- [`tests/src/core/Reason.test.ts`](../tests/src/core/Reason.test.ts) — the orchestrator: dispatch, batch order, `bail` both ways, the `MISSING` / `INVALID` / `DESTROYED` codes, event sequences, idempotent `destroy`, build-outside equivalence (a builder's `build()` output reasons identically to inline plain data).
- [`tests/src/core/builders/DefinitionBuilder.test.ts`](../tests/src/core/builders/DefinitionBuilder.test.ts) — the definition builder: mutation → `build` round-trips per manager, inert off-kind managers, per-manager event pins, manager + builder destroy semantics, brand-forge negatives, seed immutability.
- [`tests/src/core/builders/SubjectBuilder.test.ts`](../tests/src/core/builders/SubjectBuilder.test.ts) — the subject builder: id defaulting + immutability + anonymous builds, batch `remove`, incoming-wins `merge`, deterministic `repeat`, `build` determinism, destroy semantics.
- [`tests/src/core/helpers.test.ts`](../tests/src/core/helpers.test.ts) — `formatField`, `clamp` / `roundTo` / `matchesBounds` / `equalValues` / `sortByPriority` / `findDuplicates`, the fact and algebra machinery, and the capability-layer engine (`appendById` placement + `TARGET`, per-kind append / prepend / replace / remove, `merge*` / `clear*`, `parseDefinition`, the subject helpers).
- [`tests/src/core/validators.test.ts`](../tests/src/core/validators.test.ts) — each guard accepts valid / rejects invalid + adversarial junk, exact-record semantics, `lazyOf` recursion containment.
- [`tests/src/core/factories.test.ts`](../tests/src/core/factories.test.ts) — every value factory's output shape (override merging, key omission, `name` defaulting); every entity factory wires a working instance with custom `id`s through the options objects.
- [`tests/src/core/operators/Evaluator.test.ts`](../tests/src/core/operators/Evaluator.test.ts) — all ten comparisons (strictness, numeric requirements, the `any` / `none` asymmetry vs the pure-negation `outside`), `FieldPath` resolution, unknown-operator totality.
- [`tests/src/core/operators/Transformer.test.ts`](../tests/src/core/operators/Transformer.test.ts) — per-operation operand defaults, divide-by-zero `NaN`, unary operations, `chain` folding.
- [`tests/src/core/operators/Aggregator.test.ts`](../tests/src/core/operators/Aggregator.test.ts) — empty-input identities, weight-as-exponent `product`, zero-total-weight `average`, length-mismatch weight fallback.
- [`tests/src/core/reasoners/QuantitativeReasoner.test.ts`](../tests/src/core/reasoners/QuantitativeReasoner.test.ts) — the factor pipeline, priorities, `strict` / `required`, source resolution + `parseNumber` coercion, base / bounds / precision stacking.
- [`tests/src/core/reasoners/LogicalReasoner.test.ts`](../tests/src/core/reasoners/LogicalReasoner.test.ts) — forward fixpoint + derived overlays, backward proving + cycle safety, the connective truth tables.
- [`tests/src/core/reasoners/SymbolicReasoner.test.ts`](../tests/src/core/reasoners/SymbolicReasoner.test.ts) — subject binding + overrides, isolation through invertible operations, rounded feed-forward, per-equation failure isolation.
- [`tests/src/core/reasoners/InferentialReasoner.test.ts`](../tests/src/core/reasoners/InferentialReasoner.test.ts) — unification + relational joins, confidence products, dedupe, subject-fact injection, backward proof trees.
- [`tests/src/core/integration.test.ts`](../tests/src/core/integration.test.ts) — cross-strategy scenarios through one orchestrator.

## See also

- [`contract.md`](contract.md) — the guards, combinators, and `parseNumber` coercion the validators and reasoners compose.
- [`emitter.md`](emitter.md) — the typed emitter behind the orchestrator's observation surface.
- [`AGENTS.md`](../AGENTS.md) — the rules.
- [`README.md`](README.md) — the guides index.
