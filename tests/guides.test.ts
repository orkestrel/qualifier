// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The constants that follow are this
// package's own, as is the executed section that closes the file.

import { GuideCommand } from '@orkestrel/guide/server'
import { readInventory } from '@orkestrel/test/server'
import { createVitest } from 'vitest/node'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['text', 'ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** The package identity that binds its manifest, module map, and README pitch. */
const PACKAGE_NAME = '@orkestrel/qualifier'
/** The one guide this package sources, whose tagline the README pitch equals. */
const GUIDE_SPEC = 'guides/qualifier.md'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({ [PACKAGE_NAME]: 'src/core', '@src/core': 'src/core' })
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the assertion that follows it fails when a name
 * here stops being stranded, so the list cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([])

await new GuideCommand({
	root: new URL('../', import.meta.url),
	patterns: ['src/**/*.ts', 'tests/**/*.ts', 'guides/*.md', '*.md', 'package.json'],
	modules: MODULES,
	languages: FENCE_LANGUAGES,
	language: EXAMPLE_LANGUAGE,
	reader: readInventory,
	runner: createVitest,
}).execute(async ({ files, report, rows }) => {
	const { isRecord, parseJSON } = await import('@orkestrel/contract')
	const {
		computeSymbolKey,
		createSourceManager,
		extractFenceImports,
		findMissing,
		findMissingSymbols,
		isExternalLink,
		resolveLink,
	} = await import('@orkestrel/guide')
	const {
		createAtom,
		createFactorGroup,
		createFieldFactor,
		createLogicalDefinition,
		createQuantitativeDefinition,
		createRule,
		createStaticFactor,
		createTransform,
	} = await import('@orkestrel/reason')
	const { createQualificationDefinition, createQualifier, createRuling } = await import('@src/core')
	const { requireValue } = await import('@orkestrel/test')
	const { describe, expect, it } = await import('vitest')
	const sources = createSourceManager({ files, modules: MODULES })
	const own = requireValue(
		rows.find((row) => row.entry.spec === GUIDE_SPEC),
		`Missing manifest row: ${GUIDE_SPEC}`,
	)
	const manifest = parseJSON(requireValue(files['package.json'], 'Missing inventory: package.json'))
	if (!isRecord(manifest)) throw new Error('Invalid package manifest: package.json')

	it('manifest lists at least one guide', () => {
		expect(report.input).toEqual([])
		expect(rows.length).toBeGreaterThan(0)
		expect(own.entry.spec).toBe(GUIDE_SPEC)
	})

	// The example half of the equality case is silent over an empty population: with no
	// title on both sides `findDrift` compares no pair and the case passes on the summaries
	// alone. This pins the population this repository's own guide contributes, so removing
	// every `@example` title reddens the suite instead of quietly retiring half the gate.
	// The failure names both title sets, because a pin reporting only its own emptiness
	// leaves the reader to work out which side dropped the title.
	it('pairs at least one example title across the guide and the source', () => {
		expect(report.examples.titles.filter((finding) => finding.spec === GUIDE_SPEC)).toEqual([])
	})

	// The README's pitch and the guide's tagline are one text, each read as the blockquote
	// under its file's H1. The native report owns their comparison. The manifest assertion
	// binds that report to this package rather than allowing an unrelated package identity.
	it('opens the README with the guide tagline', () => {
		expect(manifest.name).toBe(PACKAGE_NAME)
		expect(report.pitch).toEqual([])
	})

	for (const { entry, guide, source } of rows) {
		describe(`${entry.concept}`, () => {
			it('uses only listed fence languages', () => {
				expect(report.fences.filter((finding) => finding.spec === entry.spec)).toEqual([])
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
				const members = source.methods(group.interface).map((method) => method.name)
				const documented = group.methods.map((method) => method.name)
				const entity = group.interface.replace(/Interface$/, '')
				describe(`${group.interface}`, () => {
					it('documents at least one method', () => {
						expect(group.methods.length).toBeGreaterThan(0)
					})
					it('documents every interface method', () => {
						expect(findMissing(members, documented)).toEqual([])
					})
					it('documents no phantom method', () => {
						expect(findMissing(documented, members)).toEqual([])
					})
					it(`${entity} exposes no undocumented method`, () => {
						const extra =
							entity === group.interface
								? []
								: findMissing(
										source.methods(entity).map((method) => method.name),
										documented,
									)
						expect(extra).toEqual([])
					})
				})
			}

			// The equality gate: a `Summary` cell against its export's description paragraph, a
			// titled fence against the `@example` of that title. `findDrift` owns the comparison
			// and names both sides; converge the two sides through the native entry, never by
			// weakening this assertion. `findDrift` pairs an example only where a title is
			// present on both sides, so an untitled `@example` block is outside this case. Each
			// collected line is the spec, the key, and each side's text or `absent` — the same
			// worklist the native entry prints, so a failure here is read the way that command's
			// output is.
			it('keeps every compared summary and example equal to its source', () => {
				expect(report.drift.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('documents an example for every Surface function', () => {
				expect(report.examples.functions.filter((finding) => finding.spec === entry.spec)).toEqual(
					[],
				)
			})

			it('documents an example for every method', () => {
				expect(report.examples.methods.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

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
		const guideText = requireValue(files[GUIDE_SPEC], `Missing file: ${GUIDE_SPEC}`)

		it('returns what the Surface fence claims', () => {
			const gates = createLogicalDefinition('gates', 'Eligibility gates', [
				createRule(
					'licensed',
					[createAtom('licensed', 'equals', false)],
					createAtom('blocked', 'equals', true),
				),
			])
			const definition = createQualificationDefinition(
				'standard',
				'Standard eligibility',
				[gates],
				{
					rulings: [
						createRuling('license', 'gates', 'licensed', 'restriction', {
							message: 'A license is required',
						}),
					],
				},
			)

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
			const definition = createQualificationDefinition(
				'standard',
				'Standard eligibility',
				[gates],
				{
					rulings: [createRuling('license', 'gates', 'licensed', 'restriction')],
				},
			)

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

		it('returns what the titled factory fence claims', () => {
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
			const passes = [gates]
			const definition = createQualificationDefinition('standard', 'Standard eligibility', passes, {
				rulings: [messaged],
			})

			expect('message' in bare).toBe(false)
			expect(messaged.message).toBe('A license is required')
			expect('description' in definition).toBe(false)
			expect(definition.passes).not.toBe(passes)
			expect(guideText).toContain(
				"'message' in bare // false — an absent optional key is omitted, never written as undefined",
			)
			expect(guideText).toContain("messaged.message // 'A license is required'")
			expect(guideText).toContain("'description' in definition // false")
			expect(guideText).toContain(
				'definition.passes === passes // false — the factory copies what it is handed',
			)
		})
	})
})
