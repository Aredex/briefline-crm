// D1 resolved: the repo is public. Evidence-refs across the landing
// (Engineering, Quality, CaseStudy) point here instead of rendering as
// plain text — see each section's header comment for why they didn't
// before.
export const GITHUB_REPO_URL = 'https://github.com/Aredex/briefline-crm'

/** `path` may include a `#heading-anchor` fragment (e.g. ADR references). */
export function repoFileUrl(path: string): string {
  return `${GITHUB_REPO_URL}/blob/main/${path}`
}
