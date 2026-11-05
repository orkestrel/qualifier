# Reason

> A synchronous, deterministic reasoning engine: declarative JSON-serializable
> definitions evaluated against plain subject records to produce traceable
> results, through the `quantitative`, `logical`, `symbolic`, and `inferential`
> strategies behind one dispatch surface.

Each strategy is a `ReasonerInterface` registered on the thin `Reason` orchestrator: `quantitative` scores factors into a number, `logical` deduces `met`, `unmet`, or `unread` from rules by forward or backward chaining, `symbolic` solves algebraic equations by variable isolation, and `inferential` derives facts through unification variables and proof trees. The injectable `Evaluator`, `Transformer`, and `Aggregator` operators do the arithmetic every strategy shares. Every result is a fresh object carrying `success`, a human-readable `trace`, accumulated `errors`, and the `faults` naming what it could not read; nothing mutates its inputs.

The design stance is data in, data out, no surprises. What the engine cannot read it refuses: a missing field, a value of the wrong type, and a malformed definition entry never stand in for an answer, and the result names what stopped it. Definitions are pure data, built by hand or with the shipped value factories. The orchestrator holds no strategy logic — dispatch is a registry lookup by the `reasoning` discriminant. The operators are total: an unknown comparison surfaces as a `CheckResult.error`, and an unknown math operation and divide-by-zero are `NaN` rather than a throw. A reasoner never assumes `validate` ran, so a malformed definition yields a failure result and a throw is reserved for caller misuse, as a coded `ReasonError`.

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
		createFieldFactor('age', 'age'), // reads subject.age, a finite number or the run refuses
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

