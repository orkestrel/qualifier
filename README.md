# @orkestrel/qualifier

> A synchronous, deterministic eligibility engine that runs a pure,
> JSON-serializable `QualificationDefinition`'s ordered `passes` against one
> subject through one `@orkestrel/reason` engine and returns a fresh
> `QualificationResult` carrying global and scoped eligibility, evidence-rich
> `findings`, and quantitative `derivations`.

Author the passes — quantitative derivations and logical rule gates — hand a subject
(a plain data record) to `qualify`, and read what comes back. The caller supplies the
definition; `Qualifier` only evaluates what it is given. Inject a
[`@orkestrel/reason`](https://github.com/orkestrel/reason) `ReasonInterface` where
qualification shares an engine with the rest of your reasoning, and call `destroy()`
when the qualifier's work is done. Environment-agnostic — no I/O, no browser or
server assumptions. Part of the `@orkestrel` line.

## Install

```sh
npm install @orkestrel/qualifier
```

## Requirements

- Node.js >= 22.12.0
- ESM (`import`) and CommonJS (`require`) through the `exports` field

## Usage

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
overload. Every `qualify` call fires once through `qualifier.emitter` (`qualify`).

## Guide

For the full surface — `Qualifier`, `QualificationResult`, finding types, validators,
factories, errors, and options — see
[`guides/qualifier.md`](guides/qualifier.md).

## Package

Published as a single typed entry point per the `exports` field in
`package.json`.

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](./LICENSE).
