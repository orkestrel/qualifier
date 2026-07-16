# @orkestrel/qualifier

A typed **pre-rating eligibility engine** over [`@orkestrel/reason`](https://github.com/orkestrel/reason):
authored **passes** — quantitative derivations and logical rule gates — run in order
against a **subject** (a plain data record) to produce **findings** (evidence-rich
ruling outcomes), **derivations** (quantitative audit trails), and **eligibility**
(global plus per-scope). The caller supplies the definition; `Qualifier` only
evaluates what it is given. Qualification never mutates its inputs — every result is
a fresh object. Environment-agnostic — no I/O, no browser or server assumptions.
Part of the `@orkestrel` line.

## Install

```sh
npm install @orkestrel/qualifier
```

## Requirements

- Node.js >= 24
- ESM (`import`) and CommonJS (`require`) via the `exports` field

## Usage

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

`qualify` accepts exactly one subject per call — there is no batch-of-subjects
overload. Every `qualify` call fires once through `qualifier.emitter` (`qualify`).

## Guide

For the full surface — `Qualifier`, `QualificationResult`, finding types, validators,
factories, errors, and options — see
[`guides/src/qualifier.md`](guides/src/qualifier.md).

## Package

Published as a single typed entry point per the `exports` field in
`package.json`.

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](./LICENSE).
