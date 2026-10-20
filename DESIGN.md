---
name: Quanela
description: The operation of a food business in one calm, fast-reading place — the kitchen pass, as software.
colors:
  ember: "#f97316"
  action: "#fafafa"
  action-hover: "#e5e5e5"
  action-active: "#d4d4d4"
  on-action: "#0a0a0a"
  focus-dark: "#fafafa"
  focus-light: "#252525"
  night-canvas: "#0a0a0a"
  night-surface: "#171717"
  night-raised: "#262626"
  night-line: "#404040"
  smoke-text: "#fafafa"
  ink: "#f5f5f5"
  ash-text: "#a3a3a3"
  ash-muted: "#858585"
  paper-canvas: "#f5f5f5"
  linen-canvas: "#f2f0ed"
  roast-brown: "#1C1310"
  landing-ground: "#FFFFFF"
  landing-field: "#F3F2F0"
  success: "#34d399"
  warning: "#fbbf24"
  danger: "#f87171"
  info: "#38bdf8"
typography:
  landing-display:
    fontFamily: "Nunito, ui-rounded, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(26px, 2.4vw, 36px)"
    fontWeight: 900
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.025em"
    fontFeature: "'cv11', 'ss01'"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.55
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "0.025em"
  micro:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.05em"
rounded:
  field: "8px"
  card: "16px"
  pill: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-primary-active:
    backgroundColor: "{colors.action-active}"
  button-secondary:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.smoke-text}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.smoke-text}"
    rounded: "{rounded.field}"
    padding: "10px 14px"
  card:
    backgroundColor: "{colors.night-surface}"
    rounded: "{rounded.card}"
    padding: "24px"
  chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.night-canvas}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  chip:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.ash-text}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
---

# Design System: Quanela

## Overview

**Creative North Star: "The Kitchen Pass"**

The pass is the counter between the kitchen and the dining room: dark, ordered, lit only where something is ready to go. Quanela reads the same way. Most of the screen is a quiet night surface; information sits in hairline-bordered cards and tables; the brightest ink appears only where the person has to act or where something needs them. An owner glances and knows the state of the day; a cook glances and knows the next plate.

The system is dense but never cramped, and calm by default. Hierarchy comes from type weight, a strict text-color ladder and spacing, not from color or decoration. Three themes (dark by default, light and a warm neutral) are the same system: the neutral scale is remapped per theme and every semantic token follows it. The mascot, the Quanela robot chef, carries personality in messages and empty states so the working surfaces do not have to.

The operational screens (the Centro de operaciones) are the strictest part of the system: nothing moves for decoration, every figure is real or shown as «—», and the same order looks the same in every view. The public landing is a different surface (a white world with the brand brown and orange): it follows the brand colors and the logo here and its own composition in ADR 0068 (the split stage, «La comanda que viaja»).

**Key Characteristics:**
- Night surfaces with hairline borders; depth by tone, shadow only on what floats.
- One range: the theme's ink for action, focus, live state and selection; ember orange only for the brand (ADR 0073).
- Inter with tabular figures; small type set with uppercase micro-labels.
- Pills for actions and filters, softly rounded cards, gently rounded fields.
- Light, dark and neutral themes from one token set; AA contrast in all three.

## Colors

A monochrome night palette: actions in the theme's ink, four quiet state colors, and the warm ember kept for the brand.

