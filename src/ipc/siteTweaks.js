// ── Site tweaks ───────────────────────────────────────────────────────────────
// Per-host CSS that is injected into the player webview (and the pop-out
// window) to strip a streaming site down to just its player.
//
// Add a new entry to SITE_RULES to tweak another site. `hosts` matches the
// hostname itself and all its subdomains.

const SITE_RULES = [
  {
    // KinoHub: show only <section class="player_section"> (player picker +
    // the player). Everything else (header, actors, sequels, ...) is hidden.
    hosts: ["on.kinohub.vip"],
    css: `
      html, body {
        overflow: hidden !important;
        background: #000 !important;
      }
      /* Hide everything ... */
      body * {
        visibility: hidden !important;
      }
      /* ... except the player section and its content */
      .player_section,
      .player_section * {
        visibility: visible !important;
      }
      /* Let the player section fill the whole view */
      .player_section {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: none !important;
        margin: 0 !important;
        z-index: 2147483647 !important;
        background: #000 !important;
        overflow: auto !important;
      }
    `,
  },
];

function findRule(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  return (
    SITE_RULES.find((rule) =>
      rule.hosts.some((h) => host === h || host.endsWith("." + h)),
    ) ?? null
  );
}

/**
 * Attach the tweaks to a player webContents (webview or pop-out window).
 * CSS is (re)inserted after every navigation of the main frame.
 */
function attach(wc) {
  if (!wc || wc.isDestroyed()) return;

  const apply = () => {
    try {
      if (wc.isDestroyed()) return;
      const rule = findRule(wc.getURL());
      if (!rule) return;
      // "user" origin: !important beats the site's own !important rules
      wc.insertCSS(rule.css, { cssOrigin: "user" }).catch(() => {});
    } catch {}
  };

  // Early (right after the navigation committed) to avoid a visible flash,
  // plus dom-ready / in-page navigation as fallbacks (SPA route changes).
  wc.on("did-frame-navigate", (_e, _url, _code, _text, isMainFrame) => {
    if (isMainFrame) apply();
  });
  wc.on("dom-ready", apply);
  wc.on("did-navigate-in-page", apply);
}

module.exports = { attach, findRule, SITE_RULES };
