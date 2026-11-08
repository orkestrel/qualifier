Each item is a chunk that reaches green before the next. An item keeps its number for life: a closed
item leaves this file and its number is never reused, so a commit message citing an item by number
stays true.

- **1.** After the shared standing-proof observation mechanism lands in `@orkestrel/test`, adopt it for `buildQualifierContractCases` in `tests/setup.ts` and `tests/src/core/contracts.test.ts`. Keep qualification outcomes, nested-shape controls, result projections, and open extra-member guard assertions local.
- **2.** After the first release, add the deferred `Premise.defaulted` marker to `src/core/types.ts` and its construction in `src/core/helpers.ts`, aligning the premise shaper, guard, and mirrored proofs. Distinguish a defaulted premise from a merely read value.
