# UI standards

The rules the interface follows. Every value lives as a token at the top of `public/styles.css`; use a token, not a new number.

| Area | Rule |
| --- | --- |
| Spacing | 4px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48 (`--s1` to `--s12`). No other padding, margin or gap values. |
| Type sizes | 12, 14 (body), 16, 20, 24, 32 (`--t-xs` to `--t-2xl`). Nothing below 12px, including map labels. |
| Type weights | 400, 500, 600. Line height 1.5 for text, 1.25 for headings and chips. |
| Small caps labels | 12px, weight 500, 0.08em tracking, via `.eyebrow`, `.overline`, table headers and toolbar labels. |
| Text colour | `--ink`, `--text-2`, `--muted` only. Each is at least 4.5:1 on white, on `--paper` and on `--soft`. |
| Control borders | Inputs, selects and the search box use `--line-control` (at least 3:1 on white). |
| Status colour | `--success`, `--warning`, `--danger`, each with its `-soft` background. Never colour alone: pair with text. |
| Radius | 4px chips, 8px controls and cards, 12px panels and dialogs. |
| Icons | Material Symbols Outlined from `public/vendor/material-symbols.js`, called by their Material name: `icon('location_on')`. 20px default, 18px in small buttons, 24px in empty states and the phone navigation. Decorative, so always `aria-hidden`; an icon-only button needs an `aria-label`. |
| Targets | Controls are 40px high (32px small) on desktop and 44px at 800px wide and below. |
| Map labels | Drawn at a constant 12px on screen at any width or zoom; a label is hidden when its region is too small to hold it. Label colour is chosen for contrast against the region fill. |
| Map legend | The count ramp uses the same colour function as the map (`countColor`). |

Project palettes and legend colours are user data, not UI tokens.

To add an icon, copy the path from the official 24px outlined SVG into `public/vendor/material-symbols.js`. Icons are inlined rather than loaded as a font because the standalone preview must work offline and the server's content security policy allows no external sources.
