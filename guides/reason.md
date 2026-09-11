# Reason

> A synchronous, deterministic reasoning engine: declarative JSON-serializable
> definitions evaluated against plain subject records to produce traceable
> results, through the `quantitative`, `logical`, `symbolic`, and `inferential`
> strategies behind one dispatch surface.

Each strategy is a `ReasonerInterface` registered on the thin `Reason` orchestrator: `quantitative` scores factors into a number, `logical` deduces booleans from rules by forward or backward chaining, `symbolic` solves algebraic equations by variable isolation, and `inferential` derives facts through unification variables and proof trees. The injectable `Evaluator`, `Transformer`, and `Aggregator` operators do the arithmetic every strategy shares. Every result is a fresh object carrying `success`, a human-readable `trace`, and accumulated `errors`; nothing mutates its inputs.

The design stance is data in, data out, no surprises. Definitions are pure data, built by hand or with the shipped value factories. The orchestrator holds no strategy logic — dispatch is a registry lookup by the `reasoning` discriminant. The operators are total: an unknown comparison surfaces as a `CheckResult.error`, an unknown math operation is a no-op, and divide-by-zero is `NaN` rather than a throw. A reasoner never assumes `validate` ran, so a malformed definition yields a failure result and a throw is reserved for caller misuse, as a coded `ReasonError`.

On top of the evaluation engine sits the definitions & subjects capability layer: a pure copy-on-write helper family that changes, extends, merges, and round-trips definitions as data, plus the brand-guarded `DefinitionBuilder` (one self-owning manager per collection) and `SubjectBuilder` (one flat collection) workspaces, which accumulate state through named methods and `build()` a fresh plain payload on demand. Building happens outside the engine: `reason` and `validate` take only the plain data, so a builder's `build()` output is passed at the call site. Deliberately absent: async reasoners, definition persistence, and probabilistic strategies beyond the multiplicative `confidence` of inferential facts. Source: [`src/core`](../src/core). Surfaced through the `@src/core` barrel.

## Surface

### Create an orchestrator and score a subject

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

reason.supports('quantitative') // true — a reasoner is registered for this reasoning
reason.reasoner('quantitative')?.supports(definition) // the reasoner's own guard, same check
```

`reason` dispatches by `definition.reasoning` — pass an array of subjects and the batch overload maps them in order onto an equal-length result array. Results are a discriminated union (`reasoning` names the axis): narrow with the discriminant and read the strategy-specific payload (`value` / `conclusion` / `solutions` / `derived`).

### Entity factories

| API                          | Kind     | Summary                                                                                                                                                                                                                |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createReason`               | function | Creates the reasoning orchestrator.                                                                                                                                                                                    |
| `createQuantitativeReasoner` | function | Creates the quantitative reasoner — factor-based numeric scoring.                                                                                                                                                      |
| `createLogicalReasoner`      | function | Creates the logical reasoner — rule-based deduction with forward / backward chaining.                                                                                                                                  |
| `createSymbolicReasoner`     | function | Creates the symbolic reasoner — algebraic equation solving by variable isolation.                                                                                                                                      |
| `createInferentialReasoner`  | function | Creates the inferential reasoner — fact derivation with unification variables and proof trees.                                                                                                                         |
| `createEvaluator`            | function | Creates a check evaluator.                                                                                                                                                                                             |
| `createTransformer`          | function | Creates a math transformer.                                                                                                                                                                                            |
| `createAggregator`           | function | Creates a number aggregator.                                                                                                                                                                                           |
| `createDefinitionBuilder`    | function | Creates a `DefinitionBuilder` — a stateful workspace builder accumulating a `Definition` through the `groups`, `factors`, `rules`, `equations`, `variables`, `facts`, and `inferences` self-owning manager properties. |
| `createSubjectBuilder`       | function | Creates a `SubjectBuilder` — a stateful workspace builder accumulating a `Subject`.                                                                                                                                    |
| `createGroupManager`         | function | Creates a `GroupManager` — a self-owning manager over a quantitative definition's `groups`.                                                                                                                            |
| `createFactorManager`        | function | Creates a `FactorManager` — the divergent manager over a group's `factors`, threaded through a required `groupId` locator.                                                                                             |
| `createRuleManager`          | function | Creates a `RuleManager` — a self-owning manager over a logical definition's `rules`.                                                                                                                                   |
| `createEquationManager`      | function | Creates an `EquationManager` — a self-owning manager over a symbolic definition's `equations`.                                                                                                                         |
| `createVariableManager`      | function | Creates a `VariableManager` — a self-owning manager over a symbolic definition's `variables` (a name-keyed record; `add` / `remove` only).                                                                             |
| `createFactManager`          | function | Creates a `FactManager` — a self-owning manager over an inferential definition's `facts`.                                                                                                                              |
| `createInferenceManager`     | function | Creates an `InferenceManager` — a self-owning manager over an inferential definition's `inferences`.                                                                                                                   |

### Orchestrator & reasoners

| API                    | Kind  | Summary                                                                                     |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------- |
| `Reason`               | class | Implements the reasoning orchestrator — a thin router over registered `ReasonerInterface`s. |
| `QuantitativeReasoner` | class | Performs factor-based numeric scoring.                                                      |
| `LogicalReasoner`      | class | Deduces booleans from rules with forward or backward chaining.                              |
| `SymbolicReasoner`     | class | Solves algebraic equations by variable isolation.                                           |
| `InferentialReasoner`  | class | Derives facts with unification variables and proof trees.                                   |

### Operators

| API           | Kind  | Summary                                                                                                           |
| ------------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| `Evaluator`   | class | Evaluates `Check`s against subjects — the shared predicate engine of the quantitative and logical reasoners.      |
| `Transformer` | class | Applies math `Transform`s to numbers — the quantitative reasoner's per-factor pipeline stage.                     |
| `Aggregator`  | class | Reduces number lists to one number per `Aggregation` — the quantitative reasoner's group and definition combiner. |

### Classes

The definitions & subjects capability layer's stateful workspace builders: mutate through named methods, then `build()` a fresh plain payload to hand to `reason` at the call site. The managers are self-owning (each owns its own collection state and emitter, takes its own options, and has its own factory) and kind-free (an off-kind manager accumulates silently and is ignored by `build()` — never a `MISMATCH`). `DefinitionBuilder` and `SubjectBuilder` each carry a `unique symbol` brand — `DEFINITION_BUILDER_BRAND` and `SUBJECT_BUILDER_BRAND` — that `isDefinitionBuilder` and `isSubjectBuilder` read through `Reflect.get`, so plain data can never forge a builder.

| API                 | Kind  | Summary                                                                                                                                                                                                                                                   |
| ------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DefinitionBuilder` | class | Implements a stateful workspace builder accumulating a `Definition` through always-present self-owning manager properties: a private scalar envelope (reasoning / id / name plus the kind's scalars) composed with each collection read from its manager. |
| `GroupManager`      | class | Implements the `GroupManagerInterface` — a self-owning, kind-free manager over a quantitative definition's `groups`.                                                                                                                                      |
| `FactorManager`     | class | Implements the `FactorManagerInterface` — the one divergent manager: factors nest inside groups, so it holds no collection state of its own and threads a required `groupId` locator.                                                                     |
| `RuleManager`       | class | Implements the `RuleManagerInterface` — a self-owning, kind-free manager over a logical definition's `rules`.                                                                                                                                             |
| `EquationManager`   | class | Implements the `EquationManagerInterface` — a self-owning, kind-free manager over a symbolic definition's `equations`.                                                                                                                                    |
| `VariableManager`   | class | Implements the `VariableManagerInterface` — a self-owning, kind-free manager over a symbolic definition's `variables`, a name-keyed unordered record.                                                                                                     |
| `FactManager`       | class | Implements the `FactManagerInterface` — a self-owning, kind-free manager over an inferential definition's `facts`.                                                                                                                                        |
| `InferenceManager`  | class | Implements the `InferenceManagerInterface` — a self-owning, kind-free manager over an inferential definition's `inferences`.                                                                                                                              |
| `SubjectBuilder`    | class | Implements a stateful workspace builder accumulating a `Subject` — one flat key-value collection, no managers.                                                                                                                                            |

### Value factories

Plain-data constructors for the declarative definition vocabulary — no lifecycle, no emitter, no identity. Reach for the entity factories earlier when you need a working instance instead.

| API                            | Kind     | Summary                                                                                              |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| `createCheck`                  | function | Creates a `Check` — one field predicate.                                                             |
| `createAtom`                   | function | Creates an atom `Expression` — a leaf wrapping one `Check`.                                          |
| `createCompound`               | function | Creates a compound `Expression` — a logical connective over nested operands.                         |
| `createRule`                   | function | Creates a `Rule` — premises and a conclusion.                                                        |
| `createTransform`              | function | Creates a `Transform` — one math step.                                                               |
| `createBounds`                 | function | Creates a `Bounds` — an inclusive numeric clamp.                                                     |
| `createVariable`               | function | Creates a variable `SymbolicExpression` leaf.                                                        |
| `createConstant`               | function | Creates a constant `SymbolicExpression` leaf.                                                        |
| `createOperation`              | function | Creates an operation `SymbolicExpression` node.                                                      |
| `createEquation`               | function | Creates an `Equation` — `left = right`, solved for `target`.                                         |
| `createFact`                   | function | Creates a `Fact` — a predicate over positional terms.                                                |
| `createInference`              | function | Creates an `Inference` — premise patterns and a conclusion pattern.                                  |
| `createStaticSource`           | function | Creates a static `Source` — a fixed number.                                                          |
| `createFieldSource`            | function | Creates a field `Source` — a subject field read as a number.                                         |
| `createLookupSource`           | function | Creates a lookup `Source` — a subject field mapped through a table.                                  |
| `createRangeSource`            | function | Creates a range `Source` — a numeric subject field banded through ordered ranges (first match wins). |
| `createStaticFactor`           | function | Creates a `Factor` over a static `Source`.                                                           |
| `createFieldFactor`            | function | Creates a `Factor` over a field `Source`.                                                            |
| `createLookupFactor`           | function | Creates a `Factor` over a lookup `Source`.                                                           |
| `createRangeFactor`            | function | Creates a `Factor` over a range `Source`.                                                            |
| `createFactorGroup`            | function | Creates a `FactorGroup`.                                                                             |
| `createQuantitativeDefinition` | function | Creates a `QuantitativeDefinition`.                                                                  |
| `createLogicalDefinition`      | function | Creates a `LogicalDefinition`.                                                                       |
| `createSymbolicDefinition`     | function | Creates a `SymbolicDefinition`.                                                                      |
| `createInferentialDefinition`  | function | Creates an `InferentialDefinition`.                                                                  |

Every value factory returns a fresh object and omits absent optional keys entirely, so its output round-trips the exact-record validators in § Validators.

### Helpers

| API                        | Kind     | Summary                                                                                                                                                 |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatField`              | function | Formats a `FieldPath` for display — the single string key itself, or the array segments joined with `.`.                                                |
| `clamp`                    | function | Clamps a number to inclusive `Bounds`.                                                                                                                  |
| `roundTo`                  | function | Rounds a number to a fixed count of decimal places.                                                                                                     |
| `matchesBounds`            | function | Checks whether a value falls inside an inclusive range expressed as an array.                                                                           |
| `emptyAggregate`           | function | Returns the empty-input identity of one `Aggregation`.                                                                                                  |
| `resolveSource`            | function | Resolves one `Source` against a subject, falling back when it cannot.                                                                                   |
| `equalValues`              | function | Determines whether two values are SameValueZero-equal — strict `===` with `NaN` equal to itself (and, unlike `Object.is`, `+0` equal to `-0`).          |
| `sortByPriority`           | function | Sorts items ascending by `priority ?? DEFAULT_PRIORITY` — a stable copy sort.                                                                           |
| `findDuplicates`           | function | Collects the ids that appear more than once in an id-carrying list — each duplicated id reported once, in first-occurrence order.                       |
| `factToArityKey`           | function | Derives a fact's predicate+arity bucket key — length-prefixed so the delimiter cannot be forged.                                                        |
| `indexByArity`             | function | Buckets facts by predicate+arity, preserving append order within each bucket.                                                                           |
| `termToKey`                | function | Derives one fact term's contribution to a dedup key — reference identity for non-null objects / functions, a SameValueZero value string for primitives. |
| `factToKey`                | function | Derives a fact's canonical dedup key — predicate + arity + per-term SameValueZero identity, with confidence excluded from it.                           |
| `matchFacts`               | function | Unifies a pattern fact positionally against a candidate fact — returning the variable bindings on success, `undefined` on mismatch.                     |
| `instantiateFact`          | function | Substitutes a fact's bound `'?'`-variables with their values — a fresh fact with unbound terms passed through unchanged.                                |
| `subjectToFacts`           | function | Projects a subject's scalar fields into `has(key, value)` base facts — the inferential reasoner's subject-injection step.                               |
| `computePremiseConfidence` | function | Computes the confidence a set of matched premises contributes to a derived fact — the product of each premise's first matching fact's confidence.       |
| `containsVariable`         | function | Determines whether a symbolic expression contains an unbound occurrence of a target variable.                                                           |
| `invertLeft`               | function | Inverts a `x op right = value` step, solving for the left operand `x`.                                                                                  |
| `invertRight`              | function | Inverts a `left op x = value` step, solving for the right operand `x`.                                                                                  |
| `applyOperation`           | function | Applies one binary/unary math operation to already-evaluated operands.                                                                                  |
| `resolveOperand`           | function | Resolves the effective right operand of a math operation — the supplied `operand`, or the operation's own identity-preserving default when absent.      |
| `extractAtoms`             | function | Returns every atom leaf of an expression tree, depth-first, left-to-right.                                                                              |
| `extractConclusions`       | function | Flattens a logical conclusion expression into its asserted `field = value` pairs, ignoring the connectives.                                             |
| `findOverlayMismatches`    | function | Collects the flattened overlay keys written through an array path and also read through an array path.                                                  |
| `findUnboundVariables`     | function | Collects the `'?'`-prefixed conclusion variables no premise binds.                                                                                      |
| `buildErrorResult`         | function | Builds the empty, type-shaped failure `ReasonResult` matching a definition's reasoning.                                                                 |