| Name                               | Kind     | Signature                                                                                   | Summary                                                                                                                                                                                                                |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createSymbolicDefinitionContract` | function | `() => ContractInterface<unknown>`                                                          | Creates the contract of a `SymbolicDefinition`. Cross it on `is`, and hold the result.                                                                                                                                 |
| `createLogicalDefinitionContract`  | function | `() => ContractInterface<unknown>`                                                          | Creates the contract of a `LogicalDefinition`. Cross it on `is`, and hold the result.                                                                                                                                  |
| `createDefinitionContract`         | function | `() => ContractInterface<unknown>`                                                          | Creates the contract of any `Definition`, its `schema` for an LLM, a tool, or MCP.                                                                                                                                     |
| `createSubjectDoor`                | function | `() => SubjectDoorInterface`                                                                | Creates a door that admits subjects through a shape before a reasoner reads them.                                                                                                                                      |
| `createReason`                     | function | `(options?: ReasonOptions) => ReasonInterface`                                              | Creates the reasoning orchestrator.                                                                                                                                                                                    |
| `createQuantitativeReasoner`       | function | `(options?: QuantitativeReasonerOptions) => ReasonerInterface`                              | Creates the quantitative reasoner — factor-based numeric scoring.                                                                                                                                                      |
| `createLogicalReasoner`            | function | `(options?: LogicalReasonerOptions) => ReasonerInterface`                                   | Creates the logical reasoner — rule-based deduction with forward / backward chaining.                                                                                                                                  |
| `createSymbolicReasoner`           | function | `(options?: SymbolicReasonerOptions) => ReasonerInterface`                                  | Creates the symbolic reasoner — algebraic equation solving by variable isolation.                                                                                                                                      |
| `createInferentialReasoner`        | function | `(options?: InferentialReasonerOptions) => ReasonerInterface`                               | Creates the inferential reasoner — fact derivation with unification variables and proof trees.                                                                                                                         |
| `createEvaluator`                  | function | `(options?: EvaluatorOptions) => EvaluatorInterface`                                        | Creates a check evaluator.                                                                                                                                                                                             |
| `createTransformer`                | function | `(options?: TransformerOptions) => TransformerInterface`                                    | Creates a math transformer.                                                                                                                                                                                            |
| `createAggregator`                 | function | `(options?: AggregatorOptions) => AggregatorInterface`                                      | Creates a number aggregator.                                                                                                                                                                                           |
| `createDefinitionBuilder`          | function | `(seed: Definition, options?: DefinitionBuilderOptions) => DefinitionBuilderInterface`      | Creates a `DefinitionBuilder` — a stateful workspace builder accumulating a `Definition` through the `groups`, `factors`, `rules`, `equations`, `variables`, `facts`, and `inferences` self-owning manager properties. |
| `createSubjectBuilder`             | function | `(seed: Subject, options?: SubjectBuilderOptions) => SubjectBuilderInterface`               | Creates a `SubjectBuilder` — a stateful workspace builder accumulating a `Subject`.                                                                                                                                    |
| `createGroupManager`               | function | `(options?: GroupManagerOptions) => GroupManagerInterface`                                  | Creates a `GroupManager` — a self-owning manager over a quantitative definition's `groups`.                                                                                                                            |
| `createFactorManager`              | function | `(groups: GroupManagerInterface, options?: FactorManagerOptions) => FactorManagerInterface` | Creates a `FactorManager` — the divergent manager over a group's `factors`, threaded through a required `groupId` locator.                                                                                             |
| `createRuleManager`                | function | `(options?: RuleManagerOptions) => RuleManagerInterface`                                    | Creates a `RuleManager` — a self-owning manager over a logical definition's `rules`.                                                                                                                                   |
| `createEquationManager`            | function | `(options?: EquationManagerOptions) => EquationManagerInterface`                            | Creates an `EquationManager` — a self-owning manager over a symbolic definition's `equations`.                                                                                                                         |
| `createVariableManager`            | function | `(options?: VariableManagerOptions) => VariableManagerInterface`                            | Creates a `VariableManager` — a self-owning manager over a symbolic definition's `variables` (a name-keyed record; `add` / `remove` only).                                                                             |
| `createFactManager`                | function | `(options?: FactManagerOptions) => FactManagerInterface`                                    | Creates a `FactManager` — a self-owning manager over an inferential definition's `facts`.                                                                                                                              |
| `createInferenceManager`           | function | `(options?: InferenceManagerOptions) => InferenceManagerInterface`                          | Creates an `InferenceManager` — a self-owning manager over an inferential definition's `inferences`.                                                                                                                   |

### Orchestrator & reasoners

| Name                   | Kind  | Signature                                                          | Summary                                                                                     |
| ---------------------- | ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `Reason`               | class | `new (options?: ReasonOptions) => ReasonInterface`                 | Implements the reasoning orchestrator — a thin router over registered `ReasonerInterface`s. |
| `QuantitativeReasoner` | class | `new (options?: QuantitativeReasonerOptions) => ReasonerInterface` | Performs factor-based numeric scoring.                                                      |
| `LogicalReasoner`      | class | `new (options?: LogicalReasonerOptions) => ReasonerInterface`      | Deduces states from rules with forward or backward chaining, refusing what it cannot read.  |
| `SymbolicReasoner`     | class | `new (options?: SymbolicReasonerOptions) => ReasonerInterface`     | Solves algebraic equations by variable isolation.                                           |
| `InferentialReasoner`  | class | `new (options?: InferentialReasonerOptions) => ReasonerInterface`  | Derives facts with unification variables and proof trees.                                   |

### Operators

| Name          | Kind  | Signature                                                    | Summary                                                                                                           |
| ------------- | ----- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `Evaluator`   | class | `new (options?: EvaluatorOptions) => EvaluatorInterface`     | Evaluates field predicates against subjects.                                                                      |
| `Transformer` | class | `new (options?: TransformerOptions) => TransformerInterface` | Applies math `Transform`s to numbers — the quantitative reasoner's per-factor pipeline stage.                     |
| `Aggregator`  | class | `new (options?: AggregatorOptions) => AggregatorInterface`   | Reduces number lists to one number per `Aggregation` — the quantitative reasoner's group and definition combiner. |

### Classes

The definitions & subjects capability layer's stateful workspace builders: mutate through named methods, then `build()` a fresh plain payload to hand to `reason` at the call site. The managers are self-owning (each owns its own collection state and emitter, takes its own options, and has its own factory) and kind-free (an off-kind manager accumulates silently and is ignored by `build()` — never a `MISMATCH`). `DefinitionBuilder` and `SubjectBuilder` each carry a `unique symbol` brand — `DEFINITION_BUILDER_BRAND` and `SUBJECT_BUILDER_BRAND` — that `isDefinitionBuilder` and `isSubjectBuilder` read through `Reflect.get`, so plain data can never forge a builder.

| Name                | Kind  | Signature                                                                                       | Summary                                                                                                                                                                                                                                                   |
| ------------------- | ----- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SubjectDoor`       | class | `new () => SubjectDoorInterface`                                                                | Admits a subject through a definition's shape before any reasoner reads it.                                                                                                                                                                               |
| `DefinitionBuilder` | class | `new (seed: Definition, options?: DefinitionBuilderOptions) => DefinitionBuilderInterface`      | Implements a stateful workspace builder accumulating a `Definition` through always-present self-owning manager properties: a private scalar envelope (reasoning / id / name plus the kind's scalars) composed with each collection read from its manager. |
| `GroupManager`      | class | `new (options?: GroupManagerOptions) => GroupManagerInterface`                                  | Implements the `GroupManagerInterface` — a self-owning, kind-free manager over a quantitative definition's `groups`.                                                                                                                                      |
| `FactorManager`     | class | `new (groups: GroupManagerInterface, options?: FactorManagerOptions) => FactorManagerInterface` | Implements the `FactorManagerInterface` — the one divergent manager: factors nest inside groups, so it holds no collection state of its own and threads a required `groupId` locator.                                                                     |
| `RuleManager`       | class | `new (options?: RuleManagerOptions) => RuleManagerInterface`                                    | Implements the `RuleManagerInterface` — a self-owning, kind-free manager over a logical definition's `rules`.                                                                                                                                             |
| `EquationManager`   | class | `new (options?: EquationManagerOptions) => EquationManagerInterface`                            | Implements the `EquationManagerInterface` — a self-owning, kind-free manager over a symbolic definition's `equations`.                                                                                                                                    |
| `VariableManager`   | class | `new (options?: VariableManagerOptions) => VariableManagerInterface`                            | Implements the `VariableManagerInterface` — a self-owning, kind-free manager over a symbolic definition's `variables`, a name-keyed unordered record.                                                                                                     |
| `FactManager`       | class | `new (options?: FactManagerOptions) => FactManagerInterface`                                    | Implements the `FactManagerInterface` — a self-owning, kind-free manager over an inferential definition's `facts`.                                                                                                                                        |
| `InferenceManager`  | class | `new (options?: InferenceManagerOptions) => InferenceManagerInterface`                          | Implements the `InferenceManagerInterface` — a self-owning, kind-free manager over an inferential definition's `inferences`.                                                                                                                              |
| `SubjectBuilder`    | class | `new (seed: Subject, options?: SubjectBuilderOptions) => SubjectBuilderInterface`               | Implements a stateful workspace builder accumulating a `Subject` — one flat key-value collection, no managers.                                                                                                                                            |

### Value factories

Plain-data constructors for the declarative definition vocabulary — no lifecycle, no emitter, no identity. Reach for the entity factories earlier when you need a working instance instead.

| Name                           | Kind     | Signature                                                                                                                                                                                                                   | Summary                                                                                                    |
| ------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `createCheck`                  | function | `(field: FieldPath, operator: Comparison, value: unknown) => Check`                                                                                                                                                         | Creates a `Check` — one field predicate.                                                                   |
| `createAtom`                   | function | `(field: FieldPath, operator: Comparison, value: unknown) => Expression`                                                                                                                                                    | Creates an atom `Expression` — a leaf wrapping one `Check`.                                                |
| `createCompound`               | function | `(operator: LogicalOperator, operands: readonly Expression[]) => Expression`                                                                                                                                                | Creates a compound `Expression` — a logical connective over nested operands.                               |
| `createRule`                   | function | `(id: string, premises: readonly Expression[], conclusion: Expression, overrides?: Partial<Omit<Rule, 'id' \| 'premises' \| 'conclusion'>>) => Rule`                                                                        | Creates a `Rule` — premises and a conclusion.                                                              |
| `createTransform`              | function | `(operator: MathOperation, operand?: number) => Transform`                                                                                                                                                                  | Creates a `Transform` — one math step.                                                                     |
| `createBounds`                 | function | `(minimum?: number, maximum?: number) => Bounds`                                                                                                                                                                            | Creates a `Bounds` — an inclusive numeric clamp.                                                           |
| `createVariable`               | function | `(name: string) => SymbolicExpression`                                                                                                                                                                                      | Creates a variable `SymbolicExpression` leaf.                                                              |
| `createConstant`               | function | `(value: number) => SymbolicExpression`                                                                                                                                                                                     | Creates a constant `SymbolicExpression` leaf.                                                              |
| `createOperation`              | function | `(operator: MathOperation, left: SymbolicExpression, right?: SymbolicExpression) => SymbolicExpression`                                                                                                                     | Creates an operation `SymbolicExpression` node.                                                            |
| `createEquation`               | function | `(id: string, left: SymbolicExpression, right: SymbolicExpression, target: string, overrides?: Partial<Omit<Equation, 'id' \| 'left' \| 'right' \| 'target'>>) => Equation`                                                 | Creates an `Equation` — `left = right`, solved for `target`.                                               |
| `createFact`                   | function | `(id: string, predicate: string, terms: readonly unknown[], confidence?: number) => Fact`                                                                                                                                   | Creates a `Fact` — a predicate over positional terms.                                                      |
| `createInference`              | function | `(id: string, premises: readonly Fact[], conclusion: Fact, overrides?: Partial<Omit<Inference, 'id' \| 'premises' \| 'conclusion'>>) => Inference`                                                                          | Creates an `Inference` — premise patterns and a conclusion pattern.                                        |
| `createStaticSource`           | function | `(value: number) => FactorSource`                                                                                                                                                                                           | Creates a static `FactorSource` — a fixed number.                                                          |
| `createFieldSource`            | function | `(field: FieldPath) => FactorSource`                                                                                                                                                                                        | Creates a field `FactorSource` — a subject field read as a number.                                         |
| `createLookupSource`           | function | `(field: FieldPath, table: Readonly<Record<string, number>>) => FactorSource`                                                                                                                                               | Creates a lookup `FactorSource` — a subject field mapped through a table.                                  |
| `createRangeSource`            | function | `(field: FieldPath, ranges: readonly FactorRange[]) => FactorSource`                                                                                                                                                        | Creates a range `FactorSource` — a numeric subject field banded through ordered ranges (first match wins). |
| `createStaticFactor`           | function | `(id: string, value: number, overrides?: Partial<Omit<Factor, 'id' \| 'source'>>) => Factor`                                                                                                                                | Creates a `Factor` over a static `FactorSource`.                                                           |
| `createFieldFactor`            | function | `(id: string, field: FieldPath, overrides?: Partial<Omit<Factor, 'id' \| 'source'>>) => Factor`                                                                                                                             | Creates a `Factor` over a field `FactorSource`.                                                            |
| `createLookupFactor`           | function | `(id: string, field: FieldPath, table: Readonly<Record<string, number>>, overrides?: Partial<Omit<Factor, 'id' \| 'source'>>) => Factor`                                                                                    | Creates a `Factor` over a lookup `FactorSource`.                                                           |
| `createRangeFactor`            | function | `(id: string, field: FieldPath, ranges: readonly FactorRange[], overrides?: Partial<Omit<Factor, 'id' \| 'source'>>) => Factor`                                                                                             | Creates a `Factor` over a range `FactorSource`.                                                            |
| `createFactorGroup`            | function | `(id: string, aggregation: Aggregation, factors: readonly Factor[], overrides?: Partial<Omit<FactorGroup, 'id' \| 'aggregation' \| 'factors'>>) => FactorGroup`                                                             | Creates a `FactorGroup`.                                                                                   |
| `createQuantitativeDefinition` | function | `(id: string, name: string, groups: readonly FactorGroup[], overrides?: Partial<Omit<QuantitativeDefinition, 'reasoning' \| 'id' \| 'name' \| 'groups'>>) => QuantitativeDefinition`                                        | Creates a `QuantitativeDefinition`.                                                                        |
| `createLogicalDefinition`      | function | `(id: string, name: string, rules: readonly Rule[], overrides?: Partial<Omit<LogicalDefinition, 'reasoning' \| 'id' \| 'name' \| 'rules'>>) => LogicalDefinition`                                                           | Creates a `LogicalDefinition`.                                                                             |
| `createSymbolicDefinition`     | function | `(id: string, name: string, equations: readonly Equation[], overrides?: Partial<Omit<SymbolicDefinition, 'reasoning' \| 'id' \| 'name' \| 'equations'>>) => SymbolicDefinition`                                             | Creates a `SymbolicDefinition`.                                                                            |
| `createInferentialDefinition`  | function | `(id: string, name: string, facts: readonly Fact[], inferences: readonly Inference[], overrides?: Partial<Omit<InferentialDefinition, 'reasoning' \| 'id' \| 'name' \| 'facts' \| 'inferences'>>) => InferentialDefinition` | Creates an `InferentialDefinition`.                                                                        |

Every value factory returns a fresh object and omits absent optional keys entirely, so its output round-trips the exact-record validators in § Validators.

### Helpers

| Name                       | Kind     | Signature                                                                                                                 | Summary                                                                                                                                                 |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectCheck`             | function | `(check: CheckResult) => CheckResult`                                                                                     | Projects a check's `actual` on its own budget, omitting it when it has no JSON form.                                                                    |
| `describeMismatch`         | function | `(expected: string, definition: unknown) => string`                                                                       | Describes a definition whose reasoning is not the one a reasoner expected.                                                                              |
| `describeTerms`            | function | `(terms: readonly unknown[]) => string`                                                                                   | Describes a fact's terms for the trace.                                                                                                                 |
| `scanConclusionValues`     | function | `(expression: Expression) => readonly string[]`                                                                           | Scans a conclusion for one key asserted with two values, of which a run would keep the last.                                                            |
| `collectVariables`         | function | `(expression: SymbolicExpression) => readonly string[]`                                                                   | Collects every variable a symbolic expression reads.                                                                                                    |
| `scanSymbolicExpression`   | function | `(expression: SymbolicExpression) => readonly string[]`                                                                   | Scans a symbolic expression for a binary operation with no right side.                                                                                  |
| `scanFactor`               | function | `(factor: Factor) => readonly string[]`                                                                                   | Scans a factor for a `fallback` its source cannot use and for malformed checks.                                                                         |
| `scanConclusion`           | function | `(expression: Expression) => readonly string[]`                                                                           | Scans a rule's conclusion, which may only assert: `equals` atoms under `and`, none of them asserting `false`.                                           |
| `scanExpression`           | function | `(expression: Expression) => readonly string[]`                                                                           | Scans a premise expression for a wrong connective arity and a malformed check.                                                                          |
| `scanCheck`                | function | `(check: Check) => readonly string[]`                                                                                     | Scans a check for an expected value its comparison cannot use.                                                                                          |
| `scanShapeConclusions`     | function | `(shape: ContractShape, rules: readonly Rule[]) => readonly string[]`                                                     | Scans a shape for a key the rules conclude, which a subject may not supply.                                                                             |
| `scanCheckExpected`        | function | `(shape: ContractShape, check: Check, known: ReadonlySet<string>) => readonly string[]`                                   | Scans a check's expected value against the shape of the field it reads.                                                                                 |
| `scanShapeReads`           | function | `(shape: ContractShape, checks: readonly Check[], fields: readonly FieldPath[], known: ReadonlySet<string>) => ShapeScan` | Scans what a definition reads against its shape.                                                                                                        |
| `scanShape`                | function | `(shape: ContractShape, path?: readonly string[], required?: boolean) => readonly string[]`                               | Scans a shape for what cannot stand in a definition.                                                                                                    |
| `admitsLiteral`            | function | `(shape: ContractShape, value: string) => boolean`                                                                        | Determines whether a shape admits a string as one of its closed values.                                                                                 |
| `isUntypedShape`           | function | `(shape: ContractShape \| undefined) => boolean`                                                                          | Determines whether a field's shape leaves its value untyped, which a `raw` or `json` node does.                                                         |
| `findFieldShape`           | function | `(shape: ContractShape, path: FieldPath) => ShapeRead`                                                                    | Finds what a shape says about a field path.                                                                                                             |
| `findFilledPaths`          | function | `(input: unknown, parsed: unknown, path?: readonly string[]) => readonly FieldPath[]`                                     | Lists the paths `parse` filled: absent or `undefined` in the input and present in the output.                                                           |
| `projectResult`            | function | `(result: ReasonResult) => JSONValue \| undefined`                                                                        | Projects a result to the JSON its contract reads.                                                                                                       |
| `projectValue`             | function | `(value: unknown, ancestors?: ReadonlySet<object>, budget?: { left: number; }) => JSONValue \| undefined`                 | Projects any value to JSON: a non-finite number becomes `null`, and what JSON cannot hold is dropped.                                                   |
| `filterUniqueFaults`       | function | `(faults: readonly AuditFault[]) => readonly AuditFault[]`                                                                | Returns the faults of a list once per field, compared by the flattened path.                                                                            |
| `filterUniqueFields`       | function | `(fields: readonly FieldPath[]) => readonly FieldPath[]`                                                                  | Returns the fields of a list once each, compared by the flattened path.                                                                                 |
| `valueToKind`              | function | `(value: unknown) => FaultKind`                                                                                           | Names the fault kind of a JSON value.                                                                                                                   |
| `readExpectedKind`         | function | `(check: Check) => FaultKind`                                                                                             | Names what a check needed from its field, for the fault an unread read becomes.                                                                         |
| `valueToFault`             | function | `(path: FieldPath, expected: FaultKind, actual: unknown) => AuditFault`                                                   | Builds the fault for a field the engine could not read.                                                                                                 |
| `collectPolarReads`        | function | `(expression: Expression, negated: boolean) => readonly PolarRead[]`                                                      | Collects every key an expression reads with the polarity of that read.                                                                                  |
| `collectReachable`         | function | `(start: string, edges: ReadonlyArray<readonly [string, string]>) => ReadonlySet<string>`                                 | Collects every node a list of directed edges reaches from a start, the start included.                                                                  |
| `findNegativeCycles`       | function | `(rules: readonly Rule[]) => readonly string[]`                                                                           | Finds the conclusion keys on a cycle through negation, which no order of evaluation can settle.                                                         |
| `findSuppliedConclusions`  | function | `(rules: readonly Rule[], subject: Subject) => readonly string[]`                                                         | Finds the conclusion keys a subject supplies itself, which would let it assert what a rule has to derive.                                               |
| `collectConcluders`        | function | `(rules: readonly Rule[]) => ReadonlyMap<string, readonly Rule[]>`                                                        | Collects each conclusion key with the rules that conclude it.                                                                                           |
| `buildRefusedResult`       | function | `(definition: Definition, admission: SubjectAdmission) => ReasonResult`                                                   | Builds the empty failure result for a subject the door refused.                                                                                         |
| `combineStates`            | function | `(operator: LogicalOperator \| string, states: readonly CheckState[]) => CheckState`                                      | Combines operand states under a logical connective, in strong Kleene logic.                                                                             |
| `readClosedState`          | function | `(operator: string) => CheckState`                                                                                        | Returns what a comparison reads on a conclusion no rule concluded, once every rule that could have has settled.                                         |
| `settleComparison`         | function | `(actual: unknown, operator: string, expected: unknown) => CheckState`                                                    | Compares a subject value with an expected value and returns what that settles.                                                                          |
| `formatField`              | function | `(field: FieldPath) => string`                                                                                            | Formats a `FieldPath` for display — the single string key itself, or the array segments joined with `.`.                                                |
| `clamp`                    | function | `(value: number, limit?: Bounds) => number`                                                                               | Clamps a number to inclusive `Bounds`.                                                                                                                  |
| `roundTo`                  | function | `(value: number, precision?: number) => number`                                                                           | Rounds a number to a fixed count of decimal places.                                                                                                     |
| `matchesBounds`            | function | `(value: unknown, range: unknown) => boolean`                                                                             | Checks whether a value falls inside an inclusive range expressed as an array.                                                                           |
| `emptyAggregate`           | function | `(aggregation: Aggregation) => number`                                                                                    | Returns the empty-input identity of one `Aggregation`.                                                                                                  |
| `resolveSource`            | function | `(source: FactorSource, subject: Subject, fallback?: number) => SourceResult`                                             | Resolves one `FactorSource` against a subject, falling back when it cannot.                                                                             |
| `equalValues`              | function | `(left: unknown, right: unknown) => boolean`                                                                              | Determines whether two values are SameValueZero-equal — strict `===` with `NaN` equal to itself (and, unlike `Object.is`, `+0` equal to `-0`).          |
| `sortByPriority`           | function | `<T extends { readonly priority?: number; }>(items: readonly T[]) => readonly T[]`                                        | Sorts items ascending by `priority ?? DEFAULT_PRIORITY` — a stable copy sort.                                                                           |
| `findDuplicates`           | function | `(items: ReadonlyArray<{ readonly id: string; }>) => readonly string[]`                                                   | Collects the ids that appear more than once in an id-carrying list — each duplicated id reported once, in first-occurrence order.                       |
| `factToArityKey`           | function | `(fact: Fact) => string`                                                                                                  | Derives a fact's predicate+arity bucket key — length-prefixed so the delimiter cannot be forged.                                                        |
| `indexByArity`             | function | `(facts: readonly Fact[]) => ReadonlyMap<string, readonly Fact[]>`                                                        | Buckets facts by predicate+arity, preserving append order within each bucket.                                                                           |
| `termToKey`                | function | `(term: unknown, identities: Map<object, number>) => string`                                                              | Derives one fact term's contribution to a dedup key — reference identity for non-null objects / functions, a SameValueZero value string for primitives. |
| `factToKey`                | function | `(fact: Fact, identities: Map<object, number>) => string`                                                                 | Derives a fact's canonical dedup key — predicate + arity + per-term SameValueZero identity, with confidence excluded from it.                           |
| `matchFacts`               | function | `(pattern: Fact, candidate: Fact) => Record<string, unknown> \| undefined`                                                | Unifies a pattern fact positionally against a candidate fact — returning the variable bindings on success, `undefined` on mismatch.                     |
| `instantiateFact`          | function | `(fact: Fact, bindings: Record<string, unknown>) => Fact`                                                                 | Substitutes a fact's bound `'?'`-variables with their values — a fresh fact with unbound terms passed through unchanged.                                |
| `subjectToFacts`           | function | `(subject: Subject) => { readonly facts: readonly Fact[]; readonly trace: readonly string[]; }`                           | Projects a subject's scalar fields into `has(key, value)` base facts — the inferential reasoner's subject-injection step.                               |
| `computePremiseConfidence` | function | `(premises: readonly Fact[], index: ReadonlyMap<string, readonly Fact[]>, bindings: Record<string, unknown>) => number`   | Computes the confidence a set of matched premises contributes to a derived fact — the product of each premise's first matching fact's confidence.       |
| `containsVariable`         | function | `(expression: SymbolicExpression, target: string, bindings: Record<string, number>) => boolean`                           | Determines whether a symbolic expression contains an unbound occurrence of a target variable.                                                           |
| `invertLeft`               | function | `(operator: MathOperation, value: number, rightValue: number) => number`                                                  | Inverts a `x op right = value` step, solving for the left operand `x`.                                                                                  |
| `invertRight`              | function | `(operator: MathOperation, value: number, leftValue: number) => number`                                                   | Inverts a `left op x = value` step, solving for the right operand `x`.                                                                                  |
| `applyOperation`           | function | `(operator: string, left: number, right: number) => number`                                                               | Applies one binary/unary math operation to already-evaluated operands.                                                                                  |
| `resolveOperand`           | function | `(operation: MathOperation, operand?: number) => number`                                                                  | Resolves the effective right operand of a math operation — the supplied `operand`, or the operation's own identity-preserving default when absent.      |
| `extractAtoms`             | function | `(expression: Expression) => readonly Atom[]`                                                                             | Returns every atom leaf of an expression tree, depth-first, left-to-right.                                                                              |
| `extractConclusions`       | function | `(expression: Expression) => Record<string, unknown>`                                                                     | Flattens a logical conclusion expression into its asserted `field = value` pairs, ignoring the connectives.                                             |
| `findUnboundVariables`     | function | `(inference: Inference) => readonly string[]`                                                                             | Collects the `'?'`-prefixed conclusion variables no premise binds.                                                                                      |
| `buildErrorResult`         | function | `(definition: Definition, message: string) => ReasonResult`                                                               | Builds the empty, type-shaped failure `ReasonResult` matching a definition's reasoning.                                                                 |

The definitions & subjects capability layer (§ Classes) adds a pure, copy-on-write change / extend / merge / store surface over every definition kind, plus a subject engine of pure helpers — none of it mutates an input, and every helper returns a fresh value.

| Name                          | Kind     | Signature                                                                                                                                 | Summary                                                                                                                                                 |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appendById`                  | function | `<T extends { readonly id: string; }>(items: readonly T[], item: T, target?: string) => readonly T[]`                                     | Inserts `item` into an id-keyed collection, deduping any existing element sharing its id, then placing it at the end, or immediately after `target`.    |
| `prependById`                 | function | `<T extends { readonly id: string; }>(items: readonly T[], item: T, target?: string) => readonly T[]`                                     | Inserts `item` into an id-keyed collection, deduping any existing element sharing its id, then placing it at the start, or immediately before `target`. |
| `replaceById`                 | function | `<T extends { readonly id: string; }>(items: readonly T[], item: T) => readonly T[]`                                                      | Swaps the element sharing `item.id` in place, preserving its position.                                                                                  |
| `removeById`                  | function | `<T extends { readonly id: string; }>(items: readonly T[], id: string) => readonly T[]`                                                   | Filters every element sharing `id` out of an id-keyed collection.                                                                                       |
| `mergeById`                   | function | `<T extends { readonly id: string; }>(base: readonly T[], incoming: readonly T[], resolve?: (base: T, incoming: T) => T) => readonly T[]` | Reconciles two id-keyed collections — an incoming-order upsert with base-only survivors appended after.                                                 |
| `definitionToEnvelope`        | function | `(definition: Definition) => DefinitionEnvelope`                                                                                          | Projects a `Definition` to its scalar envelope — the kind's collections drop out.                                                                       |
| `appendGroup`                 | function | `(definition: QuantitativeDefinition, group: FactorGroup, target?: string) => QuantitativeDefinition`                                     | Inserts `group` into a `QuantitativeDefinition`'s `groups` — dedup-then- insert at the end, or immediately after `target`.                              |
| `prependGroup`                | function | `(definition: QuantitativeDefinition, group: FactorGroup, target?: string) => QuantitativeDefinition`                                     | Inserts `group` into a `QuantitativeDefinition`'s `groups` — dedup-then- insert at the start, or immediately before `target`.                           |
| `replaceGroup`                | function | `(definition: QuantitativeDefinition, group: FactorGroup) => QuantitativeDefinition`                                                      | Swaps the group sharing `group.id` in a `QuantitativeDefinition` in place, preserving its position (appended when absent).                              |
| `removeGroup`                 | function | `(definition: QuantitativeDefinition, id: string) => QuantitativeDefinition`                                                              | Removes every group sharing `id` from a `QuantitativeDefinition` (no-op when absent).                                                                   |
| `appendFactor`                | function | `(group: FactorGroup, factor: Factor, target?: string) => FactorGroup`                                                                    | Inserts `factor` into a `FactorGroup`'s `factors` — dedup-then-insert at the end, or immediately after `target`.                                        |
| `prependFactor`               | function | `(group: FactorGroup, factor: Factor, target?: string) => FactorGroup`                                                                    | Inserts `factor` into a `FactorGroup`'s `factors` — dedup-then-insert at the start, or immediately before `target`.                                     |
| `replaceFactor`               | function | `(group: FactorGroup, factor: Factor) => FactorGroup`                                                                                     | Swaps the factor sharing `factor.id` in a `FactorGroup` in place, preserving its position (appended when absent).                                       |
| `removeFactor`                | function | `(group: FactorGroup, id: string) => FactorGroup`                                                                                         | Removes every factor sharing `id` from a `FactorGroup` (no-op when absent).                                                                             |
| `appendRule`                  | function | `(definition: LogicalDefinition, rule: Rule, target?: string) => LogicalDefinition`                                                       | Inserts a rule into a `LogicalDefinition`'s `rules` — dedup-then-insert at the end, or immediately after `target`.                                      |
| `prependRule`                 | function | `(definition: LogicalDefinition, rule: Rule, target?: string) => LogicalDefinition`                                                       | Inserts a rule into a `LogicalDefinition`'s `rules` — dedup-then-insert at the start, or immediately before `target`.                                   |
| `replaceRule`                 | function | `(definition: LogicalDefinition, rule: Rule) => LogicalDefinition`                                                                        | Swaps the rule sharing `rule.id` in a `LogicalDefinition` in place, preserving its position (appended when absent).                                     |
| `removeRule`                  | function | `(definition: LogicalDefinition, id: string) => LogicalDefinition`                                                                        | Removes every rule sharing `id` from a `LogicalDefinition` (no-op when absent).                                                                         |
| `appendEquation`              | function | `(definition: SymbolicDefinition, equation: Equation, target?: string) => SymbolicDefinition`                                             | Inserts an equation into a `SymbolicDefinition`'s `equations` — dedup- then-insert at the end, or immediately after `target`.                           |
| `prependEquation`             | function | `(definition: SymbolicDefinition, equation: Equation, target?: string) => SymbolicDefinition`                                             | Inserts an equation into a `SymbolicDefinition`'s `equations` — dedup- then-insert at the start, or immediately before `target`.                        |
| `replaceEquation`             | function | `(definition: SymbolicDefinition, equation: Equation) => SymbolicDefinition`                                                              | Swaps the equation sharing `equation.id` in a `SymbolicDefinition` in place, preserving its position (appended when absent).                            |
| `removeEquation`              | function | `(definition: SymbolicDefinition, id: string) => SymbolicDefinition`                                                                      | Removes every equation sharing `id` from a `SymbolicDefinition` (no-op when absent).                                                                    |
| `addVariable`                 | function | `(definition: SymbolicDefinition, name: string, value: number) => SymbolicDefinition`                                                     | Upserts one entry of a `SymbolicDefinition`'s `variables`.                                                                                              |
| `removeVariable`              | function | `(definition: SymbolicDefinition, name: string) => SymbolicDefinition`                                                                    | Removes one entry of a `SymbolicDefinition`'s `variables`.                                                                                              |
| `appendFact`                  | function | `(definition: InferentialDefinition, fact: Fact, target?: string) => InferentialDefinition`                                               | Inserts a fact into an `InferentialDefinition`'s `facts` — dedup-then- insert at the end, or immediately after `target`.                                |
| `prependFact`                 | function | `(definition: InferentialDefinition, fact: Fact, target?: string) => InferentialDefinition`                                               | Inserts a fact into an `InferentialDefinition`'s `facts` — dedup-then- insert at the start, or immediately before `target`.                             |
| `replaceFact`                 | function | `(definition: InferentialDefinition, fact: Fact) => InferentialDefinition`                                                                | Swaps the fact sharing `fact.id` in an `InferentialDefinition` in place, preserving its position (appended when absent).                                |
| `removeFact`                  | function | `(definition: InferentialDefinition, id: string) => InferentialDefinition`                                                                | Removes every fact sharing `id` from an `InferentialDefinition` (no-op when absent).                                                                    |
| `appendInference`             | function | `(definition: InferentialDefinition, inference: Inference, target?: string) => InferentialDefinition`                                     | Inserts an inference into an `InferentialDefinition`'s `inferences` — dedup-then-insert at the end, or immediately after `target`.                      |
| `prependInference`            | function | `(definition: InferentialDefinition, inference: Inference, target?: string) => InferentialDefinition`                                     | Inserts an inference into an `InferentialDefinition`'s `inferences` — dedup-then-insert at the start, or immediately before `target`.                   |
| `replaceInference`            | function | `(definition: InferentialDefinition, inference: Inference) => InferentialDefinition`                                                      | Swaps the inference sharing `inference.id` in an `InferentialDefinition` in place, preserving its position (appended when absent).                      |
| `removeInference`             | function | `(definition: InferentialDefinition, id: string) => InferentialDefinition`                                                                | Removes every inference sharing `id` from an `InferentialDefinition` (no-op when absent).                                                               |
| `mergeQuantitativeDefinition` | function | `(base: QuantitativeDefinition, incoming: QuantitativeDefinition) => QuantitativeDefinition`                                              | Reconciles two `QuantitativeDefinition`s onto `base`'s id.                                                                                              |
| `mergeLogicalDefinition`      | function | `(base: LogicalDefinition, incoming: LogicalDefinition) => LogicalDefinition`                                                             | Reconciles two `LogicalDefinition`s onto `base`'s id.                                                                                                   |
| `mergeSymbolicDefinition`     | function | `(base: SymbolicDefinition, incoming: SymbolicDefinition) => SymbolicDefinition`                                                          | Reconciles two `SymbolicDefinition`s onto `base`'s id.                                                                                                  |
| `mergeInferentialDefinition`  | function | `(base: InferentialDefinition, incoming: InferentialDefinition) => InferentialDefinition`                                                 | Reconciles two `InferentialDefinition`s onto `base`'s id.                                                                                               |
| `clearQuantitativeDefinition` | function | `(definition: QuantitativeDefinition, key: QuantitativeClearKey) => QuantitativeDefinition`                                               | Deletes one optional field of a `QuantitativeDefinition`.                                                                                               |
| `clearLogicalDefinition`      | function | `(definition: LogicalDefinition, key: LogicalClearKey) => LogicalDefinition`                                                              | Deletes one optional field of a `LogicalDefinition`.                                                                                                    |
| `clearSymbolicDefinition`     | function | `(definition: SymbolicDefinition, key: SymbolicClearKey) => SymbolicDefinition`                                                           | Deletes one optional field of a `SymbolicDefinition`.                                                                                                   |
| `clearInferentialDefinition`  | function | `(definition: InferentialDefinition, key: InferentialClearKey) => InferentialDefinition`                                                  | Deletes one optional field of an `InferentialDefinition`.                                                                                               |
| `parseDefinition`             | function | `(json: string) => Definition \| undefined`                                                                                               | Parses a JSON string into a `Definition`, failing safe to `undefined`.                                                                                  |
| `assignField`                 | function | `(subject: Subject, key: string, value: unknown) => Subject`                                                                              | Upserts one field of a `Subject` — copy-on-write spread.                                                                                                |
| `removeField`                 | function | `(subject: Subject, key: string) => Subject`                                                                                              | Deletes one field of a `Subject` — destructure-rest omit.                                                                                               |
| `mergeSubjects`               | function | `(base: Subject, incoming: Subject) => Subject`                                                                                           | Reconciles two `Subject`s — incoming-wins spread, with the base `id` preserved when present.                                                            |
| `repeatSubject`               | function | `(subject: Subject, count: number) => readonly Subject[]`                                                                                 | Produces `count` deterministic clones of a `Subject`.                                                                                                   |

### Validators

Total guards return `false`, never throw, for adversarial input such as junk, cycles, and hostile prototypes. Input guards compose the [contracts](contract.md) combinators. Result guards use bespoke open member checks and retain those combinators for nested values. Exactness follows who produces the value, not who declares the type: caller-supplied input records are exact, while package or foreign-interface result records are open to extra members. Numeric input fields guard with `isFiniteNumber` (JSON cannot carry `NaN` / `±Infinity`); the recursive input shapes recurse through `lazyOf`.

| Name                       | Kind     | Signature                                                 | Summary                                                                                                                                                 |
| -------------------------- | -------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isPaddedText`             | function | `(value: unknown) => boolean`                             | Determines whether a value is a string that is blank or differs from its trim, which no comparison reads as the text it would be without the padding.   |
| `isMembership`             | const    | `Guard<ReadonlyArray<LiteralValue \| null>>`              | Determines whether a value is a well-formed membership list for `any` and `none` — a non-empty array of comparable values.                              |
| `isRange`                  | const    | `Guard<readonly [number, number]>`                        | Determines whether a value is a well-formed range for `between` and `outside` — two finite numbers, the first no greater than the second.               |
| `isContractShape`          | function | `(value: unknown) => value is ContractShape`              | Determines whether a value is a well-formed `ContractShape`, by asking `contract`.                                                                      |
| `isComparable`             | const    | `Guard<LiteralValue \| null>`                             | Determines whether a value is one a comparison can settle — a lookup key or `null`, which is a value of its own.                                        |
| `isLookupKey`              | const    | `Guard<LiteralValue>`                                     | Determines whether a value can key a lookup table — a finite number, a string, or a boolean.                                                            |
| `isCheckState`             | const    | `Guard<CheckState>`                                       | Determines whether a value is a `CheckState` literal.                                                                                                   |
| `isReasoning`              | const    | `Guard<Reasoning>`                                        | Determines whether a value is a `Reasoning` literal.                                                                                                    |
| `isChainStrategy`          | const    | `Guard<ChainStrategy>`                                    | Determines whether a value is a `ChainStrategy` literal.                                                                                                |
| `isMathOperation`          | const    | `Guard<MathOperation>`                                    | Determines whether a value is a `MathOperation` literal.                                                                                                |
| `isAggregation`            | const    | `Guard<Aggregation>`                                      | Determines whether a value is an `Aggregation` literal.                                                                                                 |
| `isComparison`             | const    | `Guard<Comparison>`                                       | Determines whether a value is a `Comparison` literal.                                                                                                   |
| `isLogicalOperator`        | const    | `Guard<LogicalOperator>`                                  | Determines whether a value is a `LogicalOperator` literal.                                                                                              |
| `isFieldPath`              | const    | `Guard<FieldPath>`                                        | Determines whether a value is a `FieldPath` — a single string key or an array of keys descending into nested objects.                                   |
| `isNumberRecord`           | const    | `Guard<Readonly<Record<string, number>>>`                 | Determines whether a value is a record whose every value is a finite number — the shape of a `LookupSource.table` and a `SymbolicDefinition.variables`. |
| `isCheck`                  | function | `(value: unknown) => value is Check`                      | Determines whether a value is a `Check` — a field / operator / value predicate.                                                                         |
| `isTransform`              | function | `(value: unknown) => value is Transform`                  | Determines whether a value is a `Transform` — one math step.                                                                                            |
| `isBounds`                 | function | `(value: unknown) => value is Bounds`                     | Determines whether a value is a `Bounds` — an inclusive numeric clamp.                                                                                  |
| `isFactorRange`            | function | `(value: unknown) => value is FactorRange`                | Determines whether a value is a `FactorRange` — one band of a range source.                                                                             |
| `isSource`                 | function | `(value: unknown) => value is FactorSource`               | Determines whether a value is a `FactorSource` — a static, field, lookup, or range factor source, discriminated by `origin`.                            |
| `isFactor`                 | function | `(value: unknown) => value is Factor`                     | Determines whether a value is a `Factor` — one scored input of a quantitative group.                                                                    |
| `isFactorGroup`            | function | `(value: unknown) => value is FactorGroup`                | Determines whether a value is a `FactorGroup` — a group of factors aggregated into one value.                                                           |
| `isExpression`             | function | `(value: unknown) => value is Expression`                 | Determines whether a value is an `Expression` — a boolean expression tree of atoms and compounds, discriminated by `form`.                              |
| `isRule`                   | function | `(value: unknown) => value is Rule`                       | Determines whether a value is a `Rule` — premises and a conclusion.                                                                                     |
| `isSymbolicExpression`     | function | `(value: unknown) => value is SymbolicExpression`         | Determines whether a value is a `SymbolicExpression` — an algebraic expression tree of variables, constants, and operations, discriminated by `form`.   |
| `isEquation`               | function | `(value: unknown) => value is Equation`                   | Determines whether a value is an `Equation` — `left = right`, solved for `target`.                                                                      |
| `isFact`                   | function | `(value: unknown) => value is Fact`                       | Determines whether a value is a `Fact` — a predicate over positional terms.                                                                             |
| `isInference`              | function | `(value: unknown) => value is Inference`                  | Determines whether a value is an `Inference` — premise patterns and a conclusion pattern.                                                               |
| `isQuantitativeDefinition` | function | `(value: unknown) => value is QuantitativeDefinition`     | Determines whether a value is a `QuantitativeDefinition`.                                                                                               |
| `isLogicalDefinition`      | function | `(value: unknown) => value is LogicalDefinition`          | Determines whether a value is a `LogicalDefinition`.                                                                                                    |
| `isSymbolicDefinition`     | function | `(value: unknown) => value is SymbolicDefinition`         | Determines whether a value is a `SymbolicDefinition`.                                                                                                   |
| `isInferentialDefinition`  | function | `(value: unknown) => value is InferentialDefinition`      | Determines whether a value is an `InferentialDefinition`.                                                                                               |
| `isDefinition`             | function | `(value: unknown) => value is Definition`                 | Determines whether a value is a `Definition` — a quantitative, logical, symbolic, or inferential definition shape, discriminated by `reasoning`.        |
| `isQuantitativeClearKey`   | const    | `Guard<QuantitativeClearKey>`                             | Determines whether a value is a `QuantitativeClearKey` — an optional field `clearQuantitativeDefinition` can delete.                                    |
| `isLogicalClearKey`        | const    | `Guard<LogicalClearKey>`                                  | Determines whether a value is a `LogicalClearKey` — an optional field `clearLogicalDefinition` can delete.                                              |
| `isSymbolicClearKey`       | const    | `Guard<SymbolicClearKey>`                                 | Determines whether a value is a `SymbolicClearKey` — an optional field `clearSymbolicDefinition` can delete.                                            |
| `isInferentialClearKey`    | const    | `Guard<InferentialClearKey>`                              | Determines whether a value is an `InferentialClearKey` — an optional field `clearInferentialDefinition` can delete.                                     |
| `isResultFact`             | function | `(value: unknown) => value is Fact`                       | Determines whether a value is a result-side `Fact`.                                                                                                     |
| `isCheckResult`            | function | `(value: unknown) => value is CheckResult`                | Determines whether a value is a `CheckResult`.                                                                                                          |
| `isFactorResult`           | function | `(value: unknown) => value is FactorResult`               | Determines whether a value is a `FactorResult`.                                                                                                         |
| `isGroupResult`            | function | `(value: unknown) => value is GroupResult`                | Determines whether a value is a `GroupResult`.                                                                                                          |
| `isRuleResult`             | function | `(value: unknown) => value is RuleResult`                 | Determines whether a value is a `RuleResult`.                                                                                                           |
| `isProofNode`              | function | `(value: unknown) => value is ProofNode`                  | Determines whether a value is a depth-bounded, acyclic `ProofNode` tree.                                                                                |
| `isQuantitativeResult`     | function | `(value: unknown) => value is QuantitativeResult`         | Determines whether a value is a `QuantitativeResult`.                                                                                                   |
| `isLogicalResult`          | function | `(value: unknown) => value is LogicalResult`              | Determines whether a value is a `LogicalResult`.                                                                                                        |
| `isSymbolicResult`         | function | `(value: unknown) => value is SymbolicResult`             | Determines whether a value is a `SymbolicResult`.                                                                                                       |
| `isInferentialResult`      | function | `(value: unknown) => value is InferentialResult`          | Determines whether a value is an `InferentialResult`.                                                                                                   |
| `isReasonResult`           | function | `(value: unknown) => value is ReasonResult`               | Determines whether a value is any `ReasonResult` arm.                                                                                                   |
| `isReasonValidationResult` | function | `(value: unknown) => value is ReasonValidationResult`     | Determines whether a value is a `ReasonValidationResult`.                                                                                               |
| `isDefinitionBuilder`      | function | `(value: unknown) => value is DefinitionBuilderInterface` | Determines whether a value is a `DefinitionBuilder` entity — the brand-guarded stateful workspace, not the plain `Definition` data union.               |
| `isSubjectBuilder`         | function | `(value: unknown) => value is SubjectBuilderInterface`    | Determines whether a value is a `SubjectBuilder` entity — the brand-guarded stateful workspace, not the plain `Subject` data record.                    |

### Shapes

The package's definitions and results as `ContractShape` values, compiled below and read by § Publishing definitions and results.

| Name                            | Kind     | Signature                           | Summary                                                                                       |
| ------------------------------- | -------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `createDefinitionShape`         | function | `() => ContractShape`               | Creates the shape of any `Definition`, discriminated by `reasoning`.                          |
| `createSymbolicDefinitionShape` | function | `() => ContractShape`               | Creates the shape of a `SymbolicDefinition`.                                                  |
| `createEquationShape`           | function | `() => ContractShape`               | Creates the shape of an `Equation` — `left = right`, solved for `target`.                     |
| `createLogicalDefinitionShape`  | function | `() => ContractShape`               | Creates the shape of a `LogicalDefinition`.                                                   |
| `createRuleShape`               | function | `() => ContractShape`               | Creates the shape of a `Rule` — premises and a conclusion.                                    |
| `resultShape`                   | const    | `ContractShape`                     | Describes any `ReasonResult` in its JSON projection, discriminated by `reasoning`.            |
| `inferentialResultShape`        | const    | `ContractShape`                     | Describes an `InferentialResult` in its JSON projection.                                      |
| `symbolicResultShape`           | const    | `ContractShape`                     | Describes a `SymbolicResult` in its JSON projection.                                          |
| `logicalResultShape`            | const    | `ContractShape`                     | Describes a `LogicalResult` in its JSON projection.                                           |
| `quantitativeResultShape`       | const    | `ContractShape`                     | Describes a `QuantitativeResult` in its JSON projection, where a non-finite number is `null`. |
| `ruleResultShape`               | const    | `ContractShape`                     | Describes a `RuleResult` in its JSON projection.                                              |
| `groupResultShape`              | const    | `ContractShape`                     | Describes a `GroupResult` in its JSON projection, where a non-finite number is `null`.        |
| `factorResultShape`             | const    | `ContractShape`                     | Describes a `FactorResult` in its JSON projection, where a non-finite number is `null`.       |
| `checkResultShape`              | const    | `ContractShape`                     | Describes a `CheckResult` in its JSON projection.                                             |
| `inferentialDefinitionShape`    | const    | `ContractShape`                     | Describes an `InferentialDefinition`.                                                         |
| `inferenceShape`                | const    | `ContractShape`                     | Describes an `Inference` — premise patterns and a conclusion pattern.                         |
| `factShape`                     | const    | `ContractShape`                     | Describes a `Fact` — a predicate over positional terms.                                       |
| `createSymbolicExpressionShape` | function | `(depth?: number) => ContractShape` | Creates the shape of a `SymbolicExpression` nesting at most `depth` operations.               |
| `createExpressionShape`         | function | `(depth?: number) => ContractShape` | Creates the shape of an `Expression` nesting at most `depth` connectives.                     |
| `quantitativeDefinitionShape`   | const    | `ContractShape`                     | Describes a `QuantitativeDefinition`.                                                         |
| `factorGroupShape`              | const    | `ContractShape`                     | Describes a `FactorGroup` — a group of factors aggregated into one value.                     |
| `factorShape`                   | const    | `ContractShape`                     | Describes a `Factor` — one scored input of a quantitative group.                              |
| `factorSourceShape`             | const    | `ContractShape`                     | Describes a `FactorSource` — a static, field, lookup, or range source.                        |
| `factorRangeShape`              | const    | `ContractShape`                     | Describes a `FactorRange` — one band of a range source.                                       |
| `boundsShape`                   | const    | `ContractShape`                     | Describes a `Bounds` — an inclusive numeric clamp.                                            |
| `transformShape`                | const    | `ContractShape`                     | Describes a `Transform` — one math step.                                                      |
| `checkShape`                    | const    | `ContractShape`                     | Describes a `Check` — one field predicate, its expected value any JSON value.                 |
| `fieldPathShape`                | const    | `ContractShape`                     | Describes a `FieldPath` — one key, or the keys descending into nested objects.                |

### Contracts

The compiled contracts of what is flat enough to compile at import, each carrying its JSON Schema. The recursive definition contracts are in § Entity factories.

| Name                             | Kind  | Signature                    | Summary                                                                                     |
| -------------------------------- | ----- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `inferentialResultContract`      | const | `ContractInterface<unknown>` | Publishes an `InferentialResult`'s JSON projection as a contract.                           |
| `symbolicResultContract`         | const | `ContractInterface<unknown>` | Publishes a `SymbolicResult`'s JSON projection as a contract.                               |
| `logicalResultContract`          | const | `ContractInterface<unknown>` | Publishes a `LogicalResult`'s JSON projection as a contract.                                |
| `quantitativeResultContract`     | const | `ContractInterface<unknown>` | Publishes a `QuantitativeResult`'s JSON projection as a contract.                           |
| `resultContract`                 | const | `ContractInterface<unknown>` | Publishes any `ReasonResult`'s JSON projection as a contract, read through `projectResult`. |
| `inferentialDefinitionContract`  | const | `ContractInterface<unknown>` | Publishes an `InferentialDefinition` as a contract. Cross it on `is`.                       |
| `quantitativeDefinitionContract` | const | `ContractInterface<unknown>` | Publishes a `QuantitativeDefinition` as a contract. Cross it on `is`.                       |

### Errors

| Name            | Kind     | Signature                                                                                                  | Summary                                             |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `ReasonError`   | class    | `new (code: ReasonErrorCode, message: string, context?: Readonly<Record<string, unknown>>) => ReasonError` | Represents an error thrown by the reasons layer.    |
| `isReasonError` | function | `(value: unknown) => value is ReasonError`                                                                 | Narrows an unknown caught value to a `ReasonError`. |

`ReasonError` carries an own non-enumerable, non-writable, self-valued brand under `Symbol.for('@orkestrel/reason.ReasonError')`. Its guard accepts errors from another installed copy and subclasses regardless of `name`. It requires an instance of the global `Error` with a prototype other than `Error.prototype`, the own brand, a declared `code`, and valid members. It rejects unbranded look-alikes, transparent proxies, and plain objects carrying only the brand. Hostile reads return false.

### Constants

| Name                       | Kind  | Signature                                                                                                                                     | Summary                                                                                                                                                                            |
| -------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROJECTION_NODE_LIMIT`    | const | `10000`                                                                                                                                       | Holds how many objects and arrays one JSON projection walks before it drops the rest, so a value sharing its sub-objects cannot unfold without end.                                |
| `SYMBOLIC_SHAPE_DEPTH`     | const | `4`                                                                                                                                           | Holds how many operations the published `SymbolicExpression` shape may nest.                                                                                                       |
| `EXPRESSION_SHAPE_DEPTH`   | const | `8`                                                                                                                                           | Holds how many connectives the published `Expression` shape may nest.                                                                                                              |
| `LOGICAL_OPERATORS`        | const | `readonly ['and', 'or', 'not', 'implies', 'xor']`                                                                                             | Lists the connectives of a compound expression.                                                                                                                                    |
| `COMPARISONS`              | const | `readonly ['equals', 'not', 'above', 'below', 'from', 'to', 'any', 'none', 'between', 'outside']`                                             | Lists the comparisons a check applies.                                                                                                                                             |
| `AGGREGATIONS`             | const | `readonly ['sum', 'product', 'average', 'minimum', 'maximum']`                                                                                | Lists how an aggregator reduces a list of numbers to one.                                                                                                                          |
| `MATH_OPERATIONS`          | const | `readonly ['add', 'subtract', 'multiply', 'divide', 'percentage', 'minimum', 'maximum', 'average', 'power', 'round', 'ceil', 'floor', 'abs']` | Lists the math operations a transform or a symbolic operation applies.                                                                                                             |
| `CHAIN_STRATEGIES`         | const | `readonly ['forward', 'backward']`                                                                                                            | Lists how a chaining reasoner walks its rules.                                                                                                                                     |
| `REASONINGS`               | const | `readonly ['quantitative', 'logical', 'symbolic', 'inferential']`                                                                             | Lists the reasoning strategies.                                                                                                                                                    |
| `CHECK_STATES`             | const | `readonly ['met', 'unmet', 'unread']`                                                                                                         | Lists the states a check, a rule, and a conclusion settle on.                                                                                                                      |
| `DEFAULT_REASON_BAIL`      | const | `true`                                                                                                                                        | Holds the default `bail` for the `Reason` orchestrator — a reasoner throw is rethrown after the `error` emit. Default: `true`.                                                     |
| `DEFAULT_VALIDATE`         | const | `true`                                                                                                                                        | Holds the default `validate` for the `Reason` orchestrator — a definition is validated before it first runs, and remembered by identity. Default: `true`.                          |
| `DEFAULT_DEPTH`            | const | `10`                                                                                                                                          | Holds the default `depth` for chaining definitions — the forward-iteration / backward-recursion cap of the logical and inferential reasoners. Default: `10`.                       |
| `DEFAULT_BASE`             | const | `0`                                                                                                                                           | Holds the default `base` added before aggregation, at both group and definition level. Default: `0`.                                                                               |
| `DEFAULT_PRECISION`        | const | `4`                                                                                                                                           | Holds the default `precision` (decimal places) for quantitative values and symbolic solutions. Default: `4`.                                                                       |
| `DEFAULT_CONFIDENCE`       | const | `1`                                                                                                                                           | Holds the default `confidence` for facts, inferences, and injected subject facts. Default: `1`.                                                                                    |
| `DEFAULT_WEIGHT`           | const | `1`                                                                                                                                           | Holds the default factor `weight` at group aggregation. Default: `1`.                                                                                                              |
| `DEFAULT_PRIORITY`         | const | `0`                                                                                                                                           | Holds the default factor / rule `priority` — evaluation order is ascending and stable. Default: `0`.                                                                               |
| `CONFIDENCE_PRECISION`     | const | `4`                                                                                                                                           | Holds the decimal places a derived fact's confidence is rounded to during forward inferential chaining.                                                                            |
| `INVERTIBLE_OPERATIONS`    | const | `ReadonlySet<MathOperation>`                                                                                                                  | Lists the math operations the symbolic reasoner can invert while isolating a target variable — anything else (a `power`, an `abs`) fails the equation with a non-invertible error. |
| `EVALUATOR_ID`             | const | `"evaluator"`                                                                                                                                 | Names the default `id` for an `Evaluator`.                                                                                                                                         |
| `TRANSFORMER_ID`           | const | `"transformer"`                                                                                                                               | Names the default `id` for a `Transformer`.                                                                                                                                        |
| `AGGREGATOR_ID`            | const | `"aggregator"`                                                                                                                                | Names the default `id` for an `Aggregator`.                                                                                                                                        |
| `QUANTITATIVE_ID`          | const | `"quantitative"`                                                                                                                              | Names the default `id` for a `QuantitativeReasoner`.                                                                                                                               |
| `LOGICAL_ID`               | const | `"logical"`                                                                                                                                   | Names the default `id` for a `LogicalReasoner`.                                                                                                                                    |
| `SYMBOLIC_ID`              | const | `"symbolic"`                                                                                                                                  | Names the default `id` for a `SymbolicReasoner`.                                                                                                                                   |
| `INFERENTIAL_ID`           | const | `"inferential"`                                                                                                                               | Names the default `id` for an `InferentialReasoner`.                                                                                                                               |
| `DEFINITION_BUILDER_BRAND` | const | `unique symbol`                                                                                                                               | Holds the `DefinitionBuilder` entity brand — a `unique symbol` key carrying `readonly true` on every `DefinitionBuilderInterface` instance.                                        |
| `SUBJECT_BUILDER_BRAND`    | const | `unique symbol`                                                                                                                               | Holds the `SubjectBuilder` entity brand — a `unique symbol` key carrying `readonly true` on every `SubjectBuilderInterface` instance.                                              |

### Types

| Name                          | Kind      | Signature                                                                                                                                                                                                      | Summary                                                                                                                                                                                                                                               |
| ----------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ShapeScan`                   | interface | `{ errors, warnings }`                                                                                                                                                                                         | Represents what scanning a definition's shape against its reads found.                                                                                                                                                                                |
| `ShapeRead`                   | interface | `{ declared, shape? }`                                                                                                                                                                                         | Represents what a shape says about one field path.                                                                                                                                                                                                    |
| `SubjectDoorInterface`        | interface | `{ admit() }`                                                                                                                                                                                                  | Declares the door a subject passes before a reasoner reads it.                                                                                                                                                                                        |
| `SubjectAdmission`            | interface | `{ subject?, faults, repairs, defaulted, errors }`                                                                                                                                                             | Represents what the `SubjectDoorInterface` made of one subject.                                                                                                                                                                                       |
| `SourceResult`                | interface | `{ value?, fallback }`                                                                                                                                                                                         | Represents what resolving a `FactorSource` found.                                                                                                                                                                                                     |
| `PolarRead`                   | interface | `{ key, negated }`                                                                                                                                                                                             | Represents one key an expression reads, with whether that read sits under an odd number of negations.                                                                                                                                                 |
| `CheckState`                  | type      | `'met' \| 'unmet' \| 'unread'`                                                                                                                                                                                 | Names what a `Check`, a `RuleResult`, or a `LogicalResult` settled on.                                                                                                                                                                                |
| `Reasoning`                   | type      | `'quantitative' \| 'logical' \| 'symbolic' \| 'inferential'`                                                                                                                                                   | Names the reasoning strategies — the axis a `Definition` and a `ReasonResult` discriminate on.                                                                                                                                                        |
| `ChainStrategy`               | type      | `'forward' \| 'backward'`                                                                                                                                                                                      | Names how a chaining reasoner walks its rules: `forward` (data-driven fixpoint) or `backward` (goal-driven proving).                                                                                                                                  |
| `MathOperation`               | type      | `'add' \| 'subtract' \| 'multiply' \| 'divide' \| 'percentage' \| 'minimum' \| 'maximum' \| 'average' \| 'power' \| 'round' \| 'ceil' \| 'floor' \| 'abs'`                                                     | Names a math operation applied by the `TransformerInterface` and inside `SymbolicExpression` trees.                                                                                                                                                   |
| `Aggregation`                 | type      | `'sum' \| 'product' \| 'average' \| 'minimum' \| 'maximum'`                                                                                                                                                    | Names how the `AggregatorInterface` reduces a list of numbers to one.                                                                                                                                                                                 |
| `Comparison`                  | type      | `'equals' \| 'not' \| 'above' \| 'below' \| 'from' \| 'to' \| 'any' \| 'none' \| 'between' \| 'outside'`                                                                                                       | Names the comparison a `Check` applies between a resolved subject field and its expected value.                                                                                                                                                       |
| `LogicalOperator`             | type      | `'and' \| 'or' \| 'not' \| 'implies' \| 'xor'`                                                                                                                                                                 | Names a logical connective inside a compound `Expression`.                                                                                                                                                                                            |
| `Subject`                     | type      | `Readonly<Record<string, unknown>>`                                                                                                                                                                            | Represents the data record being reasoned about — a plain readonly bag of fields, read by `FieldPath`.                                                                                                                                                |
| `Check`                       | interface | `{ field, operator, value }`                                                                                                                                                                                   | Represents a single field predicate: resolves `field` from the subject and compares it to `value` with `operator`.                                                                                                                                    |
| `CheckResult`                 | interface | `{ field, state, actual, error? }`                                                                                                                                                                             | Represents the outcome of one `Check` evaluation.                                                                                                                                                                                                     |
| `Transform`                   | interface | `{ operation, operand? }`                                                                                                                                                                                      | Represents one math step applied to a number by the `TransformerInterface`.                                                                                                                                                                           |
| `Bounds`                      | interface | `{ minimum?, maximum? }`                                                                                                                                                                                       | Represents an inclusive numeric clamp — either side may be absent (unbounded).                                                                                                                                                                        |
| `StaticSource`                | interface | `{ origin, value }`                                                                                                                                                                                            | Represents a factor source yielding a fixed number.                                                                                                                                                                                                   |
| `FieldSource`                 | interface | `{ origin, field }`                                                                                                                                                                                            | Represents a factor source reading a subject field as a number.                                                                                                                                                                                       |
| `LookupSource`                | interface | `{ origin, field, table }`                                                                                                                                                                                     | Represents a factor source mapping a subject field through a lookup table.                                                                                                                                                                            |
| `RangeSource`                 | interface | `{ origin, field, ranges }`                                                                                                                                                                                    | Represents a factor source banding a numeric subject field through ordered ranges.                                                                                                                                                                    |
| `FactorSource`                | type      | `StaticSource \| FieldSource \| LookupSource \| RangeSource`                                                                                                                                                   | Represents a static, field, lookup, or range factor source, discriminated by `origin`.                                                                                                                                                                |
| `FactorRange`                 | interface | `{ bounds?, value }`                                                                                                                                                                                           | Represents one band of a `RangeSource` — an optional inclusive bounds test and the value it yields.                                                                                                                                                   |
| `Factor`                      | interface | `{ id, name, description?, source, fallback?, checks?, transforms?, bounds?, weight?, priority?, enabled?, required? }`                                                                                        | Represents one scored input of a quantitative group.                                                                                                                                                                                                  |
| `FactorGroup`                 | interface | `{ id, name, description?, factors, aggregation, base?, bounds?, enabled?, strict? }`                                                                                                                          | Represents a group of factors aggregated into one value.                                                                                                                                                                                              |
| `QuantitativeDefinition`      | interface | `{ reasoning, id, name, description?, groups, aggregation, base?, bounds?, precision?, shape? }`                                                                                                               | Defines factor-based numeric scoring.                                                                                                                                                                                                                 |
| `Atom`                        | interface | `{ form, check }`                                                                                                                                                                                              | Represents a leaf boolean expression — one `Check` against the subject.                                                                                                                                                                               |
| `Compound`                    | interface | `{ form, operator, operands }`                                                                                                                                                                                 | Represents a compound boolean expression — a `LogicalOperator` over nested operands.                                                                                                                                                                  |
| `Expression`                  | type      | `Atom \| Compound`                                                                                                                                                                                             | Represents a boolean expression tree, discriminated by `form`.                                                                                                                                                                                        |
| `Rule`                        | interface | `{ id, name, description?, premises, conclusion, priority?, enabled? }`                                                                                                                                        | Represents one deduction rule: when every premise holds, the `conclusion`'s atoms are asserted as derived facts.                                                                                                                                      |
| `LogicalDefinition`           | interface | `{ reasoning, id, name, description?, rules, strategy, depth?, shape? }`                                                                                                                                       | Defines rule-based deduction.                                                                                                                                                                                                                         |
| `Variable`                    | interface | `{ form, name }`                                                                                                                                                                                               | Represents a symbolic expression leaf naming a variable.                                                                                                                                                                                              |
| `Constant`                    | interface | `{ form, value }`                                                                                                                                                                                              | Represents a symbolic expression leaf holding a fixed number.                                                                                                                                                                                         |
| `Operation`                   | interface | `{ form, operator, left, right? }`                                                                                                                                                                             | Represents a symbolic operation node.                                                                                                                                                                                                                 |
| `SymbolicExpression`          | type      | `Variable \| Constant \| Operation`                                                                                                                                                                            | Represents an algebraic expression tree, discriminated by `form`.                                                                                                                                                                                     |
| `Equation`                    | interface | `{ id, name, description?, left, right, target }`                                                                                                                                                              | Represents one equation `left = right`, solved for the `target` variable.                                                                                                                                                                             |
| `SymbolicDefinition`          | interface | `{ reasoning, id, name, description?, equations, variables, precision?, shape? }`                                                                                                                              | Defines equation-solving.                                                                                                                                                                                                                             |
| `Fact`                        | interface | `{ id, predicate, terms, confidence? }`                                                                                                                                                                        | Represents one fact: a `predicate` over positional `terms`.                                                                                                                                                                                           |
| `Inference`                   | interface | `{ id, name, description?, premises, conclusion, confidence?, enabled? }`                                                                                                                                      | Represents one inference rule: when every premise pattern unifies against known facts (with consistent variable bindings), the instantiated `conclusion` is derived.                                                                                  |
| `InferentialDefinition`       | interface | `{ reasoning, id, name, description?, inferences, facts, strategy, depth?, shape? }`                                                                                                                           | Defines fact-derivation.                                                                                                                                                                                                                              |
| `Definition`                  | type      | `QuantitativeDefinition \| LogicalDefinition \| SymbolicDefinition \| InferentialDefinition`                                                                                                                   | Represents any reasoning definition, discriminated by `reasoning`.                                                                                                                                                                                    |
| `DefinitionEnvelope`          | type      | `Omit<QuantitativeDefinition, 'groups'> \| Omit<LogicalDefinition, 'rules'> \| Omit<SymbolicDefinition, 'equations' \| 'variables'> \| Omit<InferentialDefinition, 'facts' \| 'inferences'>`                   | Represents the scalar-only projection of each definition kind — the `DefinitionBuilderInterface` implementation's private envelope holds the non-collection fields; `build()` re-composes the kind's collections from the managers' plural accessors. |
| `QuantitativeClearKey`        | type      | `'description' \| 'base' \| 'bounds' \| 'precision' \| 'shape'`                                                                                                                                                | Names the optional `QuantitativeDefinition` fields `clearQuantitativeDefinition` (and a quantitative `DefinitionBuilderInterface`'s `clear`) can delete.                                                                                              |
| `LogicalClearKey`             | type      | `'description' \| 'depth' \| 'shape'`                                                                                                                                                                          | Names the optional `LogicalDefinition` fields `clearLogicalDefinition` (and a logical `DefinitionBuilderInterface`'s `clear`) can delete.                                                                                                             |
| `SymbolicClearKey`            | type      | `'description' \| 'precision' \| 'shape'`                                                                                                                                                                      | Names the optional `SymbolicDefinition` fields `clearSymbolicDefinition` (and a symbolic `DefinitionBuilderInterface`'s `clear`) can delete.                                                                                                          |
| `InferentialClearKey`         | type      | `'description' \| 'depth' \| 'shape'`                                                                                                                                                                          | Names the optional `InferentialDefinition` fields `clearInferentialDefinition` (and an inferential `DefinitionBuilderInterface`'s `clear`) can delete.                                                                                                |
| `InferentialChainResult`      | interface | `{ derived, proof? }`                                                                                                                                                                                          | Represents one chaining pass of the `InferentialReasoner` — the facts the pass derived plus the proof tree, when the pass produced one.                                                                                                               |
| `FactorResult`                | interface | `{ id, applied, value, raw?, checks? }`                                                                                                                                                                        | Represents one factor's evaluation outcome.                                                                                                                                                                                                           |
| `GroupResult`                 | interface | `{ id, applied, value, factors }`                                                                                                                                                                              | Represents one group's evaluation outcome — its clamped value and the per-factor results (disabled factors omitted entirely).                                                                                                                         |
| `QuantitativeResult`          | interface | `{ reasoning, value, groups, count, success, trace, errors, faults, repairs, defaulted }`                                                                                                                      | Represents the outcome of quantitative reasoning.                                                                                                                                                                                                     |
| `RuleResult`                  | interface | `{ id, state, premises, checks }`                                                                                                                                                                              | Represents one rule's evaluation outcome.                                                                                                                                                                                                             |
| `LogicalResult`               | interface | `{ reasoning, conclusion, rules, count, success, trace, errors, faults, repairs, defaulted }`                                                                                                                  | Represents the outcome of logical reasoning.                                                                                                                                                                                                          |
| `SymbolicResult`              | interface | `{ reasoning, solutions, success, trace, errors, faults, repairs, defaulted }`                                                                                                                                 | Represents the outcome of symbolic reasoning — final bindings keyed by each equation's `target` (a failed equation's target still appears when bound elsewhere).                                                                                      |
| `ProofNode`                   | interface | `{ fact, inference?, children?, depth }`                                                                                                                                                                       | Represents one node of a backward-chaining proof tree.                                                                                                                                                                                                |
| `InferentialResult`           | interface | `{ reasoning, derived, proof?, success, trace, errors, faults, repairs, defaulted }`                                                                                                                           | Represents the outcome of inferential reasoning.                                                                                                                                                                                                      |
| `ReasonResult`                | type      | `QuantitativeResult \| LogicalResult \| SymbolicResult \| InferentialResult`                                                                                                                                   | Represents any reasoning result, discriminated by `reasoning`.                                                                                                                                                                                        |
| `ReasonValidationResult`      | interface | `{ valid, errors, warnings }`                                                                                                                                                                                  | Represents the outcome of validating a definition — hard `errors` (definition unusable) and soft `warnings` (suspicious but runnable). `valid` is `true` exactly when `errors` is empty.                                                              |
| `EvaluatorOptions`            | interface | `{ id? }`                                                                                                                                                                                                      | Configures `createEvaluator` / the `Evaluator` constructor.                                                                                                                                                                                           |
| `TransformerOptions`          | interface | `{ id? }`                                                                                                                                                                                                      | Configures `createTransformer` / the `Transformer` constructor.                                                                                                                                                                                       |
| `AggregatorOptions`           | interface | `{ id? }`                                                                                                                                                                                                      | Configures `createAggregator` / the `Aggregator` constructor.                                                                                                                                                                                         |
| `QuantitativeReasonerOptions` | interface | `{ id?, evaluator?, transformer?, aggregator? }`                                                                                                                                                               | Configures `createQuantitativeReasoner` / the `QuantitativeReasoner` constructor.                                                                                                                                                                     |
| `LogicalReasonerOptions`      | interface | `{ id?, evaluator? }`                                                                                                                                                                                          | Configures `createLogicalReasoner` / the `LogicalReasoner` constructor.                                                                                                                                                                               |
| `SymbolicReasonerOptions`     | interface | `{ id? }`                                                                                                                                                                                                      | Configures `createSymbolicReasoner` / the `SymbolicReasoner` constructor.                                                                                                                                                                             |
| `InferentialReasonerOptions`  | interface | `{ id? }`                                                                                                                                                                                                      | Configures `createInferentialReasoner` / the `InferentialReasoner` constructor.                                                                                                                                                                       |
| `EvaluatorInterface`          | interface | `{ id, evaluate(), batch() }`                                                                                                                                                                                  | Evaluates `Check`s against subjects.                                                                                                                                                                                                                  |
| `TransformerInterface`        | interface | `{ id, apply(), chain() }`                                                                                                                                                                                     | Applies math `Transform`s to numbers.                                                                                                                                                                                                                 |
| `AggregatorInterface`         | interface | `{ id, aggregate() }`                                                                                                                                                                                          | Reduces number lists to one number per `Aggregation`.                                                                                                                                                                                                 |
| `ReasonerInterface`           | interface | `{ id, reasoning, supports(), validate(), reason() }`                                                                                                                                                          | Declares a reasoning strategy adapter — one per `Reasoning`.                                                                                                                                                                                          |
| `ReasonErrorCode`             | type      | `'MISSING' \| 'INVALID' \| 'MISMATCH' \| 'DESTROYED' \| 'TARGET' \| 'OPERATOR'`                                                                                                                                | Names a machine-readable `ReasonError` code.                                                                                                                                                                                                          |
| `ReasonEventMap`              | type      | `{ readonly register: readonly [reasoning: Reasoning]; readonly reason: readonly [result: ReasonResult]; readonly error: readonly [error: unknown]; readonly destroy: readonly []; }`                          | Represents the push observation surface of a `ReasonInterface`.                                                                                                                                                                                       |
| `ReasonOptions`               | interface | `{ reasoners?, bail?, validate?, on?, error? }`                                                                                                                                                                | Configures `createReason` / the `Reason` constructor.                                                                                                                                                                                                 |
| `ReasonInterface`             | interface | `{ emitter, reason(), register(), reasoner(), reasoners(), supports(), validate(), destroy() }`                                                                                                                | Declares the reasoning orchestrator — a thin router over registered `ReasonerInterface`s.                                                                                                                                                             |
| `GroupManagerInterface`       | interface | `{ emitter, group(), groups(), append(), prepend(), replace(), remove(), seat(), destroy() }`                                                                                                                  | Declares the `DefinitionBuilderInterface` manager over a quantitative definition's `groups` — a self-owning, kind-free collection manager.                                                                                                            |
| `GroupManagerEventMap`        | type      | `{ readonly append: readonly [id: string]; readonly prepend: readonly [id: string]; readonly replace: readonly [id: string]; readonly remove: readonly [id: string]; readonly destroy: readonly []; }`         | Represents the push observation surface of a `GroupManagerInterface`.                                                                                                                                                                                 |
| `GroupManagerOptions`         | interface | `{ groups?, on?, error? }`                                                                                                                                                                                     | Configures `createGroupManager` / the `GroupManager` constructor.                                                                                                                                                                                     |
| `FactorManagerInterface`      | interface | `{ emitter, factor(), factors(), append(), prepend(), replace(), remove(), destroy() }`                                                                                                                        | Declares the `DefinitionBuilderInterface` manager over a `FactorGroup`'s `factors`, threaded through the required `groupId` locator (a factor lives inside its group).                                                                                |
| `FactorManagerEventMap`       | type      | `{ readonly append: readonly [id: string]; readonly prepend: readonly [id: string]; readonly replace: readonly [id: string]; readonly remove: readonly [id: string]; readonly destroy: readonly []; }`         | Represents the push observation surface of a `FactorManagerInterface`.                                                                                                                                                                                |
| `FactorManagerOptions`        | interface | `{ on?, error? }`                                                                                                                                                                                              | Configures `createFactorManager` / the `FactorManager` constructor.                                                                                                                                                                                   |
| `RuleManagerInterface`        | interface | `{ emitter, rule(), rules(), append(), prepend(), replace(), remove(), seat(), destroy() }`                                                                                                                    | Declares the `DefinitionBuilderInterface` manager over a logical definition's `rules` — a self-owning, kind-free collection manager.                                                                                                                  |
| `RuleManagerEventMap`         | type      | `{ readonly append: readonly [id: string]; readonly prepend: readonly [id: string]; readonly replace: readonly [id: string]; readonly remove: readonly [id: string]; readonly destroy: readonly []; }`         | Represents the push observation surface of a `RuleManagerInterface`.                                                                                                                                                                                  |
| `RuleManagerOptions`          | interface | `{ rules?, on?, error? }`                                                                                                                                                                                      | Configures `createRuleManager` / the `RuleManager` constructor.                                                                                                                                                                                       |
| `EquationManagerInterface`    | interface | `{ emitter, equation(), equations(), append(), prepend(), replace(), remove(), seat(), destroy() }`                                                                                                            | Declares the `DefinitionBuilderInterface` manager over a symbolic definition's `equations` — a self-owning, kind-free collection manager.                                                                                                             |
| `EquationManagerEventMap`     | type      | `{ readonly append: readonly [id: string]; readonly prepend: readonly [id: string]; readonly replace: readonly [id: string]; readonly remove: readonly [id: string]; readonly destroy: readonly []; }`         | Represents the push observation surface of an `EquationManagerInterface`.                                                                                                                                                                             |
| `EquationManagerOptions`      | interface | `{ equations?, on?, error? }`                                                                                                                                                                                  | Configures `createEquationManager` / the `EquationManager` constructor.                                                                                                                                                                               |
| `FactManagerInterface`        | interface | `{ emitter, fact(), facts(), append(), prepend(), replace(), remove(), seat(), destroy() }`                                                                                                                    | Declares the `DefinitionBuilderInterface` manager over an inferential definition's `facts` — a self-owning, kind-free collection manager.                                                                                                             |
| `FactManagerEventMap`         | type      | `{ readonly append: readonly [id: string]; readonly prepend: readonly [id: string]; readonly replace: readonly [id: string]; readonly remove: readonly [id: string]; readonly destroy: readonly []; }`         | Represents the push observation surface of a `FactManagerInterface`.                                                                                                                                                                                  |
| `FactManagerOptions`          | interface | `{ facts?, on?, error? }`                                                                                                                                                                                      | Configures `createFactManager` / the `FactManager` constructor.                                                                                                                                                                                       |
| `InferenceManagerInterface`   | interface | `{ emitter, inference(), inferences(), append(), prepend(), replace(), remove(), seat(), destroy() }`                                                                                                          | Declares the `DefinitionBuilderInterface` manager over an inferential definition's `inferences` — a self-owning, kind-free collection manager.                                                                                                        |
| `InferenceManagerEventMap`    | type      | `{ readonly append: readonly [id: string]; readonly prepend: readonly [id: string]; readonly replace: readonly [id: string]; readonly remove: readonly [id: string]; readonly destroy: readonly []; }`         | Represents the push observation surface of an `InferenceManagerInterface`.                                                                                                                                                                            |
| `InferenceManagerOptions`     | interface | `{ inferences?, on?, error? }`                                                                                                                                                                                 | Configures `createInferenceManager` / the `InferenceManager` constructor.                                                                                                                                                                             |
| `VariableManagerInterface`    | interface | `{ emitter, variable(), variables(), add(), remove(), seat(), destroy() }`                                                                                                                                     | Declares the `DefinitionBuilderInterface` manager over a symbolic definition's `variables` — a name-keyed unordered record, so `add` / `remove` are the only write verbs (no placement). A self-owning, kind-free manager.                            |
| `VariableManagerEventMap`     | type      | `{ readonly add: readonly [name: string]; readonly remove: readonly [name: string]; readonly destroy: readonly []; }`                                                                                          | Represents the push observation surface of a `VariableManagerInterface`.                                                                                                                                                                              |
| `VariableManagerOptions`      | interface | `{ variables?, on?, error? }`                                                                                                                                                                                  | Configures `createVariableManager` / the `VariableManager` constructor.                                                                                                                                                                               |
| `DefinitionBuilderEventMap`   | type      | `{ readonly merge: readonly [reasoning: Reasoning]; readonly clear: readonly [key: string]; readonly destroy: readonly []; }`                                                                                  | Represents the push observation surface of a `DefinitionBuilderInterface` — the builder-level lifecycle events; per-element mutation events live on the individual managers' own emitters.                                                            |
| `DefinitionBuilderInterface`  | interface | `{ [DEFINITION_BUILDER_BRAND], id, reasoning, emitter, groups, factors, rules, equations, variables, facts, inferences, build(), merge(), clear(), destroy() }`                                                | Declares a stateful workspace builder accumulating a `Definition` through always-present self-owning manager properties: a private scalar envelope plus one manager per collection.                                                                   |
| `DefinitionBuilderOptions`    | interface | `{ id?, groups?, factors?, rules?, equations?, variables?, facts?, inferences?, on?, error? }`                                                                                                                 | Configures `createDefinitionBuilder` / the `DefinitionBuilder` constructor.                                                                                                                                                                           |
| `SubjectBuilderEventMap`      | type      | `{ readonly set: readonly [key: string, value: unknown]; readonly remove: readonly [key: string]; readonly merge: readonly [incoming: Subject]; readonly clear: readonly []; readonly destroy: readonly []; }` | Represents the push observation surface of a `SubjectBuilderInterface` — the verb-named `set`, `remove`, `merge`, `clear`, and `destroy` events, no generic `change` / `status`.                                                                      |
| `SubjectBuilderInterface`     | interface | `{ [SUBJECT_BUILDER_BRAND], id, emitter, field(), fields(), set(), remove(), merge(), clear(), repeat(), build(), destroy() }`                                                                                 | Declares a stateful workspace builder accumulating a `Subject` — one flat key-value collection, no managers.                                                                                                                                          |
| `SubjectBuilderOptions`       | interface | `{ id?, on?, error? }`                                                                                                                                                                                         | Configures `createSubjectBuilder` / the `SubjectBuilder` constructor.                                                                                                                                                                                 |

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

#### `SubjectDoorInterface`

| Method  | Returns            | Summary                                                                                     |
| ------- | ------------------ | ------------------------------------------------------------------------------------------- |
| `admit` | `SubjectAdmission` | Admits a subject through a shape, or refuses it and says why; no shape admits it unchanged. |

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
2. **Deterministic, synchronous, immutable.** Same subject + same definition → the same result, every time — no clocks, no randomness, no I/O, nothing async. No input is ever mutated; every result (and every builder output) is a fresh object. A result always carries `success`, a `trace` narrating each step, the accumulated `errors`, and the `faults`, `repairs`, and `defaulted` channel — `success` is exactly `errors.length === 0`, and an error does not abort the run (the value / solutions are still computed from whatever applied), it makes `success` false. Expression evaluation and symbolic isolation recurse with the input expression's own depth, so a pathologically deep hand-built expression (on the order of `10,000` levels of nesting) is outside the supported contract and may exhaust the call stack; `extractAtoms` and `containsVariable` are the exception — both walk iteratively and stay total at any depth. The workspace builders (and their managers) are the deliberate stateful exception to statelessness, not to immutability: they mutate nothing they are given (the seed is spread on construction, every mutation is copy-on-write through the pure helper family), and `build()` returns a fresh payload deterministically derived from the current state, every call — handed to `reason` by the caller, never built inside the engine.
3. **Dispatch and `bail`.** The orchestrator is a thin router: registry lookup by `definition.reasoning`, one reasoner per reasoning, re-registration replaces. A registry miss throws `MISSING` and a pre-run validation failure (the `validate` option is on by default) throws `INVALID` — both are caller misuse, bypass `bail`, and emit nothing. A reasoner throw always emits `error` with the raw thrown value; under `bail: true` (the default) it is rethrown, under `bail: false` it becomes an empty type-shaped failure result. Only successful results emit `reason`. The batch overload maps subjects in order. A valid definition is remembered by identity, so one definition validates once per orchestrator.
4. **Failure results, not throws, inside a reasoner.** A reasoner's single throw is `MISMATCH` (handed a definition of a different reasoning); every structural malformation — missing / non-array `groups` / `rules` / `equations` / `facts` — yields a failure result, because the runtime never assumes `validate` ran. The operators are total the same way: an unknown `Comparison` surfaces as `CheckResult.error` (`state: 'unread'`), an unknown `MathOperation` and divide-by-zero are `NaN`, weights of another length, a zero total weight, and an unknown `Aggregation` are `NaN`, and the `Aggregator` has fixed empty-input identities (`sum` / `average` → `0`, `product` → `1`, `minimum` / `maximum` → `NaN`). Definition arrays (`facts` / `inferences` / `rules` / `equations` / `groups` / `factors`) are iterated defensively — an array hole, `null`, or other ill-typed junk entry never crashes evaluation and never passes unnoticed: it is named in `errors`, and the run refuses.
5. **Guard totality and exactness.** Every validator is a total `Guard` — adversarial input (cycles, depth, hostile prototypes) returns `false`, never throws. Caller-supplied input records are exact and their numeric fields require `isFiniteNumber` because definitions must survive JSON. result guards accept open objects, including class instances, and guard published numeric members with `isNumber`, including `NaN` and infinities. Nested result members follow the same posture; `isInferentialResult` checks `derived` with the open `isResultFact` guard. The recursive input shapes enter through `lazyOf`; `isProofNode` uses a bounded iterative traversal. Builders omit absent optional input keys so their outputs round-trip the input guards. A numeric subject read takes a finite number and nothing else — a numeric string and `NaN` / `±Infinity` subject values read `unread`, never the non-finite error path (still reachable through static sources and transform / inversion results). § Reading what is there states each rule. The only coercion is the door's, which reports it (§ The subject door).
6. **Observation is a pure side-channel.** The `Reason` owns a typed `emitter` (`ReasonEventMap` — `register(reasoning)` / `reason(result)` / `error(error)` / `destroy()`); each manager owns its own (`{X}ManagerEventMap` — its mutation verbs, element-id payloads, plus `destroy`), and the builders keep reduced maps of the operations that are theirs alone (`DefinitionBuilderEventMap` — `merge` / `clear` / `destroy`; `SubjectBuilderEventMap` — `set` / `remove` / `merge` / `clear` / `destroy`); reasoners and operators are event-free by design (stateless evaluators have no observable lifecycle). Every event is emitted directly and synchronously, after the mutation it reports; listener isolation is the emitter's own — a throwing listener routes to the `error` option handler (`(error, event)`), never onto the domain map. `destroy()` clears the registry, emits `destroy`, then destroys the emitter last; it is idempotent, and afterwards every method except the `emitter` getter and `destroy` itself throws `DESTROYED`. The managers follow the identical lifecycle, and `DefinitionBuilder.destroy()` cascades to every manager first, its own emitter last.
7. **Coded errors.** Every throw out of this module is a `ReasonError` with a machine-readable `code` (`MISSING` / `INVALID` / `MISMATCH` / `DESTROYED` / `TARGET` / `OPERATOR`) and — except `DESTROYED` — a `context` carrying the definition id and the reasoning involved, or the offending `id` / `target` / `groupId` for `TARGET`, the `key` for a non-clearable `clear`, and the `operator` for `OPERATOR`; `catch` blocks narrow with `isReasonError`, never `as`. `MISMATCH` covers a cross-reasoning definition handed to a reasoner or to `DefinitionBuilder.merge`, a `clear` key that is not clearable for the builder's reasoning, and a write to a `SubjectBuilder`'s immutable `id`; `DESTROYED` covers any use of a destroyed orchestrator, builder, or manager; `OPERATOR` covers a math operator outside the accepted vocabulary — `invertLeft` / `invertRight` on a non-invertible operation, and `applyOperation` on an unknown one.
8. **DOC ↔ SOURCE method bijection.** Every behavioral interface's `## Methods` table lists exactly its public methods (call-signature members) — exhaustive in each direction — and each implementing class exposes the same public methods, no more. A renamed / added / removed method breaks the gate until the table is reconciled.

These runtime rules hold alongside the numbered invariants. Derivation bookkeeping compares with SameValueZero (`equalValues`), so a NaN-valued conclusion or fact term derives once and the fixpoint converges. The definition-level quantitative value is finite-checked after rounding (`Definition "<id>" produced non-finite value: <v>`). `roundTo` passes the value through unchanged at extreme precisions whose scale factor overflows. Inverting a left-operand divide by zero (`x / 0 = c`) yields the non-finite equation error. A lookup reads only own table keys; a missing / `null` field refuses before any `''` key or `fallback`, and the `fallback` answers only a readable value the table misses. The malformed-shape paths stay graceful and refuse — a missing / non-array `premises` on a logical rule and a missing factor `source` are named in `errors`, never thrown. `validate` refuses what a run could only guess at (§ Narrowing untrusted definitions), while runtime behavior around duplicates is unchanged when it is skipped. Still out of scope: asynchronous reasoners, definition persistence, and contract-DSL shapes for the definition family (the plain guards in § Validators suffice) — all additive, leaving the preceding surface unchanged.

## Patterns

### Quantitative scoring

Each factor runs a pipeline — `checks` gate (all must be met) → `source` resolve (an unread field refuses, and `fallback` answers only a readable value a lookup or range misses) → finite check → `transforms` chain → `bounds` clamp — in ascending `priority` order (stable). A group's value is its `base` plus the weighted aggregation of the factors that applied, clamped but never rounded; `strict: true` makes the group all-or-nothing. The definition's value aggregates the applied groups (no weights at this level), clamps, rounds to `precision`, then is finite-checked: the `Aggregator`'s empty-input `NaN` for `minimum` / `maximum` is its deliberate "no data" signal, so aggregating zero applied groups under those surfaces as a `Definition "<id>" produced non-finite value: NaN` error (`success: false`, the `NaN` left visible in `value`) rather than a silent success. An unapplied group's `GroupResult.value` may still be `NaN` the same way — it is excluded from the definition aggregate, so only its own record shows it.

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
				required: true, // an unmet gate becomes a result error
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

An `enabled: false` factor or group is skipped and omitted from results; a `required` factor whose gate settles unmet adds an error, and a field a gate or source cannot read adds one whether the factor is required or not (`success: false`), while the rest of the run continues.

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
evaluator.evaluate(createCheck('age', 'above', 18), { age: 25 }) // { field: 'age', state: 'met', actual: 25 }
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

Forward chaining runs in two phases. First the rules (ascending `priority`) run to a fixpoint: each firing rule asserts its conclusion's atoms as derived facts overlaid on the subject (keyed by `formatField`), and an atom on a conclusion key no rule has derived yet reads `unread`, so a rule reading it holds rather than guessing. Then every key whose concluding rules have all settled `unmet` closes, and the held rules run again; a key that only waits on itself closes too, so a positive cycle is `unmet` rather than stuck. The reported `rules` are re-evaluated in original order against the final overlay, and `conclusion` is the last enabled rule's state, `unmet` when none ran, or `unread` when anything refused. Backward chaining answers from that same loop, so both strategies reach one supported model: `rules`, `conclusion`, `faults`, and `success` agree on any definition, and only the trace differs. What backward adds is an explanation: it also proves every enabled rule goal-first in priority order, on its own state, recursing into the rules concluding a premise's field with a visited-rule cycle guard, and the trace says what held and what did not. Those proofs answer nothing, and one past `depth` stops and says so. It costs the forward run plus the proofs, so choose it for the trace and not for speed. `depth` counts the passes that derive something, in both. `priority` sets the order rules fire in, and it no longer picks backward's `conclusion`, which comes from the last authored rule as forward's does. Hitting `depth` refuses in both.

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
if (forward.reasoning === 'logical') forward.conclusion // 'met' — 'eligible' through the derived 'adult'

// Backward: prove the last rule's conclusion, recursing only where needed.
const goal = createLogicalDefinition('e', 'Eligibility', rules, { strategy: 'backward', depth: 5 })
```

Connectives combine in strong Kleene logic (§ Reading what is there), and one of the wrong arity reads `unread`. A conclusion may only assert: `equals` atoms, joined by `and`, none asserting `false`.

Quirks to design around. **Derived-overlay keys are `formatField` strings**: a conclusion written with an array path derives the dot-joined flat key, and the overlay answers a premise reading that path in either form. **A `premises: []` rule refuses in both strategies** with `Rule "<id>" has no premises`. **The fixpoint snapshots per iteration**: a derivation made mid-pass is invisible until the next pass (unlike the inferential reasoner's live fact list), so a `depth` cap truncates chains one hop per iteration regardless of declaration order.

Both strategies pass over every rule once per pass, so a chain grows about quadratically. At the default `depth` a long chain refuses after 10 passes, so these costs only show with `depth` raised to fit it. A chain with `depth` raised, median of three on one desktop, with a chain this long not a path anything takes today:

| Rules | Forward  | Backward |
| ----- | -------- | -------- |
| 100   | 24 ms    | 18 ms    |
| 300   | 133 ms   | 134 ms   |
| 600   | 541 ms   | 565 ms   |
| 1,200 | 2,307 ms | 2,150 ms |

### Reading what is there

The engine answers only from what it read. A check and a rule settle on `met`, `unmet`, or `unread`, a logical result's `conclusion` does too, and `unread` never becomes an answer by default: any rule left `unread` makes `success` false, `faults` names each input field that stopped it, and `errors` holds one string per fault.

```ts
import {
	createAtom,
	createLogicalDefinition,
	createLogicalReasoner,
	createReason,
	createRule,
} from '@orkestrel/reason'

const reason = createReason({ reasoners: [createLogicalReasoner()] })

const definition = createLogicalDefinition('credit', 'Credit', [
	createRule('low', [createAtom('credit', 'below', 600)], createAtom('low', 'equals', true)),
])

const result = reason.reason({}, definition)
if (result.reasoning === 'logical') {
	result.conclusion // 'unread' — no credit is not low credit
	result.success // false
	result.errors // ['credit: missing; expected number']
	result.faults // [{ reason: 'missing', path: 'credit', expected: 'number' }]
}
```

A comparison reads `unread` when it cannot read a side, and these reads hold with a shape or without one, because a `raw` field and an open object's extras are never normalized. Nothing is coerced. An absent field, an object, an array, `NaN`, `±Infinity`, and a bigint read `unread` for every comparison.

| Comparison                        | Settles when                                                                                            | Reads `unread` on                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `above` / `below` / `from` / `to` | Both sides are finite numbers.                                                                          | Anything else, a numeric string, a boolean, and `null` included.                                                                  |
| `between` / `outside`             | The field is a finite number and the expected value is `[minimum, maximum]` of finite numbers in order. | Anything else, a reversed or short range included.                                                                                |
| `equals` / `not`                  | Both sides have one primitive type, or the expected value is `null` and the field is present.           | Any other difference of type, and a string that is blank or differs from its trim.                                                |
| `any` / `none`                    | An element is exactly the field's value, or no element is and every element has the field's type.       | No hit and an element of another type, a string that is blank or differs from its trim, an empty list, or a list that is not one. |

A difference of type never settles, because every answer would be a guess about what the writer meant. `'1' equals 1`, `'no' equals false`, and `true not 'true'` all refuse rather than read `unmet` or `met`, and `x not 'none'` over 90 refuses too, so the author writes `x not null`.

`null` is a value. `equals null` and `not null` settle on a present field unless it is a blank or padded string, an ordering on `null` reads `unread`, and `and(spouse not null, spouse above 0)` settles on `null`, which is the authored form of "does not apply".

Connectives combine in strong Kleene logic, so `unread` survives only where the answer could still change. `age above 18 and credit above 600` with age 15 and no credit is exactly `unmet`, and nothing is asked about credit.

| Left     | Right    | `and`    | `or`     | `implies` | `xor`    |
| -------- | -------- | -------- | -------- | --------- | -------- |
| `met`    | `met`    | `met`    | `met`    | `met`     | `unmet`  |
| `met`    | `unmet`  | `unmet`  | `met`    | `unmet`   | `met`    |
| `met`    | `unread` | `unread` | `met`    | `unread`  | `unread` |
| `unmet`  | `met`    | `unmet`  | `met`    | `met`     | `met`    |
| `unmet`  | `unmet`  | `unmet`  | `unmet`  | `met`     | `unmet`  |
| `unmet`  | `unread` | `unmet`  | `unread` | `met`     | `unread` |
| `unread` | `met`    | `unread` | `met`    | `met`     | `unread` |
| `unread` | `unmet`  | `unmet`  | `unread` | `unread`  | `unread` |
| `unread` | `unread` | `unread` | `unread` | `unread`  | `unread` |

`not` flips `met` and `unmet` and leaves `unread`. A hole in the operands and a wrong arity read `unread`.

Closed-world covers one thing: a key an enabled rule of the same definition concludes. Once every rule that could conclude it has settled `unmet`, `equals` and `any` read `unmet` on it, `not` and `none` read `met`, and an ordering or range comparison refuses (`Rule "<id>" reads conclusion "<key>" with "<operator>", and no rule concluded a value`), because the key holds no number. A subject may not supply such a key (`Subject supplies conclusion "<key>"`), since that would assert what a rule has to derive. A cycle through negation has no answer any order of evaluation could settle: `validate` names its keys, and on a run that skipped `validate`, backward refuses it before any proof and forward refuses it when it fires. A positive cycle only waits on itself, so it closes `unmet` before anything reading it settles.

A quantitative factor refuses the same way. A field or range source reads a finite number, and a lookup key is a string, a finite number, or a boolean. A readable value the table or bands have no answer for, with no `fallback`, is an error rather than a fault, because the input is not what is wrong. `fallback` is for a lookup or range source and answers one case, a readable value the table or bands miss, which the trace records as `Factor "<id>": took its fallback, <value>`; `validate` refuses it on a field or static source. A symbolic subject field binds only as a finite number, and an inferential `depth` cap that leaves a goal unproved refuses.

### The subject door

A definition may carry a `shape`, one `ContractShape` that says what its subject is: which fields, of what type, required or optional. The reasoner admits the subject through it first, so the shape is the one place that decides, and it reaches an LLM, a tool, or MCP unchanged as `compileSchema(shape)`.

```ts
import { booleanShape, numberShape, objectShape, optionalShape } from '@orkestrel/contract'
import {
	createAtom,
	createLogicalDefinition,
	createLogicalReasoner,
	createRule,
} from '@orkestrel/reason'

const definition = createLogicalDefinition(
	'adult',
	'Adult',
	[createRule('adult', [createAtom('age', 'from', 18)], createAtom('adult', 'equals', true))],
	{ shape: objectShape({ age: numberShape(), licensed: optionalShape(booleanShape()) }) },
)
const reasoner = createLogicalReasoner()

const repaired = reasoner.reason({ age: '30' }, definition)
repaired.success // true
repaired.repairs // [{ reason: 'type', path: ['age'], expected: 'number', received: '"30"' }]

reasoner.reason({ age: 30, agee: 1 }, definition).errors // ['agee: extra; this key is not declared, remove it']
reasoner.reason({ age: '30.0' }, definition).errors // ['age: type; expected number; received "30.0"']
```

A subject with accessors has to read the same every time, because `explain`, `audit`, and `parse` each read it: a getter answering `30` and then `'30.0'` is admitted as `{ age: 30 }` with no repair recorded. Hand the door plain data. The same goes for a definition: `validate` runs once per definition by identity, so one edited in place after its first run is not validated again. Build a new one instead.

The door uses the dependency's admission boundary to refuse undeclared keys, ambiguous unions, truncated audits, and lossy repairs. An object declared open admits extras.

A door fault's `path` is `contract`'s array of keys and an engine fault's is the path the rule wrote, so compare them with `formatField`. `parse` gives the subject the reasoner reads. What it coerced is reported in `repairs`, and only a lossless repair is accepted: a number from a string whose trim is the number's own text, so `'30'` and `' 30 '` pass and `'30.0'`, `'007'`, `'0x10'`, and `'1e3'` refuse; a boolean from `'true'` or `'false'` only; a literal from its trimmed text; a string from a finite number. A field declared with `optionalShape(inner, { default })` carries that default in its schema, and `parse` fills it when the key is absent or `undefined`. `defaulted` lists what `parse` filled, read from the difference between what arrived and what came out.

A required key that is absent refuses at the door even where the engine alone would settle `age 15 and credit above 600`. An author who wants that lever declares the field optional, with no default.

With a shape, `validate` reads the definition against it: every path read is in the shape or is a key the definition produces, every expected value satisfies the field's shape, per element for a list, and a string expected needs a field that admits it as a literal, because free text is never compared by equality. A shape carrying a `pattern` refuses at authoring, because a `pattern` does not survive JSON and a definition must, and so does a shape declaring a conclusion key. A `raw` or `json` field read is a warning, since the typed read is then the only guard.

`createSubjectDoor` gives a package that reads a shape at its own root the same door:

```ts
import { numberShape, objectShape } from '@orkestrel/contract'
import { createSubjectDoor } from '@orkestrel/reason'

const door = createSubjectDoor()
const shape = objectShape({ age: numberShape() })
door.admit({ age: '30' }, shape).subject // { age: 30 }
door.admit({}, shape).errors // ['age: missing; expected number']
```

### Publishing definitions and results

The definitions and results are published as shapes and contracts, so they reach an LLM, a tool, or MCP as JSON Schema with nothing translated.

```ts
import {
	createDefinitionContract,
	createLogicalDefinition,
	createLogicalReasoner,
	projectResult,
	resultContract,
} from '@orkestrel/reason'

const definition = createLogicalDefinition('e', 'Eligibility', [])
const contract = createDefinitionContract() // build once and hold it
contract.is(definition) // true
contract.schema // the JSON Schema of any definition

const result = createLogicalReasoner().reason({}, definition)
resultContract.is(projectResult(result)) // true
```

A definition crosses on `is`, never `parse`, because `parse` would turn `enabled: '0'` into `false` and accept a padded operator. A shape refuses cycles, so `Expression` and `SymbolicExpression` are depth-bounded expansions (`EXPRESSION_SHAPE_DEPTH`, `SYMBOLIC_SHAPE_DEPTH`) and the recursive guards stay the authority: what `is` admits the guard admits, including a definition's own nested `shape`. A malformed nested shape such as `shape: 42` fails both checks. A deeper authored expression still runs in memory, because the guard admits it, and cannot cross on `is`. Building those expansions is what costs, so the recursive definition contracts are functions (`createDefinitionContract`, `createLogicalDefinitionContract`, `createSymbolicDefinitionContract`) a caller holds the result of, and an import pays nothing for them. Arity and the rest of what `validate` reads are left to `validate`. A definition's own `shape` key must satisfy the dependency's shape contract.

A result crosses as `projectResult`, because the engine publishes `NaN` by design and a check's `actual` holds whatever the subject held: a non-finite number becomes `null`, and what JSON cannot hold is omitted, so is a reference back to an ancestor, anything past `PROJECTION_NODE_LIMIT` objects, and a value that throws on being read. The in-memory result and its guard stay as they are.

### Symbolic solving

Bindings start from the definition's `variables`, then numeric subject fields override same-named variables (every own key except `id`, finite numbers only, so a numeric string never binds). Equations solve strictly in order: when the `target` is unbound and sits on exactly one side, it is isolated algebraically through the `INVERTIBLE_OPERATIONS`; each solution is rounded to `precision` before feeding forward into later equations. A failing equation (unbound variable, non-invertible isolation, non-finite value, a binary operation with no right side) records an error and a `FAILED` trace — the run continues, and an unbound variable also joins `faults`.

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

Definitions are JSON-serializable data, so they arrive from storage / the wire as `unknown`. Narrow first with the structural guard (`isDefinition` — exact records, total on adversarial input), then with the semantic pass (`validate` — ids present, sources declared, expressions readable, non-empty rule sets) whose `errors` refuse and whose `warnings` flag runnable-but-suspicious definitions.

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

`errors` name what a run could only guess at: empty collections, duplicate rule / group / factor / equation / inference ids (`Duplicate <noun> id "<id>"`, once per duplicated id), inferential confidences outside `[0, 1]`, an expected value its comparison cannot use (`scanCheck`), a connective of the wrong arity (`scanExpression`), a conclusion that does not assert (`scanConclusion`), a `fallback` its source cannot use (`scanFactor`), a binary operation with no right side (`scanSymbolicExpression`), a cycle through negation (`Conclusions depend on their own negation: <keys>`, `findNegativeCycles`), and what a `shape` says the definition cannot read (§ The subject door). `warnings` are left for what derives nothing false: an empty inference set, a premise-less inference, and an inferential conclusion `?variable` unbound by all of its inference's premises (`Inference "<id>" conclusion variable "<variable>" is unbound by all premises`, `findUnboundVariables`). Duplicates are refused because they are first/last-wins artifacts at run time, where a group's weight lookup takes the first same-id factor.

The orchestrator runs this pass itself by default and throws `INVALID`, remembering a valid definition by identity, so a definition edited in place after its first run is not validated again. Build a new one, as the copy-on-write helpers do. Call `validate` at a boundary that reports rather than throws. `validate: false` skips the pass, and a reasoner still refuses what it cannot read.

### Practices

- **Register every reasoner before the first `reason` call** — dispatch is a registry lookup; a miss throws `MISSING` regardless of `bail`.
- **Build definitions with the value factories** — they default `name` to the id, omit absent optional keys (so outputs round-trip the exact-record validators), and keep call sites terse.
- **Gate untrusted definitions twice** — `isDefinition` for shape at the boundary, `validate` for semantics; the orchestrator's own `validate` option is on by default and throws `INVALID`.
- **Keep ids unique** — `validate` refuses duplicates; with `validate: false` the runtime resolves them first/last-wins, silently.
- **Check `success` before trusting the payload** — errors accumulate without aborting, so a `value` computed alongside errors is a partial answer, and `faults` names each field that stopped it.
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
- [`tests/src/core/helpers.test.ts`](../tests/src/core/helpers.test.ts) — `formatField`, `clamp` / `roundTo` / `matchesBounds` / `equalValues` / `sortByPriority` / `findDuplicates`, the `combineStates` truth tables and `settleComparison`, the `scan*` family, `findNegativeCycles`, the fact and algebra machinery, and the capability-layer engine (`appendById` placement + `TARGET`, per-kind append / prepend / replace / remove, `merge*` / `clear*`, `parseDefinition`, the subject helpers).
- [`tests/src/core/validators.test.ts`](../tests/src/core/validators.test.ts) — each guard accepts valid / rejects invalid + adversarial junk, exact-record semantics, `lazyOf` recursion containment.
- [`tests/src/core/factories.test.ts`](../tests/src/core/factories.test.ts) — every value factory's output shape (override merging, key omission, `name` defaulting); every entity factory wires a working instance with custom `id`s through the options objects.
- [`tests/src/core/operators/Evaluator.test.ts`](../tests/src/core/operators/Evaluator.test.ts) — every comparison (strictness, numeric requirements, the `any` / `none` asymmetry vs the pure-negation `outside`), `FieldPath` resolution, unknown-operator totality.
- [`tests/src/core/operators/Transformer.test.ts`](../tests/src/core/operators/Transformer.test.ts) — per-operation operand defaults, divide-by-zero `NaN`, unary operations, `chain` folding.
- [`tests/src/core/operators/Aggregator.test.ts`](../tests/src/core/operators/Aggregator.test.ts) — empty-input identities, weight-as-exponent `product`, the `NaN` answers for a zero total weight and for weights of another length.
- [`tests/src/core/reasoners/QuantitativeReasoner.test.ts`](../tests/src/core/reasoners/QuantitativeReasoner.test.ts) — the factor pipeline, priorities, `strict` / `required`, source resolution + refusal, base / bounds / precision stacking.
- [`tests/src/core/reasoners/LogicalReasoner.test.ts`](../tests/src/core/reasoners/LogicalReasoner.test.ts) — forward fixpoint + derived overlays, backward proving + cycle safety, closing conclusion keys, refusal in both strategies, cycles through negation.
- [`tests/src/core/reasoners/SymbolicReasoner.test.ts`](../tests/src/core/reasoners/SymbolicReasoner.test.ts) — subject binding + overrides, isolation through invertible operations, rounded feed-forward, per-equation failure isolation.
- [`tests/src/core/reasoners/InferentialReasoner.test.ts`](../tests/src/core/reasoners/InferentialReasoner.test.ts) — unification + relational joins, confidence products, dedupe, subject-fact injection, backward proof trees.
- [`tests/src/core/integration.test.ts`](../tests/src/core/integration.test.ts) — cross-strategy scenarios through one orchestrator.

## See also

- [`contract.md`](contract.md) — the guards, combinators, and `parseNumber` the validators and reasoners compose.
- [`emitter.md`](emitter.md) — the typed emitter behind the orchestrator's observation surface.
- [`AGENTS.md`](../AGENTS.md) — the rules.
- [`README.md`](README.md) — the guides index.
