# Kymo — canonical design system

This is the single source of truth for colors, type, spacing, and motion. Earlier prompts in this build used slightly inconsistent values as the system evolved — this file resolves those and supersedes any hex value or rule mentioned elsewhere that conflicts with it. When in doubt, this file wins.

## 1. Color

Paste directly as CSS custom properties:

```css
:root {
  /* surfaces */
  --bg-canvas: #18140F;
  --bg-surface: #211C16;
  --bg-surface-raised: #25201A;

  /* borders */
  --border-default: #332C22;
  --border-strong: #443C30;   /* hover, focus, active dividers */

  /* text */
  --text-primary: #F2ECE2;
  --text-secondary: #9C9286;
  --text-quiet: #6E665B;

  /* accent + status */
  --accent: #E2692F;          /* the one accent color in the app — see note below */
  --success: #2DD4A7;
  --error: #F2545B;

  /* type */
  --font-ui: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

**Retire and stop using:** `#2A2B33`, `#1C1D24`, `#14151A`, `#FF6B35`, `#E2562B` — these are from earlier rounds of this system, before being corrected against the actual production build.

**Note on `--accent`:** `#E2692F` is a visual estimate read from a screenshot of the live build, not a measured value — screenshots compress and shift color slightly. Confirm the exact value via devtools (inspect a button, copy the computed `background-color`) and update this file if it differs even slightly. Until then, treat this as provisional, not final.

### Content-type tint convention (confirmed, keep using)

The capability cards' visual blocks are intentionally tinted per content type rather than one flat neutral. This is correct and should be the standard going forward:

| Card type | Visual block background |
|---|---|
| Video | `#2A241C` (warm neutral) |
| Audio | `#1F2E26` (muted green) |
| Thumbnail | `#3A2E22` (warm brown — reads as "photo") |
| Metadata | `#25201A` (neutral, same family as bg-surface-raised — it's data, not an image) |

## 2. Typography

- UI text (labels, body, buttons, titles): Inter, weights 400 and 500 only — never 600/700, they read too heavy against this palette.
- Numeric/data text (durations, dates, counts, file sizes, extensions, resolutions): JetBrains Mono, always, everywhere a number or file extension appears.
- Emphasis convention: there is no separate display typeface. Emphasis is italic Inter at one size step up — e.g. "Full *video*", the swapped headline word. Don't introduce another font family for this.
- Scale: 11px (smallest allowed) / 12px (metadata, captions) / 13-14px (body/UI default) / 18-19px (card/section titles) / 27-30px (the main headline only).

### Exact font loading (Next.js)

Load both via `next/font/google` so they're self-hosted with no layout shift, wired to the same CSS variable names already used throughout this file:

```ts
// app/layout.tsx
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-ui' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

// applied on <html> or <body>:
// className={`${inter.variable} ${jetbrainsMono.variable}`}
```

Then `font-family: var(--font-ui)` / `var(--font-mono)` everywhere. Note: in any demo mockup Claude has rendered in chat, only the explicitly-mono elements had a font-family set at all — the regular UI text rendered in Claude's own interface default font, not a verified Inter render. This file's stated decision (Inter for UI) is the actual spec; don't try to visually reverse-engineer the body font from a screenshot of one of those demos.

## 3. Iconography and motifs — meaning matters here, not just style

- **Logo**: the wave glyph (provided as `kymo-mark.svg` / `kymo-favicon.svg`). Wordmark "Kymo" in Inter 500, never baked into the SVG as text.
- **Corner-bracket mark has two distinct uses — keep them visually distinct from each other:**
  - *Decorative/brand* (capability cards, any non-interactive context): **one** corner only (top-left), quiet, low-key. This is a brand flourish, not a signal.
  - *Functional/selection* (video grid cards that can actually be selected): full accent-color border (2px) + the bracket treatment + a tint overlay. This means "chosen."
  - Don't use the full 4-corner bracket treatment decoratively (e.g. on a capability card) — it visually overloads the same motif that means "selected" elsewhere in the app, and undermines it as a meaningful signal.
- **Mono numerals rule**: any number, anywhere, is in `--font-mono`. No exceptions — this is one of the few totally hard rules in the system.
- **Sentence case, always.** No ALL CAPS labels anywhere (e.g. it's "Presets," never "PRESETS:").

## 4. Spacing, radius, elevation

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48px. No arbitrary values outside this.
- Radius: 8-9px for cards/inputs, 12px for the dock/modals, 999px (pill) for badges and chips.
- **No box-shadow, anywhere, full stop.** This has regressed multiple times already — borders only (1px default, 2px for selected/active states). If a shadow shows up again, it's being inherited from a shared/default component class, not a one-off mistake — check the shared component, not just the instance.

## 5. Motion

- Standard transition: 120-160ms, ease-out, for hover/focus/selection state changes.
- The full GSAP entrance choreography (flash + ripple + staggered reveal) plays once per session only (sessionStorage-gated) — never on every visit.
- Headline word-swap: scramble-decode effect (plain textContent swapping on an interval, no SplitType, no per-character DOM elements) + a hand-drawn wave underline (SVG stroke-dasharray/dashoffset draw technique). 2-second hold between swaps.
- Respect `prefers-reduced-motion` everywhere motion is added: drop scramble/blur/spring effects in favor of plain opacity cross-fades.

## 6. Icons

Your stack already specifies `lucide-react` (see the original project plan) — use that, not Tabler. Any icon seen in a Claude-rendered demo of this app is a Tabler Icons class (`ti ti-*`), used only because that's what's available in Claude's own rendering environment. Direct `lucide-react` equivalents for every icon that's appeared so far:

| Seen in demos (Tabler) | Use instead (lucide-react) |
|---|---|
| `ti-link` | `Link` |
| `ti-chevron-down` | `ChevronDown` |
| `ti-chevron-up` | `ChevronUp` |
| `ti-chevron-right` | `ChevronRight` |
| `ti-plus` | `Plus` |
| `ti-x` | `X` |
| `ti-trash` | `Trash2` |
| `ti-download` | `Download` |
| `ti-rosette-discount-check-filled` | `BadgeCheck` |

The brand-specific glyphs (the wave logo, the corner-bracket mark, the play-triangle, the waveform tick) are custom SVGs either already delivered as files (`kymo-mark.svg`, `kymo-favicon.svg`) or given as inline path data in earlier prompts — those aren't from any icon library and should be kept as standalone SVG components, not swapped for a library icon.

## 7. What's Claude's, not yours

Every demo Claude has rendered in this chat sits inside a neutral card frame using Claude's own interface tokens (things like `var(--surface-1)`, `var(--border)`, `var(--text-muted)`) — that frame exists only so the mockup displays cleanly inside Claude's chat UI and has no equivalent in your Next.js app. Everything *inside* that frame — the literal hex values, fonts, icons, spacing — is what's actually yours, and is what this entire file documents. If something in a demo doesn't have a literal value specified anywhere above it, it's chrome, not spec.

## 8. Known deviations from earlier specs (intentionally not adopted)

- An early version of this system floated a separate display typeface ("Cabinet Grotesk" or similar) for headings. This was never actually built — italic Inter is what shipped, and it works. Don't reintroduce a second display font.
