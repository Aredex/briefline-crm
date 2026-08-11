# PH-11 QA-008 — Browser Matrix

**Date:** 2026-08-11
**Status:** Documented

---

## Supported Browsers

La aplicación usa Vite 8 con React 19, sin targets explícitos de navegadores (Vite por defecto apunta a navegadores modernos con soporte de ES modules).

| Browser | Minimum Version | Status | Notes |
|---|---|---|---|
| Chrome | 120+ (Dec 2023) | ✅ Supported | Latest 2 stable: 131, 130 |
| Firefox | 128+ (Jul 2024) | ✅ Supported | Latest 2 stable: 134, 133 |
| Safari | 17.2+ (Dec 2023) | ✅ Supported | Latest 2 stable: 18.2, 18.1 |
| Edge | 120+ (Dec 2023) | ✅ Supported | Latest 2 stable: 131, 130 (Chromium) |

---

## Feature Compatibility

| Feature | Chrome | Firefox | Safari | Edge | Notes |
|---|---|---|---|---|---|
| ES Modules | ✅ | ✅ | ✅ | ✅ | Base Vite requirement |
| CSS Custom Properties | ✅ | ✅ | ✅ | ✅ | Design tokens dependency |
| `:focus-visible` | ✅ | ✅ | ✅ | ✅ | A11y contract |
| `prefers-reduced-motion` | ✅ | ✅ | ✅ | ✅ | Motion respect |
| `AbortSignal` (fetch) | ✅ | ✅ | ✅ | ✅ | API client cancellation |
| `URLSearchParams` | ✅ | ✅ | ✅ | ✅ | Query string building |
| `Array.from` | ✅ | ✅ | ✅ | ✅ | Focus trap |
| `React.createPortal` | ✅ | ✅ | ✅ | ✅ | Dialog/Drawer |
| dnd-kit (Pointer Events) | ✅ | ✅ | ✅ | ✅ | Kanban DnD |
| HttpOnly Cookies | ✅ | ✅ | ✅ | ✅ | JWT session |
| `credentials: 'include'` | ✅ | ✅ | ✅ | ✅ | API client |
| `JSON.stringify` | ✅ | ✅ | ✅ | ✅ | API request body |

---

## Known Limitations

| Issue | Browsers Affected | Severity | Mitigation |
|---|---|---|---|
| `HTMLCanvasElement.getContext()` not implemented in jsdom | All (test only) | Low | Tests skip canvas, app doesn't use it |
| `window.location.assign` non-writable in jsdom | All (test only) | Low | AuthProvider uses router navigation; API client guards with try/catch |
| `::-webkit-scrollbar` styling | Firefox | Low | Firefox uses `scrollbar-width`/`scrollbar-color` — not implemented (cosmetic) |
| Dark mode (`prefers-color-scheme`) | All | Note | Not implemented — out of scope for MVP |

---

## Mobile Browsers

| Browser | OS | Status | Notes |
|---|---|---|---|
| Safari iOS | iOS 17.2+ | ✅ Expected | Same engine as desktop Safari |
| Chrome Android | Android 14+ | ✅ Expected | Same engine as desktop Chrome |
| Firefox Android | Android 14+ | ✅ Expected | Same engine as desktop Firefox |

---

## Testing Evidence

- **Automated:** Playwright E2E tests run on Chromium (default)
- **Manual verification required for:** Firefox, Safari, mobile Safari
- **Recommendation:** CI should run Playwright on `chromium`, `firefox`, and `webkit` projects (see PH-12 CI config)