### Primary
- **Action** (#fafafa on dark, the inverted neutral-50 on the light themes): the action color (ADR 0073). The primary button, the switch when on, unread counters, links, active states and the focus ring, with the page color as text (Night Canvas on white reads at 19:1). Hover and press step one neutral shade (200 / 300).
- **Ember** (#f97316): the brand's own orange, for the brand only: the «q» of the wordmark, the login panel, the landing and the welcome. Never in the app's controls.

### Neutral
- **Night Canvas** (#0a0a0a): the page ground on the dark theme.
- **Night Surface** (#171717): cards, fields, menus, dialogs.
- **Night Raised** (#262626): hover rows, the highlighted option, subtle fills.
- **Night Line** (#404040): strong borders; hairlines use the surface step at 60–80 % opacity.
- **Ink** (#f5f5f5): the selected chip, segment or pill tab, with Night Canvas text: the inverted neutral, so it inverts again on the light themes. A filter at rest is a selection, not an action.
- **Smoke Text** (#fafafa), **Ash Text** (#a3a3a3), **Ash Muted** (#858585): the three text levels — primary, secondary, metadata. Muted text reaches 4.5:1 on cards.
- **Paper Canvas** (#f5f5f5) and **Linen Canvas** (#f2f0ed): the grounds of the light and the warm neutral themes.
- **Roast Brown** (#1C1310): the brand's own brown; on the landing, the stage of the order and the largest plan.
- **Landing White** (#FFFFFF) and **Landing Stone** (#F3F2F0): the landing's ground and its one panel tone, a step off the white with almost no chroma; the landing only.

### Tertiary (states)
- **Success** (#34d399), **Warning** (#fbbf24), **Danger** (#f87171), **Info** (#38bdf8): badges, notices and figure tones, always as text on a 15 % tint of themselves. Light themes swap them for their 800-tone equivalents.

### Named Rules
**The One Range Rule** (ADR 0073, it replaces The One Ember Rule). The app speaks in one range: the neutral scale of its theme. Action, focus, live state and selection use the theme's ink; the four state colors keep their meaning; orange belongs to the brand, never to a control.

**The Honest Zero Rule.** A figure that is not known yet is «—» in a muted tone, never a 0 and never a green «all good».

## Typography

**Body Font:** Inter (with ui-sans-serif, system-ui, -apple-system), with the `cv11` and `ss01` features on.

**Character:** One neutral grotesque, tightened for headings and set with tabular figures wherever numbers line up. The voice comes from weight and color steps, not from a second family.

**Landing Display Font:** Nunito (700–900, rounded like the logo), loaded only on the public landing for the name, headings and prices; its text stays in Inter. Nunito never appears in the app.

### Hierarchy
- **Display** (600, 1.875–2.25rem, tight tracking): the one headline figure of a summary (sales today, inventory value).
- **Headline** (600, 1.5rem, tight tracking, balanced wrap): the page title, once per page, in the page header.
- **Title** (600, 1.125rem): section titles; card titles step down to 0.875rem semibold.
- **Body** (400, 0.875rem): the default text of the app, tables and forms included.
- **Label** (500, 0.75rem, uppercase, 0.025em): form labels and table headers.
- **Micro** (600, 0.6875rem, uppercase, 0.05em): overlines, small badges and counters. Nothing in the interface goes below 11 px.

### Named Rules
**The Tabular Rule.** Every number that can be compared — money, counts, times, quantities — uses tabular figures and is formatted (`$99.900`, `12,5 kg`), never raw.

## Layout

The app is a fixed shell: a compact 64 px icon rail on desktop, a top bar on phones, and a scrolling main area with 16 / 24 / 32 px margins by breakpoint (sm 640 px, md 768 px, lg 1024 px). Pages are left-aligned at full width with blocks 24 px apart; the page header answers where you are, what you see and what you can do, with the primary action at the right.

Two page shapes exist: **board** (full height, content scrolls inside: the operation board, master–detail screens; never shorter than 34 rem) and **default** (the page scrolls). On phones, filters become single sliding rows, tables keep only the essential columns, board columns snap one at a time with a peek of the next, and menus become bottom sheets.

## Elevation & Depth

Flat by default, layered by tone: canvas → surface → raised. Borders are hairlines (the surface step at reduced opacity). Shadows exist only for what floats above the page and are deep and soft so they read on near-black.

### Shadow Vocabulary
- **Card** (`0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.5)`): the rare card that must lift (a featured plan).
- **Float** (`0 12px 40px -8px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)`): menus, popovers, toasts, dialogs, drawers.

### Named Rules
**The Only-What-Floats Rule.** A surface that stays in the flow of the page has no shadow. Shadow means «this is above the page and will go away».

## Shapes

Three radii, each with one job: fields at 8 px (a precise, gentle corner), cards, tables and dialogs at 16 px (a soft container), and pills for everything you press or toggle — buttons, chips, segmented controls, counters. Icons are Lucide at 14–18 px on 1.5–2 px strokes. Status is a 6 px dot or a tinted pill, never a thick colored side stripe.

## Components

Precise and calm: thin borders, quiet fills, the accent reserved for the one action that matters.

### Buttons
- **Shape:** pill (9999px); 32 / 40 / 44 px tall (sm / md / lg), growing to 40 / 44 px on touch screens.
- **Primary:** the theme's ink (white on dark, near-black on light) with the page color as text; hover and press step one shade; one per view.
- **Secondary:** night surface with a hairline border; **Ghost:** text only, a raised fill on hover; **Danger:** a translucent red tint with red text; **Link:** ink text with an underline on hover.
- **Feedback:** 150 ms color transitions; pressing scales to 0.97. Focus is a 2 px ring in the focus token with a 2 px offset.

### Chips
- **Style:** pills with micro-text counts; inactive on the night surface with secondary text, active in Ink with Night Canvas text (the same fill for segmented controls and pill tabs). Long labels truncate inside the pill.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** night surface at 60 % over the canvas.
- **Shadow Strategy:** none (see Elevation).
- **Border:** hairline (surface step at 60 %).
- **Internal Padding:** 20 px, 24 px from sm.

### Inputs / Fields
- **Style:** night surface, a 3:1 border (#6b6b6b on dark), 8 px corners, 10 × 14 px padding, 16 px text on iOS so focus never zooms.
- **Focus:** the border turns to the focus color with a 25 % focus ring.
- **Error / Disabled:** a red border and a red ring on `aria-invalid`; disabled at 50 % opacity.

### Navigation
- **Style:** the desktop rail shows icons only with a tooltip and an ink tile for the active section; sections inside a module use an underlined tab bar anchored left; on phones the rail becomes a drawer and the user, notification and account menus become bottom sheets.

### Order card (signature component)
The card of the operation board: the dishes first (one per line in the Cocina view), notes in warning tone, then «#number · time» with the time colored by its SLA tier, and the next step as a labelled pill button. A 2 px left stripe carries the time or priority state and never changes on hover.

## Do's and Don'ts

### Do:
- **Do** keep the app in one range: actions, focus and live state in the theme's ink (The One Range Rule).
- **Do** keep orange for the brand (logo, landing, welcome); never as a button, link or active state.
- **Do** show unknown figures as «—» and empty or failed states with what happened and what to do next.
- **Do** use the shared components in `src/shared/ui` (Button, Card, DataTable, Badge, Modal, Drawer, StatCard, EmptyState) instead of hand-made variants.
- **Do** honor reduced motion: transitions keep only a short fade, nothing moves.

### Don't:
- **Don't** animate anything endlessly on an operational screen (no pulsing «live» dots, no count-up numbers).
- **Don't** put white text on #f97316 or invent new sizes below 11 px.
- **Don't** add shadows to cards that stay in the page, gradients on text, decorative glass or eyebrow labels above headings.
- **Don't** use a colored side border thicker than the 2 px state stripe of the order card.
- **Don't** invent customers, figures or testimonials anywhere in the product or the landing.
