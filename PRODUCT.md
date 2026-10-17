# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Primary: the owner or administrator** of a dark kitchen or restaurant in Colombia (or a small group of them). Runs the business from a laptop or a phone: orders, stock and purchases, recipes and costs, customers and receivables, team and shifts, billing. Design decisions are measured against this person.
- **Secondary, with dedicated views:** the shift team — cashier (orders and payments), the kitchen line (the Cocina view, often a tablet), riders (Despacho, on a phone). They work in a hurry, with greasy hands, under noise.
- **Platform:** the Global Admin (the separate admin portal), which creates organizations and handles subscriptions.

## Product Purpose
Quanela is where a food business runs its day: from the order (counter, phone, web menu or WhatsApp) through the kitchen and the delivery, to the stock it consumed, the cost of each dish and what the customer still owes. Success is an owner who knows what is happening and what to do next without chasing spreadsheets or chats.

## Positioning
Operation and AI in one place. Orders (WhatsApp included), kitchen, inventory, recipes and costs are the same connected data, so the AI agents can warn and recommend over the real operation (what to buy, perishables at risk, dishes selling below cost, stalled orders), and «Oye Quanela» lets the line work by voice. The AI recommends; the person decides.

## Operating Context
- Multi-tenant: an organization (the business) has accounts (each premise or brand); every account sees only its data, each person only the accounts and roles assigned. Each organization has its own subdomain ({code}.quanela.com).
- The day runs in the Centro de operaciones (Tablero, Cocina, Despacho, Lista); the rest are back-office modules (Abastecimiento, Recetas, Menús, Clientes, Finanzas, Análisis, Menú web, WhatsApp, Personal, Configuración).
- Spanish (Colombia) UI, COP money, Bogotá time. Light, dark and neutral themes.
- Subscription plans (Standard, Business, Enterprise), paid online with Wompi (ADR 0066).

## Capabilities and Constraints
- React 19 + Vite + Tailwind v4 + TanStack Query + Supabase (Postgres with RLS per account). Design work never changes business logic, Supabase queries, RBAC or migrations.
- Design system: `src/shared/ui` with the tokens of ADR 0065 (primary `#c2410c`, focus, semantic colors, `text-2xs`, motion tokens). Motion follows ADR 0065 phase 4 (no endless motion on operational screens, reduced motion respected).
- Code and identifiers in English; UI text in Spanish. Functional texts, routes and permissions are not changed without asking.

## Brand Commitments
- Name: **Quanela** (the repository is «Dark Kitchen»). Voice: plain, warm Spanish; says what happened and what to do next; never English technical errors.
- Mascot: the Quanela robot chef, with its expressions (`docs/brand/robot`, `public/robot`), used in messages and empty states (ADR 0060).
- Brand colors: orange `#F97316` (brasa), dark brown `#1C1310`, white; the landing uses a white ground with the brown and the orange. Logo and app icon in `docs/brand` and `public/brand`.

## Evidence on Hand
- Product screenshots and device mockups of the real app (`public/brand/app-tablero.webp`, `app-menu.webp`, landing hero art).
- Public plans and prices live in the database (`dk_plans`).
- **No customers, logos, testimonials or usage figures yet.** Nothing of that kind may be invented on the landing or anywhere else.

## Product Principles
1. The day comes first: anything on an operational screen must be readable at a glance and never move for decoration.
2. Honest data: a figure is real or shown as unknown («—»), never a convenient zero or an «all good» that is not true yet.
3. The AI recommends, the person decides; every suggestion says why.
4. One product: the same order, the same words and the same components in every view and role.
5. Each business sees only its own data; the design never blurs who and where you are (account, role, organization).

## Accessibility & Inclusion
WCAG AA contrast in the three themes, visible keyboard focus, 44 px touch targets on touch screens, reduced motion honored (ADR 0064, ADR 0065). Used on Safari iOS and Chrome Android phones and kitchen tablets.