The definitions & subjects capability layer (§ Classes) adds a pure, copy-on-write change / extend / merge / store surface over every definition kind, plus a subject engine of pure helpers — none of it mutates an input, and every helper returns a fresh value.

| API                           | Kind     | Summary                                                                                                                                                 |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appendById`                  | function | Inserts `item` into an id-keyed collection, deduping any existing element sharing its id, then placing it at the end, or immediately after `target`.    |
| `prependById`                 | function | Inserts `item` into an id-keyed collection, deduping any existing element sharing its id, then placing it at the start, or immediately before `target`. |
| `replaceById`                 | function | Swaps the element sharing `item.id` in place, preserving its position.                                                                                  |
| `removeById`                  | function | Filters every element sharing `id` out of an id-keyed collection.                                                                                       |
| `mergeById`                   | function | Reconciles two id-keyed collections — an incoming-order upsert with base-only survivors appended after.                                                 |
| `definitionToEnvelope`        | function | Projects a `Definition` to its scalar envelope — the kind's collections drop out.                                                                       |
| `appendGroup`                 | function | Inserts `group` into a `QuantitativeDefinition`'s `groups` — dedup-then- insert at the end, or immediately after `target`.                              |
| `prependGroup`                | function | Inserts `group` into a `QuantitativeDefinition`'s `groups` — dedup-then- insert at the start, or immediately before `target`.                           |
| `replaceGroup`                | function | Swaps the group sharing `group.id` in a `QuantitativeDefinition` in place, preserving its position (appended when absent).                              |
| `removeGroup`                 | function | Removes every group sharing `id` from a `QuantitativeDefinition` (no-op when absent).                                                                   |
| `appendFactor`                | function | Inserts `factor` into a `FactorGroup`'s `factors` — dedup-then-insert at the end, or immediately after `target`.                                        |
| `prependFactor`               | function | Inserts `factor` into a `FactorGroup`'s `factors` — dedup-then-insert at the start, or immediately before `target`.                                     |
| `replaceFactor`               | function | Swaps the factor sharing `factor.id` in a `FactorGroup` in place, preserving its position (appended when absent).                                       |
| `removeFactor`                | function | Removes every factor sharing `id` from a `FactorGroup` (no-op when absent).                                                                             |
| `appendRule`                  | function | Inserts a rule into a `LogicalDefinition`'s `rules` — dedup-then-insert at the end, or immediately after `target`.                                      |
| `prependRule`                 | function | Inserts a rule into a `LogicalDefinition`'s `rules` — dedup-then-insert at the start, or immediately before `target`.                                   |
| `replaceRule`                 | function | Swaps the rule sharing `rule.id` in a `LogicalDefinition` in place, preserving its position (appended when absent).                                     |
| `removeRule`                  | function | Removes every rule sharing `id` from a `LogicalDefinition` (no-op when absent).                                                                         |
| `appendEquation`              | function | Inserts an equation into a `SymbolicDefinition`'s `equations` — dedup- then-insert at the end, or immediately after `target`.                           |
| `prependEquation`             | function | Inserts an equation into a `SymbolicDefinition`'s `equations` — dedup- then-insert at the start, or immediately before `target`.                        |
| `replaceEquation`             | function | Swaps the equation sharing `equation.id` in a `SymbolicDefinition` in place, preserving its position (appended when absent).                            |
| `removeEquation`              | function | Removes every equation sharing `id` from a `SymbolicDefinition` (no-op when absent).                                                                    |
| `addVariable`                 | function | Upserts one entry of a `SymbolicDefinition`'s `variables`.                                                                                              |
| `removeVariable`              | function | Removes one entry of a `SymbolicDefinition`'s `variables`.                                                                                              |
| `appendFact`                  | function | Inserts a fact into an `InferentialDefinition`'s `facts` — dedup-then- insert at the end, or immediately after `target`.                                |
| `prependFact`                 | function | Inserts a fact into an `InferentialDefinition`'s `facts` — dedup-then- insert at the start, or immediately before `target`.                             |
| `replaceFact`                 | function | Swaps the fact sharing `fact.id` in an `InferentialDefinition` in place, preserving its position (appended when absent).                                |
| `removeFact`                  | function | Removes every fact sharing `id` from an `InferentialDefinition` (no-op when absent).                                                                    |
| `appendInference`             | function | Inserts an inference into an `InferentialDefinition`'s `inferences` — dedup-then-insert at the end, or immediately after `target`.                      |
| `prependInference`            | function | Inserts an inference into an `InferentialDefinition`'s `inferences` — dedup-then-insert at the start, or immediately before `target`.                   |
| `replaceInference`            | function | Swaps the inference sharing `inference.id` in an `InferentialDefinition` in place, preserving its position (appended when absent).                      |
| `removeInference`             | function | Removes every inference sharing `id` from an `InferentialDefinition` (no-op when absent).                                                               |
| `mergeQuantitativeDefinition` | function | Reconciles two `QuantitativeDefinition`s onto `base`'s id.                                                                                              |
| `mergeLogicalDefinition`      | function | Reconciles two `LogicalDefinition`s onto `base`'s id.                                                                                                   |
| `mergeSymbolicDefinition`     | function | Reconciles two `SymbolicDefinition`s onto `base`'s id.                                                                                                  |
| `mergeInferentialDefinition`  | function | Reconciles two `InferentialDefinition`s onto `base`'s id.                                                                                               |
| `clearQuantitativeDefinition` | function | Deletes one optional field of a `QuantitativeDefinition`.                                                                                               |
| `clearLogicalDefinition`      | function | Deletes one optional field of a `LogicalDefinition`.                                                                                                    |
| `clearSymbolicDefinition`     | function | Deletes one optional field of a `SymbolicDefinition`.                                                                                                   |
| `clearInferentialDefinition`  | function | Deletes one optional field of an `InferentialDefinition`.                                                                                               |
| `parseDefinition`             | function | Parses a JSON string into a `Definition`, failing safe to `undefined`.                                                                                  |
| `assignField`                 | function | Upserts one field of a `Subject` — copy-on-write spread.                                                                                                |
| `removeField`                 | function | Deletes one field of a `Subject` — destructure-rest omit.                                                                                               |
| `mergeSubjects`               | function | Reconciles two `Subject`s — incoming-wins spread, with the base `id` preserved when present.                                                            |
| `repeatSubject`               | function | Produces `count` deterministic clones of a `Subject`.                                                                                                   |

### Validators

Total guards return `false`, never throw, for adversarial input such as junk, cycles, and hostile prototypes. Input guards compose the [contracts](contract.md) combinators. Result guards use bespoke open member checks and retain those combinators for nested values. Exactness follows who produces the value, not who declares the type: caller-supplied input records are exact, while package or foreign-interface result records are open to extra members. Numeric input fields guard with `isFiniteNumber` (JSON cannot carry `NaN` / `±Infinity`); the recursive input shapes recurse through `lazyOf`.

In a guard table a `Shape` cell holds the type the guard narrows to.

| API                        | Kind     | Shape                              | Summary                                                                                                                                                 |
| -------------------------- | -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isReasoning`              | const    | `Reasoning`                        | Determines whether a value is a `Reasoning` literal.                                                                                                    |
| `isChainingStrategy`       | const    | `ChainingStrategy`                 | Determines whether a value is a `ChainingStrategy` literal.                                                                                             |
| `isMathOperation`          | const    | `MathOperation`                    | Determines whether a value is a `MathOperation` literal.                                                                                                |
| `isAggregation`            | const    | `Aggregation`                      | Determines whether a value is an `Aggregation` literal.                                                                                                 |
| `isComparison`             | const    | `Comparison`                       | Determines whether a value is a `Comparison` literal.                                                                                                   |
| `isLogicalOperator`        | const    | `LogicalOperator`                  | Determines whether a value is a `LogicalOperator` literal.                                                                                              |
| `isFieldPath`              | const    | `FieldPath`                        | Determines whether a value is a `FieldPath` — a single string key or an array of keys descending into nested objects.                                   |
| `isNumberRecord`           | const    | `Readonly<Record<string, number>>` | Determines whether a value is a record whose every value is a finite number — the shape of a `LookupSource.table` and a `SymbolicDefinition.variables`. |
| `isCheck`                  | function | `Check`                            | Determines whether a value is a `Check` — a field / operator / value predicate.                                                                         |
| `isTransform`              | function | `Transform`                        | Determines whether a value is a `Transform` — one math step.                                                                                            |
| `isBounds`                 | function | `Bounds`                           | Determines whether a value is a `Bounds` — an inclusive numeric clamp.                                                                                  |
| `isFactorRange`            | function | `FactorRange`                      | Determines whether a value is a `FactorRange` — one band of a range source.                                                                             |
| `isSource`                 | function | `Source`                           | Determines whether a value is a `Source` — a static, field, lookup, or range factor source, discriminated by `origin`.                                  |
| `isFactor`                 | function | `Factor`                           | Determines whether a value is a `Factor` — one scored input of a quantitative group.                                                                    |
| `isFactorGroup`            | function | `FactorGroup`                      | Determines whether a value is a `FactorGroup` — a group of factors aggregated into one value.                                                           |
| `isExpression`             | function | `Expression`                       | Determines whether a value is an `Expression` — a boolean expression tree of atoms and compounds, discriminated by `form`.                              |
| `isRule`                   | function | `Rule`                             | Determines whether a value is a `Rule` — premises and a conclusion.                                                                                     |
| `isSymbolicExpression`     | function | `SymbolicExpression`               | Determines whether a value is a `SymbolicExpression` — an algebraic expression tree of variables, constants, and operations, discriminated by `form`.   |
| `isEquation`               | function | `Equation`                         | Determines whether a value is an `Equation` — `left = right`, solved for `target`.                                                                      |
| `isFact`                   | function | `Fact`                             | Determines whether a value is a `Fact` — a predicate over positional terms.                                                                             |
| `isInference`              | function | `Inference`                        | Determines whether a value is an `Inference` — premise patterns and a conclusion pattern.                                                               |
| `isQuantitativeDefinition` | function | `QuantitativeDefinition`           | Determines whether a value is a `QuantitativeDefinition`.                                                                                               |
| `isLogicalDefinition`      | function | `LogicalDefinition`                | Determines whether a value is a `LogicalDefinition`.                                                                                                    |
| `isSymbolicDefinition`     | function | `SymbolicDefinition`               | Determines whether a value is a `SymbolicDefinition`.                                                                                                   |
| `isInferentialDefinition`  | function | `InferentialDefinition`            | Determines whether a value is an `InferentialDefinition`.                                                                                               |
| `isDefinition`             | function | `Definition`                       | Determines whether a value is a `Definition` — a quantitative, logical, symbolic, or inferential definition shape, discriminated by `reasoning`.        |
| `isQuantitativeClearKey`   | const    | `QuantitativeClearKey`             | Determines whether a value is a `QuantitativeClearKey` — an optional field `clearQuantitativeDefinition` can delete.                                    |
| `isLogicalClearKey`        | const    | `LogicalClearKey`                  | Determines whether a value is a `LogicalClearKey` — an optional field `clearLogicalDefinition` can delete.                                              |
| `isSymbolicClearKey`       | const    | `SymbolicClearKey`                 | Determines whether a value is a `SymbolicClearKey` — an optional field `clearSymbolicDefinition` can delete.                                            |
| `isInferentialClearKey`    | const    | `InferentialClearKey`              | Determines whether a value is an `InferentialClearKey` — an optional field `clearInferentialDefinition` can delete.                                     |
| `isResultFact`             | function | `Fact`                             | Determines whether a value is a result-side `Fact`.                                                                                                     |
| `isCheckResult`            | function | `CheckResult`                      | Determines whether a value is a `CheckResult`.                                                                                                          |
| `isFactorResult`           | function | `FactorResult`                     | Determines whether a value is a `FactorResult`.                                                                                                         |
| `isGroupResult`            | function | `GroupResult`                      | Determines whether a value is a `GroupResult`.                                                                                                          |
| `isRuleResult`             | function | `RuleResult`                       | Determines whether a value is a `RuleResult`.                                                                                                           |
| `isProofNode`              | function | `ProofNode`                        | Determines whether a value is a depth-bounded, acyclic `ProofNode` tree.                                                                                |
| `isQuantitativeResult`     | function | `QuantitativeResult`               | Determines whether a value is a `QuantitativeResult`.                                                                                                   |
| `isLogicalResult`          | function | `LogicalResult`                    | Determines whether a value is a `LogicalResult`.                                                                                                        |
| `isSymbolicResult`         | function | `SymbolicResult`                   | Determines whether a value is a `SymbolicResult`.                                                                                                       |
| `isInferentialResult`      | function | `InferentialResult`                | Determines whether a value is an `InferentialResult`.                                                                                                   |
| `isReasonResult`           | function | `ReasonResult`                     | Determines whether a value is any `ReasonResult` arm.                                                                                                   |
| `isReasonValidationResult` | function | `ReasonValidationResult`           | Determines whether a value is a `ReasonValidationResult`.                                                                                               |
| `isDefinitionBuilder`      | function | `DefinitionBuilderInterface`       | Determines whether a value is a `DefinitionBuilder` entity — the brand-guarded stateful workspace, not the plain `Definition` data union.               |
| `isSubjectBuilder`         | function | `SubjectBuilderInterface`          | Determines whether a value is a `SubjectBuilder` entity — the brand-guarded stateful workspace, not the plain `Subject` data record.                    |

