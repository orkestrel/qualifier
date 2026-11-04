import type { ContractInterface } from '@orkestrel/contract'
import { createContract } from '@orkestrel/contract'
import { qualificationResultShape } from './shapers.js'

/** Publishes a `QualificationResult`'s JSON projection as a contract, read through `projectQualificationResult`. */
export const qualificationResultContract: ContractInterface<unknown> =
	createContract(qualificationResultShape)
