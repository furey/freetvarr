export const hostRefusedPage = ({ name, directUrl }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<meta name="robots" content="noindex, nofollow">
<title>Hostname not allowed · Freetvarr</title>
<link rel="icon" href="${FAVICON}">
<style>${STYLES}</style>
</head>
<body>
<main>
<span class="chips" aria-hidden="true"><span></span><span></span><span></span></span>
<h1>Hostname not allowed</h1>
<p>${openedLineOf(name)} Freetvarr refuses hostnames that are not on its Allowed hostnames list. This stops other websites from reaching it through your browser.</p>
${directUrl ? directLinkOf(directUrl) : ''}
<h2>Keep using this name</h2>
<ol>
<li>Open Freetvarr by its IP address.</li>
<li>Go to Settings → SYSTEM → Setup → <strong>Allowed hostnames</strong>.</li>
${name ? `<li>Add <code>${escapeHtml(name)}</code>.</li>` : '<li>Add the name you use.</li>'}
</ol>
<h2>Home Screen app</h2>
<p>A Home Screen app has no address bar. Add this name from another device, or remove the icon and add Freetvarr to the Home Screen again from its IP address.</p>
</main>
</body>
</html>
`

const openedLineOf = (name) => (name
  ? `You opened Freetvarr as <code>${escapeHtml(name)}</code>.`
  : 'Your request reached Freetvarr through a proxy that sent an empty hostname.')

const directLinkOf = (directUrl) => {
  const href = escapeHtml(directUrl)
  const label = escapeHtml(directUrl.replace(/^http:\/\//, '').replace(/\/$/, ''))
  return `<p><a class="button" href="${href}">Open ${label}</a></p>`
}

const FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#141c24"/><rect x="2" y="14" width="8" height="4" fill="#3ba4ff"/><rect x="12" y="14" width="8" height="4" fill="#f28c28"/><rect x="22" y="14" width="8" height="4" fill="#f5c542"/></svg>')}`

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char])

const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

const STYLES = `
:root {
  color-scheme: dark;
  --bg: #0b1117;
  --surface: #141c24;
  --hairline: rgba(255, 255, 255, 0.08);
  --text-1: #f2f5f7;
  --text-2: #a9b4be;
  --code-bg: rgba(255, 255, 255, 0.06);
  --primary: #5ce1c6;
  --primary-hi: #8bebd7;
  --on-primary: #04201a;
}
@media (prefers-color-scheme: light) {
  :root {
    color-scheme: light;
    --bg: #eef2f5;
    --surface: #ffffff;
    --hairline: rgba(11, 17, 23, 0.1);
    --text-1: #0b1117;
    --text-2: #4b5864;
    --code-bg: rgba(11, 17, 23, 0.06);
    --primary: #5ce1c6;
    --primary-hi: #46cfb3;
    --on-primary: #04201a;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
  background: var(--bg);
  color: var(--text-1);
  font: 15px/22px "Figtree", system-ui, -apple-system, "Segoe UI", sans-serif;
}
main {
  width: 100%;
  max-width: 560px;
  padding: 28px 24px;
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: 20px;
}
.chips { display: flex; gap: 6px; margin-bottom: 20px; }
.chips span { width: 22px; height: 8px; border-radius: 2px; }
.chips span:nth-child(1) { background: #3ba4ff; }
.chips span:nth-child(2) { background: #f28c28; }
.chips span:nth-child(3) { background: #f5c542; }
h1, h2 { text-wrap: balance; margin: 0; }
h1 { font-size: 28px; line-height: 34px; font-weight: 800; letter-spacing: -0.01em; }
h2 { font-size: 17px; line-height: 24px; font-weight: 700; margin-top: 28px; }
p, li { text-wrap: pretty; color: var(--text-2); }
p { margin: 12px 0 0; }
ol { margin: 10px 0 0; padding-left: 22px; }
li + li { margin-top: 6px; }
strong { color: var(--text-1); font-weight: 600; }
code {
  font: 500 13.5px/1 "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text-1);
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 6px;
  overflow-wrap: anywhere;
}
.button {
  display: inline-block;
  margin-top: 8px;
  padding: 10px 18px;
  border-radius: 999px;
  background: var(--primary);
  color: var(--on-primary);
  font-weight: 700;
  text-decoration: none;
  overflow-wrap: anywhere;
}
.button:hover { background: var(--primary-hi); }
.button:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
`