### Errors

| API             | Kind     | Summary                                             |
| --------------- | -------- | --------------------------------------------------- |
| `ReasonError`   | class    | Represents an error thrown by the reasons layer.    |
| `isReasonError` | function | Narrows an unknown caught value to a `ReasonError`. |

### Constants

A `Shape` cell holds the constant's declared type.

| API                        | Kind  | Shape                        | Summary                                                                                                                                                                            |
| -------------------------- | ----- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_REASON_BAIL`      | const | `boolean`                    | Holds the default `bail` for the `Reason` orchestrator — a reasoner throw is rethrown after the `error` emit. Default: `true`.                                                     |
| `DEFAULT_VALIDATE`         | const | `boolean`                    | Holds the default `validate` for the `Reason` orchestrator — per-call validation is skipped. Default: `false`.                                                                     |
| `DEFAULT_DEPTH`            | const | `number`                     | Holds the default `depth` for chaining definitions — the forward-iteration / backward-recursion cap of the logical and inferential reasoners. Default: `10`.                       |
| `DEFAULT_BASE`             | const | `number`                     | Holds the default `base` added before aggregation, at both group and definition level. Default: `0`.                                                                               |
| `DEFAULT_PRECISION`        | const | `number`                     | Holds the default `precision` (decimal places) for quantitative values and symbolic solutions. Default: `4`.                                                                       |
| `DEFAULT_CONFIDENCE`       | const | `number`                     | Holds the default `confidence` for facts, inferences, and injected subject facts. Default: `1`.                                                                                    |
| `DEFAULT_WEIGHT`           | const | `number`                     | Holds the default factor `weight` at group aggregation. Default: `1`.                                                                                                              |
| `DEFAULT_PRIORITY`         | const | `number`                     | Holds the default factor / rule `priority` — evaluation order is ascending and stable. Default: `0`.                                                                               |
| `CONFIDENCE_PRECISION`     | const | `number`                     | Holds the decimal places a derived fact's confidence is rounded to during forward inferential chaining.                                                                            |
| `INVERTIBLE_OPERATIONS`    | const | `ReadonlySet<MathOperation>` | Lists the math operations the symbolic reasoner can invert while isolating a target variable — anything else (a `power`, an `abs`) fails the equation with a non-invertible error. |
| `EVALUATOR_ID`             | const | `string`                     | Names the default `id` for an `Evaluator`.                                                                                                                                         |
| `TRANSFORMER_ID`           | const | `string`                     | Names the default `id` for a `Transformer`.                                                                                                                                        |
| `AGGREGATOR_ID`            | const | `string`                     | Names the default `id` for an `Aggregator`.                                                                                                                                        |
| `QUANTITATIVE_ID`          | const | `string`                     | Names the default `id` for a `QuantitativeReasoner`.                                                                                                                               |
| `LOGICAL_ID`               | const | `string`                     | Names the default `id` for a `LogicalReasoner`.                                                                                                                                    |
| `SYMBOLIC_ID`              | const | `string`                     | Names the default `id` for a `SymbolicReasoner`.                                                                                                                                   |
| `INFERENTIAL_ID`           | const | `string`                     | Names the default `id` for an `InferentialReasoner`.                                                                                                                               |
| `DEFINITION_BUILDER_BRAND` | const | `unique symbol`              | Holds the `DefinitionBuilder` entity brand — a `unique symbol` key carrying `readonly true` on every `DefinitionBuilderInterface` instance.                                        |
| `SUBJECT_BUILDER_BRAND`    | const | `unique symbol`              | Holds the `SubjectBuilder` entity brand — a `unique symbol` key carrying `readonly true` on every `SubjectBuilderInterface` instance.                                              |

### Types

A `Shape` cell holds an interface's data members as bare names in braces, `?` marking an optional member and `plus` introducing its call-signature members, and a type alias's own type literal with a union's arms escaped as `\|`.

| Type                          | Kind      | Shape                                                                                                                                                                                        | Summary                                                                                                                                                                                                                                               |
| ----------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Reasoning`                   | type      | `'quantitative' \| 'logical' \| 'symbolic' \| 'inferential'`                                                                                                                                 | Names the reasoning strategies — the axis a `Definition` and a `ReasonResult` discriminate on.                                                                                                                                                        |
| `ChainingStrategy`            | type      | `'forward' \| 'backward'`                                                                                                                                                                    | Names how a chaining reasoner walks its rules: `forward` (data-driven fixpoint) or `backward` (goal-driven proving).                                                                                                                                  |
| `MathOperation`               | type      | `'add' \| 'subtract' \| 'multiply' \| 'divide' \| 'percentage' \| 'minimum' \| 'maximum' \| 'average' \| 'power' \| 'round' \| 'ceil' \| 'floor' \| 'abs'`                                   | Names a math operation applied by the `TransformerInterface` and inside `SymbolicExpression` trees.                                                                                                                                                   |
| `Aggregation`                 | type      | `'sum' \| 'product' \| 'average' \| 'minimum' \| 'maximum'`                                                                                                                                  | Names how the `AggregatorInterface` reduces a list of numbers to one.                                                                                                                                                                                 |
| `Comparison`                  | type      | `'equals' \| 'not' \| 'above' \| 'below' \| 'from' \| 'to' \| 'any' \| 'none' \| 'between' \| 'outside'`                                                                                     | Names the comparison a `Check` applies between a resolved subject field and its expected value.                                                                                                                                                       |
| `LogicalOperator`             | type      | `'and' \| 'or' \| 'not' \| 'implies' \| 'xor'`                                                                                                                                               | Names a logical connective inside a compound `Expression`.                                                                                                                                                                                            |
| `Subject`                     | type      | `Readonly<Record<string, unknown>>`                                                                                                                                                          | Represents the data record being reasoned about — a plain readonly bag of fields, read by `FieldPath`.                                                                                                                                                |
| `Check`                       | interface | `{ field, operator, value }`                                                                                                                                                                 | Represents a single field predicate: resolves `field` from the subject and compares it to `value` with `operator`.                                                                                                                                    |
| `CheckResult`                 | interface | `{ field, met, actual, error? }`                                                                                                                                                             | Represents the outcome of one `Check` evaluation.                                                                                                                                                                                                     |
| `Transform`                   | interface | `{ operation, operand? }`                                                                                                                                                                    | Represents one math step applied to a number by the `TransformerInterface`.                                                                                                                                                                           |
| `Bounds`                      | interface | `{ minimum?, maximum? }`                                                                                                                                                                     | Represents an inclusive numeric clamp — either side may be absent (unbounded).                                                                                                                                                                        |
| `StaticSource`                | interface | `{ origin, value }`                                                                                                                                                                          | Represents a factor source yielding a fixed number.                                                                                                                                                                                                   |
| `FieldSource`                 | interface | `{ origin, field }`                                                                                                                                                                          | Represents a factor source reading a subject field as a number.                                                                                                                                                                                       |
| `LookupSource`                | interface | `{ origin, field, table }`                                                                                                                                                                   | Represents a factor source mapping a subject field through a lookup table.                                                                                                                                                                            |
| `RangeSource`                 | interface | `{ origin, field, ranges }`                                                                                                                                                                  | Represents a factor source banding a numeric subject field through ordered ranges.                                                                                                                                                                    |
| `Source`                      | type      | `StaticSource \| FieldSource \| LookupSource \| RangeSource`                                                                                                                                 | Represents a static, field, lookup, or range factor source, discriminated by `origin`.                                                                                                                                                                |
| `FactorRange`                 | interface | `{ bounds?, value }`                                                                                                                                                                         | Represents one band of a `RangeSource` — an optional inclusive bounds test and the value it yields.                                                                                                                                                   |
| `Factor`                      | interface | `{ id, name, description?, source, fallback?, checks?, transforms?, bounds?, weight?, priority?, enabled?, required? }`                                                                      | Represents one scored input of a quantitative group.                                                                                                                                                                                                  |
| `FactorGroup`                 | interface | `{ id, name, description?, factors, aggregation, base?, bounds?, enabled?, strict? }`                                                                                                        | Represents a group of factors aggregated into one value.                                                                                                                                                                                              |
| `QuantitativeDefinition`      | interface | `{ reasoning, id, name, description?, groups, aggregation, base?, bounds?, precision? }`                                                                                                     | Defines factor-based numeric scoring.                                                                                                                                                                                                                 |
| `Atom`                        | interface | `{ form, check }`                                                                                                                                                                            | Represents a leaf boolean expression — one `Check` against the subject.                                                                                                                                                                               |
| `Compound`                    | interface | `{ form, operator, operands }`                                                                                                                                                               | Represents a compound boolean expression — a `LogicalOperator` over nested operands.                                                                                                                                                                  |
| `Expression`                  | type      | `Atom \| Compound`                                                                                                                                                                           | Represents a boolean expression tree, discriminated by `form`.                                                                                                                                                                                        |
| `Rule`                        | interface | `{ id, name, description?, premises, conclusion, priority?, enabled? }`                                                                                                                      | Represents one deduction rule: when every premise holds, the `conclusion`'s atoms are asserted as derived facts.                                                                                                                                      |
| `LogicalDefinition`           | interface | `{ reasoning, id, name, description?, rules, strategy, depth? }`                                                                                                                             | Defines rule-based deduction.                                                                                                                                                                                                                         |
| `Variable`                    | interface | `{ form, name }`                                                                                                                                                                             | Represents a symbolic expression leaf naming a variable.                                                                                                                                                                                              |
| `Constant`                    | interface | `{ form, value }`                                                                                                                                                                            | Represents a symbolic expression leaf holding a fixed number.                                                                                                                                                                                         |
| `Operation`                   | interface | `{ form, operator, left, right? }`                                                                                                                                                           | Represents a symbolic operation node.                                                                                                                                                                                                                 |
| `SymbolicExpression`          | type      | `Variable \| Constant \| Operation`                                                                                                                                                          | Represents an algebraic expression tree, discriminated by `form`.                                                                                                                                                                                     |
| `Equation`                    | interface | `{ id, name, description?, left, right, target }`                                                                                                                                            | Represents one equation `left = right`, solved for the `target` variable.                                                                                                                                                                             |
| `SymbolicDefinition`          | interface | `{ reasoning, id, name, description?, equations, variables, precision? }`                                                                                                                    | Defines equation-solving.                                                                                                                                                                                                                             |
| `Fact`                        | interface | `{ id, predicate, terms, confidence? }`                                                                                                                                                      | Represents one fact: a `predicate` over positional `terms`.                                                                                                                                                                                           |
| `Inference`                   | interface | `{ id, name, description?, premises, conclusion, confidence?, enabled? }`                                                                                                                    | Represents one inference rule: when every premise pattern unifies against known facts (with consistent variable bindings), the instantiated `conclusion` is derived.                                                                                  |
| `InferentialDefinition`       | interface | `{ reasoning, id, name, description?, inferences, facts, strategy, depth? }`                                                                                                                 | Defines fact-derivation.                                                                                                                                                                                                                              |
| `Definition`                  | type      | `QuantitativeDefinition \| LogicalDefinition \| SymbolicDefinition \| InferentialDefinition`                                                                                                 | Represents any reasoning definition, discriminated by `reasoning`.                                                                                                                                                                                    |
| `DefinitionEnvelope`          | type      | `Omit<QuantitativeDefinition, 'groups'> \| Omit<LogicalDefinition, 'rules'> \| Omit<SymbolicDefinition, 'equations' \| 'variables'> \| Omit<InferentialDefinition, 'facts' \| 'inferences'>` | Represents the scalar-only projection of each definition kind — the `DefinitionBuilderInterface` implementation's private envelope holds the non-collection fields; `build()` re-composes the kind's collections from the managers' plural accessors. |
| `QuantitativeClearKey`        | type      | `'description' \| 'base' \| 'bounds' \| 'precision'`                                                                                                                                         | Names the optional `QuantitativeDefinition` fields `clearQuantitativeDefinition` (and a quantitative `DefinitionBuilderInterface`'s `clear`) can delete.                                                                                              |
| `LogicalClearKey`             | type      | `'description' \| 'depth'`                                                                                                                                                                   | Names the optional `LogicalDefinition` fields `clearLogicalDefinition` (and a logical `DefinitionBuilderInterface`'s `clear`) can delete.                                                                                                             |
| `SymbolicClearKey`            | type      | `'description' \| 'precision'`                                                                                                                                                               | Names the optional `SymbolicDefinition` fields `clearSymbolicDefinition` (and a symbolic `DefinitionBuilderInterface`'s `clear`) can delete.                                                                                                          |
| `InferentialClearKey`         | type      | `'description' \| 'depth'`                                                                                                                                                                   | Names the optional `InferentialDefinition` fields `clearInferentialDefinition` (and an inferential `DefinitionBuilderInterface`'s `clear`) can delete.                                                                                                |
| `LogicalChainingResult`       | interface | `{ conclusion, rules }`                                                                                                                                                                      | Represents one chaining pass of the `LogicalReasoner` — the overall `conclusion` plus the per-rule results the pass produced.                                                                                                                         |
| `InferentialChainingResult`   | interface | `{ derived, proof? }`                                                                                                                                                                        | Represents one chaining pass of the `InferentialReasoner` — the facts the pass derived plus the proof tree, when the pass produced one.                                                                                                               |
| `FactorResult`                | interface | `{ id, applied, value, raw?, checks? }`                                                                                                                                                      | Represents one factor's evaluation outcome.                                                                                                                                                                                                           |
| `GroupResult`                 | interface | `{ id, applied, value, factors }`                                                                                                                                                            | Represents one group's evaluation outcome — its clamped value and the per-factor results (disabled factors omitted entirely).                                                                                                                         |
| `QuantitativeResult`          | interface | `{ reasoning, value, groups, count, success, trace, errors }`                                                                                                                                | Represents the outcome of quantitative reasoning.                                                                                                                                                                                                     |
| `RuleResult`                  | interface | `{ id, applied, premises }`                                                                                                                                                                  | Represents one rule's evaluation outcome.                                                                                                                                                                                                             |
| `LogicalResult`               | interface | `{ reasoning, conclusion, rules, count, success, trace, errors }`                                                                                                                            | Represents the outcome of logical reasoning.                                                                                                                                                                                                          |
| `SymbolicResult`              | interface | `{ reasoning, solutions, success, trace, errors }`                                                                                                                                           | Represents the outcome of symbolic reasoning — final bindings keyed by each equation's `target` (a failed equation's target still appears when bound elsewhere).                                                                                      |
| `ProofNode`                   | interface | `{ fact, inference?, children?, depth }`                                                                                                                                                     | Represents one node of a backward-chaining proof tree.                                                                                                                                                                                                |
| `InferentialResult`           | interface | `{ reasoning, derived, proof?, success, trace, errors }`                                                                                                                                     | Represents the outcome of inferential reasoning.                                                                                                                                                                                                      |
| `ReasonResult`                | type      | `QuantitativeResult \| LogicalResult \| SymbolicResult \| InferentialResult`                                                                                                                 | Represents any reasoning result, discriminated by `reasoning`.                                                                                                                                                                                        |
| `ReasonValidationResult`      | interface | `{ valid, errors, warnings }`                                                                                                                                                                | Represents the outcome of validating a definition — hard `errors` (definition unusable) and soft `warnings` (suspicious but runnable). `valid` is `true` exactly when `errors` is empty.                                                              |
| `EvaluatorOptions`            | interface | `{ id? }`                                                                                                                                                                                    | Configures `createEvaluator` / the `Evaluator` constructor.                                                                                                                                                                                           |
| `TransformerOptions`          | interface | `{ id? }`                                                                                                                                                                                    | Configures `createTransformer` / the `Transformer` constructor.                                                                                                                                                                                       |
| `AggregatorOptions`           | interface | `{ id? }`                                                                                                                                                                                    | Configures `createAggregator` / the `Aggregator` constructor.                                                                                                                                                                                         |
| `QuantitativeReasonerOptions` | interface | `{ id?, evaluator?, transformer?, aggregator? }`                                                                                                                                             | Configures `createQuantitativeReasoner` / the `QuantitativeReasoner` constructor.                                                                                                                                                                     |
| `LogicalReasonerOptions`      | interface | `{ id?, evaluator? }`                                                                                                                                                                        | Configures `createLogicalReasoner` / the `LogicalReasoner` constructor.                                                                                                                                                                               |
| `SymbolicReasonerOptions`     | interface | `{ id? }`                                                                                                                                                                                    | Configures `createSymbolicReasoner` / the `SymbolicReasoner` constructor.                                                                                                                                                                             |
| `InferentialReasonerOptions`  | interface | `{ id? }`                                                                                                                                                                                    | Configures `createInferentialReasoner` / the `InferentialReasoner` constructor.                                                                                                                                                                       |
| `EvaluatorInterface`          | interface | `{ id } plus evaluate, batch`                                                                                                                                                                | Evaluates `Check`s against subjects.                                                                                                                                                                                                                  |
| `TransformerInterface`        | interface | `{ id } plus apply, chain`                                                                                                                                                                   | Applies math `Transform`s to numbers.                                                                                                                                                                                                                 |
| `AggregatorInterface`         | interface | `{ id } plus aggregate`                                                                                                                                                                      | Reduces number lists to one number per `Aggregation`.                                                                                                                                                                                                 |
| `ReasonerInterface`           | interface | `{ id, reasoning } plus supports, validate, reason`                                                                                                                                          | Declares a reasoning strategy adapter — one per `Reasoning`.                                                                                                                                                                                          |
| `ReasonErrorCode`             | type      | `'MISSING' \| 'INVALID' \| 'MISMATCH' \| 'DESTROYED' \| 'TARGET' \| 'OPERATOR'`                                                                                                              | Names a machine-readable `ReasonError` code.                                                                                                                                                                                                          |
| `ReasonEventMap`              | type      | `{ register, reason, error, destroy }`                                                                                                                                                       | Represents the push observation surface of a `ReasonInterface`.                                                                                                                                                                                       |
| `ReasonOptions`               | interface | `{ reasoners?, bail?, validate?, on?, error? }`                                                                                                                                              | Configures `createReason` / the `Reason` constructor.                                                                                                                                                                                                 |
| `ReasonInterface`             | interface | `{ emitter } plus reason, register, reasoner, reasoners, supports, validate, destroy`                                                                                                        | Declares the reasoning orchestrator — a thin router over registered `ReasonerInterface`s.                                                                                                                                                             |
| `GroupManagerInterface`       | interface | `{ emitter } plus group, groups, append, prepend, replace, remove, seat, destroy`                                                                                                            | Declares the `DefinitionBuilderInterface` manager over a quantitative definition's `groups` — a self-owning, kind-free collection manager.                                                                                                            |
| `GroupManagerEventMap`        | type      | `{ append, prepend, replace, remove, destroy }`                                                                                                                                              | Represents the push observation surface of a `GroupManagerInterface`.                                                                                                                                                                                 |
| `GroupManagerOptions`         | interface | `{ groups?, on?, error? }`                                                                                                                                                                   | Configures `createGroupManager` / the `GroupManager` constructor.                                                                                                                                                                                     |
| `FactorManagerInterface`      | interface | `{ emitter } plus factor, factors, append, prepend, replace, remove, destroy`                                                                                                                | Declares the `DefinitionBuilderInterface` manager over a `FactorGroup`'s `factors`, threaded through the required `groupId` locator (a factor lives inside its group).                                                                                |
| `FactorManagerEventMap`       | type      | `{ append, prepend, replace, remove, destroy }`                                                                                                                                              | Represents the push observation surface of a `FactorManagerInterface`.                                                                                                                                                                                |
| `FactorManagerOptions`        | interface | `{ on?, error? }`                                                                                                                                                                            | Configures `createFactorManager` / the `FactorManager` constructor.                                                                                                                                                                                   |
| `RuleManagerInterface`        | interface | `{ emitter } plus rule, rules, append, prepend, replace, remove, seat, destroy`                                                                                                              | Declares the `DefinitionBuilderInterface` manager over a logical definition's `rules` — a self-owning, kind-free collection manager.                                                                                                                  |
| `RuleManagerEventMap`         | type      | `{ append, prepend, replace, remove, destroy }`                                                                                                                                              | Represents the push observation surface of a `RuleManagerInterface`.                                                                                                                                                                                  |
| `RuleManagerOptions`          | interface | `{ rules?, on?, error? }`                                                                                                                                                                    | Configures `createRuleManager` / the `RuleManager` constructor.                                                                                                                                                                                       |
| `EquationManagerInterface`    | interface | `{ emitter } plus equation, equations, append, prepend, replace, remove, seat, destroy`                                                                                                      | Declares the `DefinitionBuilderInterface` manager over a symbolic definition's `equations` — a self-owning, kind-free collection manager.                                                                                                             |
| `EquationManagerEventMap`     | type      | `{ append, prepend, replace, remove, destroy }`                                                                                                                                              | Represents the push observation surface of an `EquationManagerInterface`.                                                                                                                                                                             |
| `EquationManagerOptions`      | interface | `{ equations?, on?, error? }`                                                                                                                                                                | Configures `createEquationManager` / the `EquationManager` constructor.                                                                                                                                                                               |
| `FactManagerInterface`        | interface | `{ emitter } plus fact, facts, append, prepend, replace, remove, seat, destroy`                                                                                                              | Declares the `DefinitionBuilderInterface` manager over an inferential definition's `facts` — a self-owning, kind-free collection manager.                                                                                                             |
| `FactManagerEventMap`         | type      | `{ append, prepend, replace, remove, destroy }`                                                                                                                                              | Represents the push observation surface of a `FactManagerInterface`.                                                                                                                                                                                  |
| `FactManagerOptions`          | interface | `{ facts?, on?, error? }`                                                                                                                                                                    | Configures `createFactManager` / the `FactManager` constructor.                                                                                                                                                                                       |
| `InferenceManagerInterface`   | interface | `{ emitter } plus inference, inferences, append, prepend, replace, remove, seat, destroy`                                                                                                    | Declares the `DefinitionBuilderInterface` manager over an inferential definition's `inferences` — a self-owning, kind-free collection manager.                                                                                                        |
| `InferenceManagerEventMap`    | type      | `{ append, prepend, replace, remove, destroy }`                                                                                                                                              | Represents the push observation surface of an `InferenceManagerInterface`.                                                                                                                                                                            |
| `InferenceManagerOptions`     | interface | `{ inferences?, on?, error? }`                                                                                                                                                               | Configures `createInferenceManager` / the `InferenceManager` constructor.                                                                                                                                                                             |
| `VariableManagerInterface`    | interface | `{ emitter } plus variable, variables, add, remove, seat, destroy`                                                                                                                           | Declares the `DefinitionBuilderInterface` manager over a symbolic definition's `variables` — a name-keyed unordered record, so `add` / `remove` are the only write verbs (no placement). A self-owning, kind-free manager.                            |
| `VariableManagerEventMap`     | type      | `{ add, remove, destroy }`                                                                                                                                                                   | Represents the push observation surface of a `VariableManagerInterface`.                                                                                                                                                                              |
| `VariableManagerOptions`      | interface | `{ variables?, on?, error? }`                                                                                                                                                                | Configures `createVariableManager` / the `VariableManager` constructor.                                                                                                                                                                               |
| `DefinitionBuilderEventMap`   | type      | `{ merge, clear, destroy }`                                                                                                                                                                  | Represents the push observation surface of a `DefinitionBuilderInterface` — the builder-level lifecycle events; per-element mutation events live on the individual managers' own emitters.                                                            |
| `DefinitionBuilderInterface`  | interface | `{ [DEFINITION_BUILDER_BRAND], id, reasoning, emitter, groups, factors, rules, equations, variables, facts, inferences } plus build, merge, clear, destroy`                                  | Declares a stateful workspace builder accumulating a `Definition` through always-present self-owning manager properties: a private scalar envelope plus one manager per collection.                                                                   |
| `DefinitionBuilderOptions`    | interface | `{ id?, groups?, factors?, rules?, equations?, variables?, facts?, inferences?, on?, error? }`                                                                                               | Configures `createDefinitionBuilder` / the `DefinitionBuilder` constructor.                                                                                                                                                                           |
| `SubjectBuilderEventMap`      | type      | `{ set, remove, merge, clear, destroy }`                                                                                                                                                     | Represents the push observation surface of a `SubjectBuilderInterface` — the verb-named `set`, `remove`, `merge`, `clear`, and `destroy` events, no generic `change` / `status`.                                                                      |
| `SubjectBuilderInterface`     | interface | `{ [SUBJECT_BUILDER_BRAND], id, emitter } plus field, fields, set, remove, merge, clear, repeat, build, destroy`                                                                             | Declares a stateful workspace builder accumulating a `Subject` — one flat key-value collection, no managers.                                                                                                                                          |
| `SubjectBuilderOptions`       | interface | `{ id?, on?, error? }`                                                                                                                                                                       | Configures `createSubjectBuilder` / the `SubjectBuilder` constructor.                                                                                                                                                                                 |

## Methods

The public methods of each behavioral interface — one table per type, keyed by its backticked name, every call-signature member listed (the `readonly` data members — `emitter` on the orchestrator, the builders, and every manager; `id` / `reasoning` on reasoners and operators — stay off the method tables). Each implementing class (`Reason`; the reasoners; `Evaluator` / `Transformer` / `Aggregator`; the `DefinitionBuilder` / `SubjectBuilder` builders and the manager classes) exposes exactly its interface's methods, so this doubles as the per-instance method surface.

#### `ReasonInterface`

The array overload of `reason` is declared first so a subject list resolves to the batch form. After `destroy()`, every method except `destroy` itself throws `DESTROYED` (the `emitter` getter keeps working). `reason` and `validate` take plain data only — a `DefinitionBuilderInterface` / `SubjectBuilderInterface`'s `build()` output is passed instead, by the caller.

| Method      | Returns                          | Summary                                                                                                             |
| ----------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `reason`    | `ReasonResult` (or array)        | Dispatches one subject — or maps a subject array in order — to the registered reasoner.                             |
| `register`  | `void`                           | Registers a reasoner, replacing one already registered for the same reasoning, and emits the `register` event.      |
| `reasoner`  | `ReasonerInterface \| undefined` | Returns the one reasoner registered for a reasoning, or `undefined` when none is.                                   |
| `reasoners` | `readonly ReasonerInterface[]`   | Lists every registered reasoner as a fresh array.                                                                   |
| `supports`  | `boolean`                        | Reports whether a reasoner is registered for a reasoning.                                                           |
| `validate`  | `ReasonValidationResult`         | Delegates validation to the registered reasoner — a missing reasoner is an invalid result here rather than a throw. |
| `destroy`   | `void`                           | Clears the registry, emits the `destroy` event, and destroys the emitter last; the call is idempotent.              |

#### `ReasonerInterface`

`supports` / `validate` / `reason` take plain data only — a `DefinitionBuilderInterface` / `SubjectBuilderInterface`'s `build()` output is passed instead, by the caller.

| Method     | Returns                  | Summary                                                                                                                                      |
| ---------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `supports` | `boolean`                | Reports whether the definition's `reasoning` equals this adapter's own.                                                                      |
| `validate` | `ReasonValidationResult` | Reports a definition's structural errors and soft warnings, evaluating nothing.                                                              |
| `reason`   | `ReasonResult`           | Evaluates one subject against a definition, throwing only `MISMATCH` for a wrong reasoning — a malformed definition yields a failure result. |

#### `EvaluatorInterface`

| Method     | Returns                  | Summary                                                                                                    |
| ---------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `evaluate` | `CheckResult`            | Resolves `check.field` from the subject and compares it; an unknown operator becomes an in-result `error`. |
| `batch`    | `readonly CheckResult[]` | Evaluates many checks positionally against one subject.                                                    |

#### `TransformerInterface`

| Method  | Returns  | Summary                                                                                                              |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `apply` | `number` | Applies one math step — an absent operand defaults to `1` for `multiply` / `divide` / `power`, and to `0` otherwise. |
| `chain` | `number` | Left-folds a transform list over the value; `NaN` flows through and no step is skipped.                              |

#### `AggregatorInterface`

| Method      | Returns  | Summary                                                                                                                         |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `aggregate` | `number` | Reduces the values per aggregation; `weights` are honored only on an exact length match, and `minimum` / `maximum` ignore them. |

#### `GroupManagerInterface`

The self-owning manager over a quantitative definition's `groups`. Managers are kind-free — an off-kind collection is ignored by `build()`, never a throw. A call after `destroy()` throws `DESTROYED`.

| Method    | Returns                    | Summary                                                                                                                                            |
| --------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `group`   | `FactorGroup \| undefined` | Returns the one group carrying an id, or `undefined` when none does.                                                                               |
| `groups`  | `readonly FactorGroup[]`   | Lists every group in order.                                                                                                                        |
| `append`  | `void`                     | Inserts a group at the end, or after `target`, removing a same-id group first; a `target` naming no group throws `TARGET`.                         |
| `prepend` | `void`                     | Inserts a group at the start, or before `target`, removing a same-id group first; a `target` naming no group throws `TARGET`.                      |
| `replace` | `void`                     | Swaps a same-id group in place, appending it when the collection carries none.                                                                     |
| `remove`  | `boolean \| void`          | Removes groups: every group with no argument, one group by id, or the groups an id list names; the id forms report whether every named id existed. |
| `seat`    | `void`                     | Replaces the whole collection in one silent call — the owning builder's bulk re-seat channel.                                                      |
| `destroy` | `void`                     | Tears the manager down idempotently — emits the `destroy` event, then destroys the emitter last.                                                   |

#### `FactorManagerInterface`

The divergent manager over a `FactorGroup`'s `factors`, threaded through the required `groupId` locator — it holds no state of its own, reading and writing through the sibling `GroupManager`. `groupId` naming no existing group throws `TARGET` (with `groupId` in the context); a call after `destroy()` throws `DESTROYED`.

| Method    | Returns               | Summary                                                                                                                                                                                          |
| --------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `factor`  | `Factor \| undefined` | Returns the one factor of a named group carrying an id, or `undefined` when none does.                                                                                                           |
| `factors` | `readonly Factor[]`   | Lists every factor of one named group in order.                                                                                                                                                  |
| `append`  | `void`                | Inserts a factor into the named group at the end, or after `target`, removing a same-id factor first.                                                                                            |
| `prepend` | `void`                | Inserts a factor into the named group at the start, or before `target`, removing a same-id factor first.                                                                                         |
| `replace` | `void`                | Swaps a same-id factor in place within the named group, appending it when the group carries none.                                                                                                |
| `remove`  | `boolean \| void`     | Removes factors of the named group: every factor with the locator alone, one factor by a further id, or the factors a further id list names; the id forms report whether every named id existed. |
| `destroy` | `void`                | Tears the manager down idempotently — emits the `destroy` event, then destroys the emitter last.                                                                                                 |

#### `RuleManagerInterface`

The self-owning manager over a logical definition's `rules`. Rule order is load-bearing — the forward conclusion is the last declared non-disabled rule. Managers are kind-free — an off-kind collection is ignored by `build()`, never a throw. A call after `destroy()` throws `DESTROYED`.

| Method    | Returns             | Summary                                                                                                                                        |
| --------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `rule`    | `Rule \| undefined` | Returns the one rule carrying an id, or `undefined` when none does.                                                                            |
| `rules`   | `readonly Rule[]`   | Lists every rule in order.                                                                                                                     |
| `append`  | `void`              | Inserts a rule at the end, or after `target`, removing a same-id rule first — an absent `target` makes it the new forward conclusion.          |
| `prepend` | `void`              | Inserts a rule at the start, or before `target`, removing a same-id rule first.                                                                |
| `replace` | `void`              | Swaps a same-id rule in place, appending it when the collection carries none.                                                                  |
| `remove`  | `boolean \| void`   | Removes rules: every rule with no argument, one rule by id, or the rules an id list names; the id forms report whether every named id existed. |
| `seat`    | `void`              | Replaces the whole collection in one silent call — the owning builder's bulk re-seat channel.                                                  |
| `destroy` | `void`              | Tears the manager down idempotently — emits the `destroy` event, then destroys the emitter last.                                               |

#### `EquationManagerInterface`

The self-owning manager over a symbolic definition's `equations`. Equation order is strongly load-bearing — equations solve strictly in order and each rounded solution feeds forward. Managers are kind-free — an off-kind collection is ignored by `build()`, never a throw. A call after `destroy()` throws `DESTROYED`.

| Method      | Returns                 | Summary                                                                                                                                                        |
| ----------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `equation`  | `Equation \| undefined` | Returns the one equation carrying an id, or `undefined` when none does.                                                                                        |
| `equations` | `readonly Equation[]`   | Lists every equation in solve order.                                                                                                                           |
| `append`    | `void`                  | Inserts an equation at the end, or after `target`, removing a same-id equation first.                                                                          |
| `prepend`   | `void`                  | Inserts an equation at the start, or before `target`, removing a same-id equation first.                                                                       |
| `replace`   | `void`                  | Swaps a same-id equation in place, appending it when the collection carries none.                                                                              |
| `remove`    | `boolean \| void`       | Removes equations: every equation with no argument, one equation by id, or the equations an id list names; the id forms report whether every named id existed. |
| `seat`      | `void`                  | Replaces the whole collection in one silent call — the owning builder's bulk re-seat channel.                                                                  |
| `destroy`   | `void`                  | Tears the manager down idempotently — emits the `destroy` event, then destroys the emitter last.                                                               |

#### `FactManagerInterface`

The self-owning manager over an inferential definition's `facts`. Managers are kind-free — an off-kind collection is ignored by `build()`, never a throw. A call after `destroy()` throws `DESTROYED`.

| Method    | Returns             | Summary                                                                                                                                        |
| --------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `fact`    | `Fact \| undefined` | Returns the one fact carrying an id, or `undefined` when none does.                                                                            |
| `facts`   | `readonly Fact[]`   | Lists every fact in order.                                                                                                                     |
| `append`  | `void`              | Inserts a fact at the end, or after `target`, removing a same-id fact first.                                                                   |
| `prepend` | `void`              | Inserts a fact at the start, or before `target`, removing a same-id fact first.                                                                |
| `replace` | `void`              | Swaps a same-id fact in place, appending it when the collection carries none.                                                                  |
| `remove`  | `boolean \| void`   | Removes facts: every fact with no argument, one fact by id, or the facts an id list names; the id forms report whether every named id existed. |
| `seat`    | `void`              | Replaces the whole collection in one silent call — the owning builder's bulk re-seat channel.                                                  |
| `destroy` | `void`              | Tears the manager down idempotently — emits the `destroy` event, then destroys the emitter last.                                               |

#### `InferenceManagerInterface`

The self-owning manager over an inferential definition's `inferences`. Inference order is load-bearing — backward proving iterates in declaration order and returns on first success. Managers are kind-free — an off-kind collection is ignored by `build()`, never a throw. A call after `destroy()` throws `DESTROYED`.

| Method       | Returns                  | Summary                                                                                                                                                            |
| ------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inference`  | `Inference \| undefined` | Returns the one inference carrying an id, or `undefined` when none does.                                                                                           |
| `inferences` | `readonly Inference[]`   | Lists every inference in order.                                                                                                                                    |
| `append`     | `void`                   | Inserts an inference at the end, or after `target`, removing a same-id inference first.                                                                            |
| `prepend`    | `void`                   | Inserts an inference at the start, or before `target`, removing a same-id inference first.                                                                         |
| `replace`    | `void`                   | Swaps a same-id inference in place, appending it when the collection carries none.                                                                                 |
| `remove`     | `boolean \| void`        | Removes inferences: every inference with no argument, one inference by id, or the inferences an id list names; the id forms report whether every named id existed. |
| `seat`       | `void`                   | Replaces the whole collection in one silent call — the owning builder's bulk re-seat channel.                                                                      |
| `destroy`    | `void`                   | Tears the manager down idempotently — emits the `destroy` event, then destroys the emitter last.                                                                   |

#### `VariableManagerInterface`

The self-owning manager over a symbolic definition's `variables` — a name-keyed unordered record, so `add` / `remove` are the only write verbs (no `append` / `prepend`). Managers are kind-free — an off-kind collection is ignored by `build()`, never a throw. A call after `destroy()` throws `DESTROYED`.

| Method      | Returns                            | Summary                                                                                                                                                                   |
| ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `variable`  | `number \| undefined`              | Returns the one variable's value carrying a name, or `undefined` when none does.                                                                                          |
| `variables` | `Readonly<Record<string, number>>` | Returns the whole name-keyed record.                                                                                                                                      |
| `add`       | `void`                             | Upserts one entry and emits the `add` event with the variable name.                                                                                                       |
| `remove`    | `boolean \| void`                  | Removes variables: every variable with no argument, one variable by name, or the variables a name list names; the name forms report whether every named variable existed. |
| `seat`      | `void`                             | Replaces the whole record in one silent call — the owning builder's bulk re-seat channel.                                                                                 |
| `destroy`   | `void`                             | Tears the manager down idempotently — emits the `destroy` event, then destroys the emitter last.                                                                          |

#### `DefinitionBuilderInterface`

The `DEFINITION_BUILDER_BRAND`-carrying stateful builder accumulating a `Definition` through its self-owning manager properties (`groups` / `factors` / `rules` / `equations` / `variables` / `facts` / `inferences`, each listed earlier) plus a private scalar envelope. After `destroy()`, every method except `destroy` itself and the `emitter` / manager-property getters throws `DESTROYED`.

| Method    | Returns      | Summary                                                                                                                                           |
| --------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build`   | `Definition` | Returns a fresh plain `Definition` snapshot — the envelope plus the kind's managers — total and deterministic on every call.                      |
| `merge`   | `void`       | Reconciles with an incoming plain `Definition` of the same `reasoning`, distributing scalars into the envelope and collections into the managers. |
| `clear`   | `void`       | Deletes one optional envelope field for the instance's `reasoning`; a key the reasoning cannot clear throws `MISMATCH`.                           |
| `destroy` | `void`       | Tears the builder down idempotently — cascades `destroy` to every manager, then destroys the builder emitter last.                                |

#### `SubjectBuilderInterface`

The `SUBJECT_BUILDER_BRAND`-carrying stateful builder accumulating a `Subject`. The array overload of `remove` is declared first so a key list resolves to the batch form. After `destroy()`, every method except `destroy` itself and the `emitter` getter throws `DESTROYED`.

| Method    | Returns              | Summary                                                                                                                                                        |
| --------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field`   | `unknown`            | Reads one top-level field by key.                                                                                                                              |
| `fields`  | `Subject`            | Reads the whole current record live.                                                                                                                           |
| `set`     | `void`               | Upserts one field; setting `id` throws, because the id is immutable for an id-ful and an anonymous builder alike.                                              |
| `remove`  | `boolean \| void`    | Removes non-id fields: every field with no argument, one field by key, or the fields a key list names; the keyed forms report whether every named key existed. |
| `merge`   | `void`               | Reconciles with an incoming plain `Subject`; the incoming record wins and the base `id` is kept.                                                               |
| `clear`   | `void`               | Removes every non-id field.                                                                                                                                    |
| `repeat`  | `readonly Subject[]` | Produces `count` deterministic minted-id clones as plain payloads — a pure read that emits nothing.                                                            |
| `build`   | `Subject`            | Returns a fresh durable payload snapshot of the current state — total and deterministic on every call.                                                         |
| `destroy` | `void`               | Tears the builder down idempotently — destroys the emitter last.                                                                                               |

## Contract

These invariants hold across `src/core` ↔ `reason.md`:

1. **DOC ↔ SOURCE bijection.** Every `function` / `class` / `const` / `interface` / `type` row in the `## Surface` tables is a real export of the reason source tree, and every export appears as a Surface row — exhaustive in each direction.
2. **Deterministic, synchronous, immutable.** Same subject + same definition → the same result, every time — no clocks, no randomness, no I/O, nothing async. No input is ever mutated; every result (and every builder output) is a fresh object. A result always carries `success`, a `trace` narrating each step, and the accumulated `errors` — an error does not abort the run (the value / conclusion / solutions are still computed from whatever applied), it makes `success` false. Expression evaluation and symbolic isolation recurse with the input expression's own depth, so a pathologically deep hand-built expression (on the order of `10,000` levels of nesting) is outside the supported contract and may exhaust the call stack; `extractAtoms` and `containsVariable` are the exception — both walk iteratively and stay total at any depth. The workspace builders (and their managers) are the deliberate stateful exception to statelessness, not to immutability: they mutate nothing they are given (the seed is spread on construction, every mutation is copy-on-write through the pure helper family), and `build()` returns a fresh payload deterministically derived from the current state, every call — handed to `reason` by the caller, never built inside the engine.
3. **Dispatch and `bail`.** The orchestrator is a thin router: registry lookup by `definition.reasoning`, one reasoner per reasoning, re-registration replaces. A registry miss throws `MISSING` and a pre-run validation failure (only when the `validate` option is on) throws `INVALID` — both are caller misuse, bypass `bail`, and emit nothing. A reasoner throw always emits `error` with the raw thrown value; under `bail: true` (the default) it is rethrown, under `bail: false` it becomes an empty type-shaped failure result. Only successful results emit `reason`. The batch overload maps subjects in order (per-subject validation when on).
4. **Failure results, not throws, inside a reasoner.** A reasoner's single throw is `MISMATCH` (handed a definition of a different reasoning); every structural malformation — missing / non-array `groups` / `rules` / `equations` / `facts` — yields a failure result, because the runtime never assumes `validate` ran. The operators are total the same way: an unknown `Comparison` surfaces as `CheckResult.error` (`met: false`), an unknown `MathOperation` returns the value unchanged, divide-by-zero is `NaN`, and the `Aggregator` has fixed empty-input identities (`sum` / `average` → `0`, `product` → `1`, `minimum` / `maximum` → `NaN`). Definition arrays (`facts` / `inferences` / `rules` / `equations` / `groups` / `factors`) are iterated defensively — an array hole, `null`, or other ill-typed junk entry is skipped rather than crashing evaluation.
5. **Guard totality and exactness.** Every validator is a total `Guard` — adversarial input (cycles, depth, hostile prototypes) returns `false`, never throws. Caller-supplied input records are exact and their numeric fields require `isFiniteNumber` because definitions must survive JSON. result guards accept open objects, including class instances, and guard published numeric members with `isNumber`, including `NaN` and infinities. Nested result members follow the same posture; `isInferentialResult` checks `derived` with the open `isResultFact` guard. The recursive input shapes enter through `lazyOf`; `isProofNode` uses a bounded iterative traversal. Builders omit absent optional input keys so their outputs round-trip the input guards. Numeric subject reads coerce through the contracts `parseNumber` — an unresolvable field (including `NaN` / `±Infinity` subject values) takes the `fallback` path, never the non-finite error path (still reachable through static sources and transform / inversion results).
6. **Observation is a pure side-channel.** The `Reason` owns a typed `emitter` (`ReasonEventMap` — `register(reasoning)` / `reason(result)` / `error(error)` / `destroy()`); each manager owns its own (`{X}ManagerEventMap` — its mutation verbs, element-id payloads, plus `destroy`), and the builders keep reduced maps of the operations that are theirs alone (`DefinitionBuilderEventMap` — `merge` / `clear` / `destroy`; `SubjectBuilderEventMap` — `set` / `remove` / `merge` / `clear` / `destroy`); reasoners and operators are event-free by design (stateless evaluators have no observable lifecycle). Every event is emitted directly and synchronously, after the mutation it reports; listener isolation is the emitter's own — a throwing listener routes to the `error` option handler (`(error, event)`), never onto the domain map. `destroy()` clears the registry, emits `destroy`, then destroys the emitter last; it is idempotent, and afterwards every method except the `emitter` getter and `destroy` itself throws `DESTROYED`. The managers follow the identical lifecycle, and `DefinitionBuilder.destroy()` cascades to every manager first, its own emitter last.
7. **Coded errors.** Every throw out of this module is a `ReasonError` with a machine-readable `code` (`MISSING` / `INVALID` / `MISMATCH` / `DESTROYED` / `TARGET` / `OPERATOR`) and — except `DESTROYED` — a `context` carrying the definition id and the reasoning involved, or the offending `id` / `target` / `groupId` for `TARGET`, the `key` for a non-clearable `clear`, and the `operator` for `OPERATOR`; `catch` blocks narrow with `isReasonError`, never `as`. `MISMATCH` covers a cross-reasoning definition handed to a reasoner or to `DefinitionBuilder.merge`, a `clear` key that is not clearable for the builder's reasoning, and a write to a `SubjectBuilder`'s immutable `id`; `DESTROYED` covers any use of a destroyed orchestrator, builder, or manager; `OPERATOR` covers a math operator outside the accepted vocabulary — `invertLeft` / `invertRight` on a non-invertible operation, and `applyOperation` on an unknown one.
8. **DOC ↔ SOURCE method bijection.** Every behavioral interface's `## Methods` table lists exactly its public methods (call-signature members) — exhaustive in each direction — and each implementing class exposes the same public methods, no more. A renamed / added / removed method breaks the gate until the table is reconciled.

These runtime rules hold alongside the numbered invariants. Derivation bookkeeping compares with SameValueZero (`equalValues`), so a NaN-valued conclusion or fact term derives once and the fixpoint converges. The definition-level quantitative value is finite-checked after rounding (`Definition "<id>" produced non-finite value: <v>`). `roundTo` passes the value through unchanged at extreme precisions whose scale factor overflows. Inverting a left-operand divide by zero (`x / 0 = c`) yields the non-finite equation error. A lookup reads only own table keys, and a missing / `null` field takes the `fallback` before any `''` key. The malformed-shape paths stay graceful — a missing / non-array `premises` on a backward logical rule errors and excludes it, on a backward inferential candidate skips it silently, and a missing factor `source` resolves to the fallback path. `validate` adds uniqueness / confidence / overlay-mismatch / unbound-variable warnings (`Duplicate <noun> id "<id>"`, `confidence outside [0, 1]`, the array-path overlay-key mismatch, the unbound `?variable` conclusion) while runtime behavior around duplicates — and around every other warned shape — is unchanged. Still out of scope: asynchronous reasoners, definition persistence, and contract-DSL shapes for the definition family (the plain guards in § Validators suffice) — all additive, leaving the preceding surface unchanged.

## Patterns

### Quantitative scoring

Each factor runs a pipeline — `checks` gate (all must be met) → `source` resolve (`fallback` when unresolvable) → finite check → `transforms` chain → `bounds` clamp — in ascending `priority` order (stable). A group's value is its `base` plus the weighted aggregation of the factors that applied, clamped but never rounded; `strict: true` makes the group all-or-nothing. The definition's value aggregates the applied groups (no weights at this level), clamps, rounds to `precision`, then is finite-checked: the `Aggregator`'s empty-input `NaN` for `minimum` / `maximum` is its deliberate "no data" signal, so aggregating zero applied groups under those surfaces as a `Definition "<id>" produced non-finite value: NaN` error (`success: false`, the `NaN` left visible in `value`) rather than a silent success. An unapplied group's `GroupResult.value` may still be `NaN` the same way — it is excluded from the definition aggregate, so only its own record shows it.

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
				required: true, // a gate/resolve failure becomes a result error
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

An `enabled: false` factor or group is skipped and omitted from results; a `required` factor that fails its gate or cannot resolve adds an error (`success: false`) while the rest of the run continues.

The `Evaluator`, `Transformer`, and `Aggregator` operators are usable directly, independent of any reasoner — the `QuantitativeReasoner` composes them internally, but each is a total, injectable seam:

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

`reason` runs on ordinary JS `number` — binary floating point, not decimal. A definition's `value` rounds to `precision` (`DEFAULT_PRECISION = 4`) only once, at the end of the pipeline (`transforms` → `bounds` → terminal round, preceding), so intermediate float error from earlier steps has already accumulated before that single round ever sees it. TC39 `Decimal` is still Stage 1, so until it lands the compliant answer for a money-like domain is a scaled-integer recipe, not a new dependency.

**Scaled integers.** Represent a money amount as integer minor units (cents), a rate as integer basis points (`1e-4` units), a ppm quantity as integer `1e-6` units — do the arithmetic on the scaled integers and divide back only for display. Binary floating point cannot represent most decimal fractions exactly:

```ts
0.1 + 0.2 // 0.30000000000000004 — not 0.3
```

Summing one hundred `$0.1` line items as floats drifts the same way (`9.99999999999998`, not `10`), while summing the equivalent `10`-cent integers is exact: `1000` cents accumulated, divided back once → `$10.00`.

**When `roundTo(4)` is sufficient.** A single terminal rounding of a shallow computation recovers the intended decimal — the preceding float noise is well inside the half-ulp window at 4 places:

```ts
roundTo(0.1 + 0.2, 4) // 0.3
```

**When `roundTo(4)` is not sufficient.**

(a) A domain finer than 4 decimals loses precision to `precision: 4` itself, not to float error — a ppm quantity (`1e-6` units) truncates to `0`:

```ts
roundTo(1 / 1_000_000, 4) // 0 — the ppm value is gone
roundTo(1 / 1_000_000, 6) // 0.000001 — recovered only at a finer precision
```

(b) Error that compounds across several `percentage` / `divide` steps before the terminal round can cross a half-ulp boundary at the 4th place even though rounding still happens only once. Chained 5% / 5% / 15% increases on `100` followed by a `divide` by `6` land exactly on a rounding boundary, `21.13125`, which rounds half-up to `21.1313` — but the float chain's accumulated binary error lands slightly under it, so `roundTo` rounds the wrong way:

```ts
;(100 * 1.05 * 1.05 * 1.15) / 6 // 21.131249999999998 — not the exact 21.13125
roundTo((100 * 1.05 * 1.05 * 1.15) / 6, 4) // 21.1312 — rounds down, wrong
roundTo(21.13125, 4) // 21.1313 — the exact value would round UP
```

The scaled-integer fix carries the same chain as an exact rational (numerator over denominator) instead of folding a float at every step, and divides + rounds only once at the very end:

```ts
const numerator = 100n * 105n * 105n * 115n // the +5% / +5% / +15% multipliers
const denominator = 100n * 100n * 100n * 6n // their scale, plus the final /6
const scaled = (numerator * 20000n) / denominator // ×2 so the half bit survives truncation
const rounded = scaled % 2n >= 1n ? scaled / 2n + 1n : scaled / 2n // one terminal round-half-up
Number(rounded) / 10000 // 21.1313 — matches the exact value
```

**Cross-reference.** The quantitative pipeline's `transforms` are opaque math steps and its terminal round is a single `roundTo(precision)` call — inject the scale factor before the first `transform` (convert the field/static source into scaled-integer minor units) and divide back out after reading `result.value`, rather than trying to make the pipeline itself decimal-exact.

### Logical chaining — forward and backward

Forward chaining runs the rules (ascending `priority`) to a fixpoint: each firing rule asserts its conclusion's atoms as derived facts overlaid on the subject (keyed by `formatField`), until an iteration derives nothing or `depth` is hit; the reported `rules` are then re-evaluated in original order against the final overlay, and `conclusion` is the last rule's conclusion. Backward chaining proves every enabled, conclusion-bearing rule goal-first in priority order (each proof sharing the growing derived overlay) — recursing into rules whose conclusions can establish a premise, with a visited-rule cycle guard, the `depth` cap, and negation-as-failure for `not`; the overall `conclusion` is the last priority-sorted rule's result.

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

Connectives evaluate eagerly (every operand evaluates — no short-circuit): `not` reads only its first operand, `implies` is vacuously true below two operands, `xor` is false. Conclusion extraction ignores connectives — every atom inside a firing rule's conclusion is asserted.

Quirks to design around. **Derived-overlay keys are `formatField` strings**: a conclusion written with an array path derives the dot-joined flat key, so a chained premise must read it with the dotted-string form — an array-path premise descends into nesting the overlay never creates. **A `premises: []` rule diverges by strategy**: forward reports `Rule "<id>" has no premises — skipped` (an error, the rule excluded); backward applies it vacuously (no premise can fail), which is the intended rule rather than a defect. **The fixpoint snapshots per iteration**: a derivation made mid-pass is invisible until the next pass (unlike the inferential reasoner's live fact list), so a `depth` cap truncates chains one hop per iteration regardless of declaration order.

### Symbolic solving

Bindings start from the definition's `variables`, then numeric subject fields override same-named variables (every own key except `id`, coerced with `parseNumber`). Equations solve strictly in order: when the `target` is unbound and sits on exactly one side, it is isolated algebraically through the `INVERTIBLE_OPERATIONS`; each solution is rounded to `precision` before feeding forward into later equations. A failing equation (unbound variable, non-invertible isolation, non-finite value) records an error and a `FAILED` trace — the run continues.

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

Scalar subject fields are injected as `has(key, value)` base facts. Forward chaining unifies each enabled inference's premise patterns against the known facts (a `'?'`-prefixed string term is a variable; bindings must be consistent within a match, relational-join style) and derives every instantiated conclusion to a fixpoint — deduplicated, each with confidence = the product of its premise facts' confidences × the inference's own, rounded to `CONFIDENCE_PRECISION`. Backward proving returns the first provable conclusion with its `ProofNode` tree.

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

Backward proving is a predicate-level reachability heuristic, not full resolution: each premise is proved independently under the goal's bindings (no cross-premise binding consistency), and a proven goal's `derived` fact may keep uninstantiated `?variables` in its `terms`. A goal that is already a base fact still reports a `derived` duplicate stamped with the inference's confidence, over a bare fact-leaf proof node (no `inference` / `children` keys). Forward chaining is the sound engine — reach for backward when a cheap proof tree is the point. Forward's `knownFacts` also grows live within an iteration (a fact derived early in a pass can feed a later inference in the same pass), so a `depth`-capped run derives more when inferences are declared in dependency order — the opposite temperament to the logical reasoner's per-iteration snapshot.

### Shaping definitions as data

A definition is plain data, so deriving a changed one is a pure function call — the capability-layer helpers cover every collection with `append` / `prepend` / `replace` / `remove`, whole definitions with `merge*`, optional fields with `clear*`, and the JSON boundary with `parseDefinition`. Every call returns a fresh definition; the input is never touched. Insertions dedup-then-insert (re-adding an id moves it — `replace*` is the position-preserving update), and an optional `target` id places the new element relative to an existing one; a `target` naming nothing throws `TARGET`.

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

The subject engine mirrors this on the other end of `reason(subject, definition)` — `assignField` / `removeField` upsert and delete top-level fields copy-on-write (deleting omits the key, never writes `undefined`), `mergeSubjects` reconciles incoming-wins with the base `id` preserved, and `repeatSubject` mints `count` deterministic clones (`` `${baseId}-0` ``, `` `${baseId}-1` ``, … — no randomness) for batch runs.

### The definition workspace — `DefinitionBuilder`

For incremental authoring — a builder UI, an MCP session, anything that accumulates a definition across many steps — wrap the data in the stateful builder. Each manager is self-owning: it owns one collection with single-word verbs, mutations delegate to the preceding pure helpers, copy-on-write into the manager's own private state, and emit through the manager's own emitter. Managers are also bring-your-own: the builder constructs seed-filled defaults, but any slot accepts a pre-built manager (`createDefinitionBuilder(seed, { rules: createRuleManager({ rules }) })`) — the bring-your-own-manager construction pattern. The engine never builds for you: call `build()` and hand the fresh plain `Definition` to `reason` / `validate` at the call site.

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
const result = reason.reason({ age: 25, licensed: true }, draft.build()) // build outside, pass the payload
if (result.reasoning === 'quantitative') result.value // 41 — 1 + (10 + 25) + 5

draft.groups.seat([createFactorGroup('only', 'sum', [])]) // swap a whole collection in one silent step — an authoring surface's "load this revision"
const payload = draft.build() // a fresh plain Definition every call — store it, ship it, reason over it
draft.destroy() // idempotent; cascades to the managers; afterwards mutation throws DESTROYED
```

Managers are kind-free: an off-kind mutation (`draft.rules.append(...)` on a quantitative draft) is inert, never a throw — the rules accumulate in the `RuleManager` but `build()` composes only the collections belonging to the draft's `reasoning`, so they never surface in the payload. Design around this deliberately: nothing warns about off-kind state. `merge` requires the same `reasoning` (else `MISMATCH`) and re-seats collections through each manager's `seat` silently (no per-element events) — the same channel an authoring surface calls to swap a whole collection in one step; re-seeding is `createDefinitionBuilder(parseDefinition(text) ?? fallback)` — `build()` output and `parseDefinition` are exact inverses across the JSON boundary. Rule and equation order stay load-bearing exactly as in the plain data: `rules.append` without a `target` makes the new rule the forward conclusion; `equations.append` places it last in the solve order. One nesting echo: factors live inside groups, so a `factors` mutation writes the updated group back through the sibling `GroupManager` — the factor event fires on `factors.emitter` and a `replace` fires on `groups.emitter` for the containing group.

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

The subject side is one flat collection of fields, so verbs sit directly on the builder (no managers, no `append` / `prepend`). The `id` is optional and immutable through the builder — when absent the builder is anonymous (`.id` is `undefined`, `build()` emits no `id` key); `repeat` turns one accumulated subject into a deterministic batch.

```ts
import { createQuantitativeReasoner, createReason, createSubjectBuilder } from '@orkestrel/reason'

const reason = createReason({ reasoners: [createQuantitativeReasoner()] })

const applicant = createSubjectBuilder({ id: 'alice', age: 25 })
applicant.set('region', 'CA')
applicant.merge({ licensed: true, accidents: 0 }) // incoming wins, id kept
applicant.remove(['accidents']) // batch form first — returns whether every key existed
applicant.fields() // { id: 'alice', age: 25, region: 'CA', licensed: true } — the plural read

const result = reason.reason(applicant.build(), definition) // build outside, pass the payload
const cohort = applicant.repeat(3) // plain subjects: ids 'alice-0', 'alice-1', 'alice-2'
const results = reason.reason(cohort, definition) // the batch overload, as ever
```

`fields()` reads the whole current record and `field(key)` one top-level key — nested records are composed as values (read deep at evaluation time through `FieldPath` arrays), not navigated by the builder. Setting `id` or removing `id` throws `MISMATCH`: the id is the builder's identity and the `repeat` minting base.

### Observing

The `Reason` exposes a typed `emitter` for fire-and-forget observers — logging, metrics, an audit trail. Subscribe through `reason.emitter.on(...)`, or wire initial listeners through the reserved `on` option with the `error` option as the emitter's own listener-error handler.

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
| `DefinitionBuilder` | `DefinitionBuilderEventMap` | `merge(reasoning)` · `clear(key)` · `destroy()` (per-element mutations fire on the managers' own emitters)                      |
| the list managers   | `{X}ManagerEventMap`        | `append(id)` · `prepend(id)` · `replace(id)` · `remove(id)` · `destroy()` — Group / Factor / Rule / Equation / Fact / Inference |
| `VariableManager`   | `VariableManagerEventMap`   | `add(name)` · `remove(name)` · `destroy()` — the name-keyed record has no placement verbs                                       |
| `SubjectBuilder`    | `SubjectBuilderEventMap`    | `set(key, value)` · `remove(key)` · `merge(incoming)` · `clear()` · `destroy()`                                                 |

`register` fires per registration (constructor seeding does not fire it); `reason` fires once per result the reasoner returns, synchronously before it returns — this includes a `success: false` result the reasoner returns normally (a malformed definition, say), not only successes. A reasoner throw never fires `reason`: it fires `error` with the raw thrown value instead, then either rethrows (`bail: true`, the default) or is converted into a type-shaped failure result (`bail: false`) that is returned to the caller but does not fire `reason`; `destroy` fires once. `MISSING` / `INVALID` throws emit nothing — they are caller misuse, not reasoning outcomes. Reasoners and operators are event-free by design; observe the orchestrator — or the workspace builders, which take the same `on` / `error` options and emit one verb-named event per mutation through their own emitters (each `DefinitionBuilder` manager owns its own emitter — the builder's own emitter carries only `merge` / `clear` / `destroy`; `variables.add` reports as `add` and `variables.remove` as `remove`, each carrying the variable name; a pure read — `build`, `repeat`, the accessors — never emits).

```ts
const draft = createDefinitionBuilder(seed, {
	on: { merge: (reasoning) => audit.record('merge', reasoning) }, // builder-level listeners
})
draft.groups.emitter.on('append', (id) => audit.record('group.append', id)) // per-manager mutation events
draft.emitter.on('merge', (reasoning) => console.log(`merged a ${reasoning} revision`))
```

### Narrowing untrusted definitions

Definitions are JSON-serializable data, so they arrive from storage / the wire as `unknown`. Narrow first with the structural guard (`isDefinition` — exact records, total on adversarial input), then with the semantic pass (`validate` — ids present, sources declared, non-empty rule sets) whose `warnings` flag runnable-but-suspicious definitions.

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

`warnings` flag the runnable-but-suspicious: empty collections, duplicate rule / group / factor / equation / inference ids (`Duplicate <noun> id "<id>"`, once per duplicated id), inferential confidences outside `[0, 1]`, a logical conclusion's array-path overlay key also read through an array-path premise elsewhere (`Overlay key "<key>" is written through an array path AND also read through an array path — the flat overlay key will not resolve`, `findOverlayMismatches`), and an inferential conclusion `?variable` unbound by all of its inference's premises (`Inference "<id>" conclusion variable "<variable>" is unbound by all premises`, `findUnboundVariables`). The runtime stays permissive about all of them — duplicates in particular are first/last-wins artifacts (a group's weight lookup takes the first same-id factor; a degenerate forward rule id-poisons its valid same-id twin out of the run), which is exactly why `validate` warns.

Prefer this at boundaries over the orchestrator's `validate: true` option (which throws `INVALID` per call); use the option when a throw is the right failure mode — for example definitions authored in code, where invalidity is a programmer error.

### Practices

- **Register every reasoner before the first `reason` call** — dispatch is a registry lookup; a miss throws `MISSING` regardless of `bail`.
- **Build definitions with the value factories** — they default `name` to the id, omit absent optional keys (so outputs round-trip the exact-record validators), and keep call sites terse.
- **Gate untrusted definitions twice** — `isDefinition` for shape at the boundary, `validate` for semantics; reserve the `validate: true` option for programmer-error contexts.
- **Keep ids unique** — `validate` only warns on duplicates; the runtime resolves them first/last-wins, silently.
- **Check `success` before trusting the payload** — errors accumulate without aborting, so a `value` / `conclusion` computed alongside errors is a partial answer.
- **Read the `trace` when a result surprises you** — every skip, gate, derivation, and convergence is narrated step by step.
- **Use `FieldPath` arrays for nested access** — `['address', 'city']` descends; a dotted string like `'address.city'` is one literal key, never split.
- **Choose `bail` deliberately** — the default (`true`) rethrows a reasoner throw after the `error` emit; `bail: false` degrades it to an empty failure result for batch pipelines that must keep going.
- **Reach for the helpers to derive, the workspace builders to accumulate** — a one-shot change is a pure helper call on plain data; a definition or subject built up across many steps (a builder UI, an MCP session) lives in a `createDefinitionBuilder` / `createSubjectBuilder` workspace.
- **`build()` at the call site, always** — the engine takes only plain data; `reason.reason(subject.build(), draft.build())` makes the build step visible, and the payload is exactly what ran.
- **Gate authoring verbs by `reasoning`** — managers are kind-free, so an off-kind mutation accumulates silently and never surfaces in `build()`; offer only the current kind's verbs on an authoring surface.
- **Store `build()` output, not builders** — `JSON.stringify(draft.build())` out, `parseDefinition` back in, re-seed a fresh builder; the builder itself is a live workspace, not a payload.
- **Mind what each `is…` guard narrows at the boundary** — `isDefinition` narrows the plain data; `isDefinitionBuilder` / `isSubjectBuilder` are the builder brand guards. A plain record carrying a `build` function is still data — only the brand makes a builder. A `Subject` is any plain record, so narrow one with `isRecord` from `@orkestrel/contract` — this package publishes no guard for it.
- **Destroy when done** — `destroy()` releases the registry and the emitter (the builders cascade to their managers first); a destroyed instance throws `DESTROYED` on use (narrow with `isReasonError`).

## Tests

- [`tests/guides.test.ts`](../tests/guides.test.ts) — the `## Surface` ↔ `src/core` bijection (value + type exports), the `## Methods` ↔ interface-method bijection, and the equality gate: every `Summary` cell against its declaration's description paragraph, the titled `Create an orchestrator and score a subject` fence against the `@example` block of that title (pinned so the titled pair cannot be retired silently), and the README pitch against this guide's tagline. It also runs the flagship fences and asserts the values their comments claim.
- [`tests/src/core/Reason.test.ts`](../tests/src/core/Reason.test.ts) — the orchestrator: dispatch, batch order, `bail` on and off, the `MISSING` / `INVALID` / `DESTROYED` codes, event sequences, idempotent `destroy`, build-outside equivalence (a builder's `build()` output reasons identically to inline plain data).
- [`tests/src/core/builders/DefinitionBuilder.test.ts`](../tests/src/core/builders/DefinitionBuilder.test.ts) — the definition builder: mutation → `build` round-trips per manager, inert off-kind managers, per-manager event pins, manager + builder destroy semantics, brand-forge negatives, seed immutability.
- [`tests/src/core/builders/SubjectBuilder.test.ts`](../tests/src/core/builders/SubjectBuilder.test.ts) — the subject builder: id defaulting + immutability + anonymous builds, batch `remove`, incoming-wins `merge`, deterministic `repeat`, `build` determinism, destroy semantics.
- [`tests/src/core/helpers.test.ts`](../tests/src/core/helpers.test.ts) — `formatField`, `clamp` / `roundTo` / `matchesBounds` / `equalValues` / `sortByPriority` / `findDuplicates`, the fact and algebra machinery, and the capability-layer engine (`appendById` placement + `TARGET`, per-kind append / prepend / replace / remove, `merge*` / `clear*`, `parseDefinition`, the subject helpers).
- [`tests/src/core/validators.test.ts`](../tests/src/core/validators.test.ts) — each guard accepts valid / rejects invalid + adversarial junk, exact-record semantics, `lazyOf` recursion containment.
- [`tests/src/core/factories.test.ts`](../tests/src/core/factories.test.ts) — every value factory's output shape (override merging, key omission, `name` defaulting); every entity factory wires a working instance with custom `id`s through the options objects.
- [`tests/src/core/operators/Evaluator.test.ts`](../tests/src/core/operators/Evaluator.test.ts) — every comparison (strictness, numeric requirements, the `any` / `none` asymmetry vs the pure-negation `outside`), `FieldPath` resolution, unknown-operator totality.
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
