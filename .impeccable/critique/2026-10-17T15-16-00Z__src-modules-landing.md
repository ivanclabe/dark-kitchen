---
target: Quanela landing
total_score: 22
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 2
target_identity: "file:/Users/ivanclabe/Workspace/dark-kitchen/src/modules/landing"
timestamp: 2026-10-17T15-16-00Z
slug: src-modules-landing
---
# Critique — Quanela landing (src/modules/landing, Persuade) — 22/32 Acceptable (7, 10 n/a). Taste juror 5.9/10.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 3 | No active-section indicator |
| 2 | Real world | 3 | «dark kitchen», «Agentes de IA para automatizar» vague |
| 3 | Control | 3 | Solid |
| 4 | Consistency | 2 | 3 button radii; play icon without video |
| 5 | Error prevention | 3 | Solid |
| 6 | Recognition | 3 | 26-row comparison without sticky header |
| 8 | Minimalist | 2 | Hero carries ~9 elements; pricing ≈47% of page |
| 9 | Recovery | 3 | Pricing retry |

Specificity: category-interchangeable AI-SaaS sequence; Quanela-only material (Colombian dishes, WhatsApp, Oye Quanela, PSE/Nequi) buried at ~9px inside screenshots.
Detector: orange accent words 2.25–2.8:1 on cream (real); Nunito/size advisories are scope (marketing) false positives; landing ships ~686 KB gzipped JS (routes.tsx imports the whole app, no lazy); 123 KB logo PNG; CLS 0.003; no 390 overflow.

## Priority issues
1. [P0] Hero collision 1024–1100px (LandingPage.tsx:152-155 mockup over headline/subline/tile). layout → adapt.
2. [P1] No subject idea; «operation + AI» has no section. Make the order ticket travel WhatsApp → Cocina → Despacho → stock → dish cost; one real AI recommendation with its why. bolder or a new taste direction.
3. [P1] Overloaded hero, misleading «Ver cómo funciona» play icon; honest risk-reducer (no lock-in, cancel anytime) buried in FAQ. distill → clarify.
4. [P2] 9 type sizes, grey 15px body ~96ch, failing orange accent words. typeset → colorize.
5. [P2] Pricing dominates, no closing CTA, brand brown never a field. distill, adapt, polish; landing lazy-load via optimize.

## Recommendation
Taste: new direction (keep palette, Nunito, mascot, real screenshots), not a refinement.

## Personas
Jordan: play without video, jargon, SUPER_ADMIN in screenshot. Riley: hero breaks at 1024, font swap after mount, CSR only. Casey: product after 1.4 screens, comparison table clipped.
