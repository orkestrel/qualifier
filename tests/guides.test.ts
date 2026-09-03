// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The four constants below are this
// package's own, and are the only part a sibling package changes.

import { describe, expect, it } from 'vitest'
import {
	computeSymbolKey,
	createGuide,
	createSource,
	createSourceManager,
	extractFenceImports,
	findMissing,
	findMissingSymbols,
	findUnexampled,
	findUnlisted,
	isExternalLink,
	parseManifest,
	resolveLink,
} from '@orkestrel/guide'
import { createQualificationDefinition, createQualifier, createRuling } from '@src/core'
import { readFileSync } from 'node:fs'
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
import { requireValue } from '@orkestrel/test'
import { readInventory } from '@orkestrel/test/server'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['text', 'ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({ '@orkestrel/qualifier': 'src/core', '@src/core': 'src/core' })
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the second assertion below fails when a name
 * here stops being stranded, so the list cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([])

/** Root-level files this package's guides link to. `readInventory` walks directories only. */
const ROOT_FILES = Object.freeze(['AGENTS.md'])

const root = new URL('../', import.meta.url)
const files: Record<string, string> = {
	...readInventory(root, ['src', 'guides', 'tests'], { extensions: ['.ts', '.md'] }),
}
for (const name of ROOT_FILES) files[name] = readFileSync(new URL(name, root), 'utf8')
const manifest = parseManifest(
	requireValue(files['guides/README.md'], 'Missing file: guides/README.md'),
	'guides',
)
const sources = createSourceManager({ files, modules: MODULES })

it('manifest lists at least one guide', () => {
	expect(manifest.length).toBeGreaterThan(0)
})

for (const entry of manifest) {
	const guide = createGuide(requireValue(files[entry.spec], `Missing file: ${entry.spec}`))
	const source = createSource({ files, module: entry.source })

	describe(`${entry.concept}`, () => {
		it('uses only listed fence languages', () => {
			expect(findUnlisted(guide.fences(), FENCE_LANGUAGES)).toEqual([])
		})

		it('extracts a non-empty documented surface', () => {
			expect(guide.surface().length).toBeGreaterThan(0)
		})
		it('re-exports every direct declaration that is not named internal', () => {
			const stranded = findMissingSymbols(source.exports(), source.surface())
			expect(stranded.filter((key) => !INTERNAL.includes(key))).toEqual([])
		})
		it('names no symbol internal that the barrel already exports', () => {
			const stranded = findMissingSymbols(source.exports(), source.surface())
			expect(INTERNAL.filter((key) => !stranded.includes(key))).toEqual([])
		})
		it('re-exports only direct declarations', () => {
			expect(findMissingSymbols(source.surface(), source.exports())).toEqual([])
		})
		it('documents every barrel export', () => {
			expect(findMissingSymbols(source.surface(), guide.surface())).toEqual([])
		})
		it('documents only barrel exports', () => {
			expect(findMissingSymbols(guide.surface(), source.surface())).toEqual([])
		})

		it('exposes no hidden module-scope declarations', () => {
			expect(source.hidden().map(computeSymbolKey)).toEqual([])
		})

		for (const group of guide.methods()) {
			const members = source.methods(group.interface)
			const entity = group.interface.replace(/Interface$/, '')
			describe(`${group.interface}`, () => {
				it('documents at least one method', () => {
					expect(group.methods.length).toBeGreaterThan(0)
				})
				it('documents every interface method', () => {
					expect(findMissing(members, group.methods)).toEqual([])
				})
				it('documents no phantom method', () => {
					expect(findMissing(group.methods, members)).toEqual([])
				})
				it(`${entity} exposes no undocumented method`, () => {
					const extra =
						entity === group.interface ? [] : findMissing(source.methods(entity), group.methods)
					expect(extra).toEqual([])
				})
			})
		}

		it('documents an example for every Surface function', () => {
			const fences = guide
				.fences()
				.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
				.map((fence) => fence.code)
			const names = guide
				.surface()
				.filter((symbol) => symbol.kind === 'function')
				.map((symbol) => symbol.name)
			expect(findUnexampled(names, fences, source.examples())).toEqual([])
		})

		for (const group of guide.methods()) {
			const entity = group.interface.replace(/Interface$/, '')
			describe(`${group.interface} examples`, () => {
				it('documents an example for every method', () => {
					const fences = guide
						.fences()
						.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
						.map((fence) => fence.code)
					const examples =
						entity === group.interface
							? source.examples(group.interface)
							: source.examples(group.interface).concat(source.examples(entity))
					expect(findUnexampled(group.methods, fences, examples)).toEqual([])
				})
			})
		}

		it('imports only real exports in every ```ts fence', () => {
			const fences = guide.fences().filter((fence) => fence.language === EXAMPLE_LANGUAGE)
			for (const fence of fences) {
				for (const { specifier, names } of extractFenceImports(fence.code)) {
					const imported = sources.source(specifier)
					if (imported === undefined) continue
					const surface = imported.surface().map((symbol) => symbol.name)
					expect(findMissing(names, surface)).toEqual([])
				}
			}
		})

		it('resolves every relative link', () => {
			const broken = guide
				.links()
				.filter((href) => !isExternalLink(href))
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(broken).toEqual([])
		})
		it('links only to test files that exist', () => {
			const missing = guide
				.tests()
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(missing).toEqual([])
		})
	})
}

// Parity proves each documented name resolves. These cases run the guide's flagship fences
// and assert the values their comments claim, so a fence that documents an outcome the code
// contradicts reddens here. Each case pairs its behavioural assertions with a presence guard
// on the commented lines, so editing a fence orphans the transcription instead of leaving it
// silently disagreeing.
describe('flagship fences', () => {
	const guideText = requireValue(files['guides/qualifier.md'], 'Missing file: guides/qualifier.md')

	it('returns what the Surface fence claims', () => {
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

		expect(result.eligibility).toBe('ineligible')
		expect(result.findings[0]?.message).toBe('A license is required')
		expect(result.derivations).toEqual([])
		expect(guideText).toContain("result.eligibility // 'ineligible'")
		expect(guideText).toContain("result.findings[0]?.message // 'A license is required'")
		expect(guideText).toContain('result.derivations // [] — no quantitative pass ran')

		qualifier.destroy()
	})

	it('returns what the Patterns fence claims', () => {
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
		const subject = { total: 1_250_000 }
		const result = qualifier.qualify(subject, definition)

		expect(result.eligibility).toBe('ineligible')
		expect(result.derivations.map((entry) => [entry.id, entry.value])).toEqual([
			['cap', 1_000_000],
			['excess', 250_000],
		])
		// The prose under the fence claims the caller's subject is untouched.
		expect(subject).toEqual({ total: 1_250_000 })
		expect(guideText).toContain("result.eligibility // 'ineligible'")
		expect(guideText).toContain("// [['cap', 1000000], ['excess', 250000]]")
		expect(guideText).toContain("The caller's subject stays `{ total: 1_250_000 }`")

		qualifier.destroy()
	})

	it('returns what the Methods fence claims', () => {
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

		expect(qualifier.validate(definition)).toEqual({ valid: true, errors: [], warnings: [] })
		expect(qualifier.qualify({ id: 'a', licensed: false }, definition).eligibility).toBe(
			'ineligible',
		)
		expect(guideText).toContain(
			'qualifier.validate(definition) // { valid: true, errors: [], warnings: [] }',
		)
		expect(guideText).toContain(
			"qualifier.qualify({ id: 'a', licensed: false }, definition) // eligibility: 'ineligible'",
		)

		qualifier.destroy()
	})
})
