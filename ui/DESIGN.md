---
name: Dispatch Precision
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#434655'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#4b41e1'
  on-secondary: '#ffffff'
  secondary-container: '#645efb'
  on-secondary-container: '#fffbff'
  tertiary: '#005a82'
  on-tertiary: '#ffffff'
  tertiary-container: '#0074a6'
  on-tertiary-container: '#e4f2ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c3c0ff'
  on-secondary-fixed: '#0f0069'
  on-secondary-fixed-variant: '#3323cc'
  tertiary-fixed: '#c9e6ff'
  tertiary-fixed-dim: '#89ceff'
  on-tertiary-fixed: '#001e2f'
  on-tertiary-fixed-variant: '#004c6e'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-token:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: -0.02em
  label-status:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system is engineered for high-throughput productivity, tactical messaging management, and personalized bulk dispatch. It caters to marketers, community managers, customer relations teams, and solo operators who need to transform structured data (names, contact points, variables) into tailored outbound communications across platforms like KakaoTalk, Telegram, and SMS.

The aesthetic fuses **Utilitarian Minimalism** with high-density **Productivity SaaS** paradigms:
- **Tone:** Professional, precise, laser-focused, quiet confidence.
- **Emotional Response:** Control, zero-friction efficiency, clarity amidst dense data, tactile satisfaction during bulk operations.
- **Style Characteristics:** Crisp 1px structural hairpins, micro-interactions for clipboard and platform handoffs, unmistakable state differentiators, and optical breathing room despite high information density.

## Colors

The palette is anchored by deep slate neutrals and energized by precise electric indigo and cobalt blue accents. This provides a functional visual hierarchy where operations, variable tokens, and system feedback register instantly.

### Palette Architecture
- **Primary (`#2563eb` - Royal Blue):** Primary execution buttons, selected navigation states, interactive active tabs, and dynamic focus rings.
- **Secondary (`#4f46e5` - Indigo):** Variable tokens (e.g., `{이름}`, `{연락처}`), syntax highlighting, and batch selection controls.
- **Tertiary (`#0ea5e9` - Sky):** Real-time communication badges, payload previews, and auxiliary action indicators.
- **Neutral Surface & Canvas (`#0f172a` base):**
  - App Canvas Base: `#f8fafc` (Slate 50)
  - Pane Background: `#ffffff` (White)
  - Subtle Borders & Dividers: `#e2e8f0` (Slate 200)
  - Muted Text: `#64748b` (Slate 500)
  - Primary Text: `#0f172a` (Slate 900)

### Status & Channel Accents
- **Status - Ready/Pending (`대기중`):** Background `#fef3c7`, Text `#b45309`, Border `#fde68a` (Amber warm tier).
- **Status - Completed (`전송완료`):** Background `#ecfdf5`, Text `#047857`, Border `#a7f3d0` (Emerald cool tier).
- **Status - Failed (`전송실패`):** Background `#fef2f2`, Text `#b91c1c`, Border `#fecaca` (Rose alert tier).
- **Kakao Accent:** `#fee500` container with `#191919` text for target platform indicators.
- **Telegram Accent:** `#229ed9` badge fills and icon hints.

## Typography

Typography focuses on immediate scannability across dense tabular rows, message templates, and dynamic variable tokens:
- **Inter** provides exceptional clarity, neutral tone, and optimal legibility for UI labels, preview message bodies, and navigation. In environments where Korean characters are standard, font fallbacks resolve gracefully to Pretendard and system apple-system/Malgun Gothic.
- **JetBrains Mono** is reserved strictly for syntax tokens (`{이름}`, `{phone_number}`), recipient index counters, character tallies (`24/2,000자`), and timestamp logs. Its fixed-width character geometry provides structural contrast against narrative message prose.

## Layout & Spacing

The system implements a **Split-Screen Studio Layout** optimized for desktop and widescreen productivity displays.

### Workspace Blueprint
- **Primary Split Layout (Desktop >= 1024px):**
  - **Left Pane (50% or 580px fixed minimum):** Data ingestion, template editor, variable shelf, and recipient directory grid.
  - **Right Pane (Flex remainder):** Live preview canvas, bulk generation stream, platform-specific chat bubbles (Kakao bubble layout, Telegram channel format), and single/batch execution dock.
