/*
 * Landing — public case-study page at /.
 * Sections: Hero, Problem/Solution, Workflow, Product Previews, Roles,
 * Engineering, Quality, Case Study, Final CTA. All copy in English.
 */
import { LandingLayout } from '../components/landing/LandingLayout'
import '../components/landing/Landing.css'
import { useHashScrollOnLoad } from '../components/landing/useHashScrollOnLoad'
import { Hero } from '../components/landing/sections/Hero'
import { ProblemSolution } from '../components/landing/sections/ProblemSolution'
import { Workflow } from '../components/landing/sections/Workflow'
import { ProductExplorer } from '../components/landing/sections/ProductExplorer'
import { Permissions } from '../components/landing/sections/Permissions'
import { Engineering } from '../components/landing/sections/Engineering'
import { Quality } from '../components/landing/sections/Quality'
import { CaseStudy } from '../components/landing/sections/CaseStudy'
import { FinalCta } from '../components/landing/sections/FinalCta'

export function Landing() {
  useHashScrollOnLoad()

  return (
    <LandingLayout>
      {/* Sentinel for sticky header */}
      <div id="hero-sentinel" />

      <Hero />
      <ProblemSolution />
      <Workflow />
      <ProductExplorer />
      <Permissions />
      <Engineering />
      <Quality />
      <CaseStudy />
      <FinalCta />
    </LandingLayout>
  )
}
