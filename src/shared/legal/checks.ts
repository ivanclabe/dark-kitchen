/** The two sign-up boxes (ADR 0071): Terms and Data Policy, separate and never pre-ticked. */
export interface LegalChecks {
  terms: boolean
  privacy: boolean
}

export const NO_CHECKS: LegalChecks = { terms: false, privacy: false }

export const allChecked = (v: LegalChecks) => v.terms && v.privacy