- **Header Dock:** Fixed 56px height with breadcrumb pathing, target channel toggles, and global status tallies.
- **Mobile/Tablet Reflow (< 1024px):** Converts from side-by-side to stacked view with an omnipresent segmented controller bar (`[ 편집기 | 미리보기 (124) ]`) anchored directly below the header.

### Spacing Cadence
A 4px baseline rhythm is enforced throughout:
- Micro-spacing (`space-xs`: 4px, `space-sm`: 8px) controls variable tag chips, icon-to-label gaps, and compact list metadata.
- Macro-spacing (`space-md`: 12px, `space-lg`: 20px, `space-xl`: 32px) defines pane interior padding, card separations, and section breaks.

## Elevation & Depth

Visual hierarchy uses crisp, structured **Low-Contrast Outlines** combined with subtle ambient micro-shadows. The interface avoids aggressive drop-shadows to ensure high text legibility and clean separation in data-dense scenarios.

### Surface Hierarchy
1. **Canvas Base (`#f8fafc`):** Sits at the floor of the viewport.
2. **Panels & Columns (`#ffffff`):** Outlined with `1px solid #e2e8f0`.
3. **Card Modules & Inputs:** Framed by `1px solid #cbd5e1`, shifting on active focus to `1.5px solid #2563eb` with a tinted aura: `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12)`.
4. **Floating Action Controls & Quick Docks:** Elevated with an ambient split shadow: `0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04)`.
5. **Modal Overlays & Drawers:** High elevation with `0 20px 25px -5px rgba(15, 23, 42, 0.12)` paired with a frosted backdrop (`backdrop-filter: blur(4px); background: rgba(15, 23, 42, 0.25)`).

## Shapes

The design uses a **Soft** shape archetype (`roundedness: 1` / 4px base radius) to balance modern aesthetic appeal with dense desktop efficiency.

- **Badges, Tags, & Variable Tokens:** 4px radius (`0.25rem`). Maintains horizontal density and aligns with monospaced text.
- **Form Inputs & Action Buttons:** 6px radius. Provides comfortable touch/click targets without encroaching on layout lines.
- **Chat Bubbles & Preview Modules:** 8px to 12px radius with directional tail notches adhering to the respective target platforms (e.g., KakaoTalk 12px rounded bubble with sharp sender corner).
- **Split Panes & Modal Windows:** 8px radius (`0.5rem`).

## Components

### Variable Badges & Chips
- **Variable Tokens (`{이름}`, `{연락처}`):** Rendered in `JetBrains Mono` font. Background `#eef2ff`, border `1px solid #c7d2fe`, text `#4338ca`. Includes a micro hover lift and one-click insertion trigger into the active cursor position of the template textarea.
- **Platform Badges:** Compact pill indicators for target destinations (e.g., Kakao Yellow badge `#fee500`, Telegram Sky badge `#e0f2fe`).

### Template Input & Textarea
- Multi-line message canvas with line numbers and dynamic cursor detection.
- Real-time syntax highlighting for enclosed `{bracket}` expressions.
- Integrated variable tray docked immediately above the keyboard/focus area for rapid macro insertion.

### Utility Buttons & Clipboard Interactions
- **Copy Action Button:** Features a tactile dual-state transition:
  - Default: Slate ghost outline with clipboard SVG icon.
  - Copied State: Instant transformation to Emerald solid background (`#10b981`), white text, checkmark SVG icon, and a brief 250ms scale pulse (`transform: scale(1.04)`), auto-reverting after 1.8 seconds.
- **Quick SNS Trigger Buttons:**
  - `카카오톡 전송`: High-visibility button with warm yellow accent, linking to platform URI schemes or API triggers.
  - `텔레그램 발송`: Sky-blue utility button with immediate progress ring feedback.

### Status Indicators (`전송완료`, `대기중`)
- Designed as 20px height micro-badges:
  - **대기중 (Pending):** Neutral/warm muted pill with a subtle 6px pulsing dot indicator (`animation: pulse 2s infinite`).
  - **전송완료 (Completed):** Crisply bounded green badge with a clean hairline checkmark.
  - **전송실패 (Failed):** Alert red badge paired with a click-to-retry icon.

### Recipient List & Data Table
- Ultra-condensed row heights (36px–40px) with sticky column headers.
- Built-in checkbox selection with row-level individual preview triggers.
- Monospaced numeric alignment for phone numbers and IDs.