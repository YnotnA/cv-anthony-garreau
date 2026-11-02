// Construit la version publique (docs/) et, si private/private.json existe,
// le PDF complet à envoyer aux recruteurs (private/, jamais versionné).
import { readFile, writeFile, access, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import QRCode from 'qrcode';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const exists = (p) => access(p).then(() => true, () => false);

const PUBLIC_TOKENS = { client_luminess: 'pour une administration publique', camping_lieu: 'Morbihan' };
const PDF_NAME = 'cv-anthony-garreau.pdf';
const SITE_URL = 'https://ynotna.github.io/cv-anthony-garreau/';

function fill(text, tokens) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in tokens)) throw new Error(`Jeton inconnu : ${k}`);
    return tokens[k];
  });
}

function render(c, { tokens, priv, photo, fontBase, qr }) {
  const t = (s) => esc(fill(s, tokens));
  const experiences = c.experiences.map((e) => {
    const where = [e.org, e.place && fill(e.place, tokens)].filter(Boolean).map(esc).join(', ');
    return `<article class="job">
      <time>${esc(e.dates)}</time>
      <div class="job-body">
        <h3>${esc(e.role)}${where ? ` <span class="org">${where}</span>` : ''}</h3>
        <p>${t(e.text)}</p>${e.points ? `<ul>${e.points.map((p) => `<li>${t(p)}</li>`).join('')}</ul>` : ''}
      </div>
    </article>`;
  }).join('\n');
  const contact = priv
    ? `<a href="tel:${esc(priv.phone.replace(/\s/g, ''))}">${esc(priv.phone)}</a><a href="mailto:${esc(priv.email)}">${esc(priv.email)}</a><span>${esc(priv.location)}</span><span>${esc(c.license)}</span>`
    : `<span>${esc(c.location)}</span><span>${esc(c.license)}</span>`;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(c.name)} - ${esc(c.title)}</title>
<style>
@font-face { font-family: "Open Sans"; src: url("${fontBase}OpenSans-Regular.ttf"); font-weight: 400; }
@font-face { font-family: "Open Sans"; src: url("${fontBase}OpenSans-Semibold.ttf"); font-weight: 600; }
@font-face { font-family: "Open Sans"; src: url("${fontBase}OpenSans-Bold.ttf"); font-weight: 700; }
:root { color-scheme: light; --bg: #f6f8f7; --card: #fff; --ink: #22302f; --body: #3b4948; --soft: #566462; --accent: #0f6b62; --tint: #eef5f3; --line: #d8e3e0; --btn: #0f6b62; --btn-hover: #0b544d; --shadow: rgba(20,50,45,.1); }
@media screen and (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; --bg: #111716; --card: #1a2221; --ink: #e6eeec; --body: #c5d1ce; --soft: #9fb0ac; --accent: #62cdbf; --tint: #243130; --line: #354442; --btn: #12776d; --btn-hover: #178a7e; --shadow: rgba(0,0,0,.4); }
}
@media screen {
  :root[data-theme="dark"] { color-scheme: dark; --bg: #111716; --card: #1a2221; --ink: #e6eeec; --body: #c5d1ce; --soft: #9fb0ac; --accent: #62cdbf; --tint: #243130; --line: #354442; --btn: #12776d; --btn-hover: #178a7e; --shadow: rgba(0,0,0,.4); }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 16px/1.55 "Open Sans", system-ui, sans-serif; }
.page { max-width: 1080px; margin: 32px auto; background: var(--card); padding: 56px 72px; border-radius: 12px; box-shadow: 0 1px 4px var(--shadow); }
header { display: flex; gap: 24px; align-items: center; }
header .id { flex: 1; min-width: 0; }
.photo { width: 104px; height: 104px; border-radius: 50%; object-fit: cover; object-position: center 20%; flex: none; }
h1 { margin: 0; font-size: 2.1rem; line-height: 1.2; font-weight: 700; }
.title { margin: 4px 0 0; color: var(--accent); font-size: 1.15rem; font-weight: 600; }
.title small { margin-left: .6em; color: var(--soft); font-size: .95rem; font-weight: 400; }
.contact { display: flex; flex-wrap: wrap; gap: 2px 18px; margin-top: 10px; color: var(--soft); font-size: .88rem; }
.contact a { color: inherit; text-decoration: none; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 16px; }
.page { position: relative; }
.theme { position: absolute; top: 20px; right: 20px; display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
.theme[hidden] { display: none; }
.theme button { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 7px; background: none; color: var(--soft); cursor: pointer; }
.theme button:hover { color: var(--ink); }
.theme button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.theme button[aria-pressed="true"] { background: var(--tint); color: var(--accent); }
.download { display: inline-block; padding: 10px 18px; border-radius: 8px; background: var(--btn); color: #fff; font-weight: 600; font-size: .92rem; text-decoration: none; }
.download:hover, .download:focus-visible { background: var(--btn-hover); }
.summary { margin: 22px 0 0; font-size: 1.02rem; }
h2 { margin: 28px 0 12px; padding-bottom: 5px; border-bottom: 2px solid var(--line); color: var(--accent); font-size: 1rem; font-weight: 700; letter-spacing: .02em; }
.strengths { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.strength { padding: 12px 14px; background: var(--tint); border-radius: 8px; font-size: .87rem; line-height: 1.45; }
.strength strong { display: block; margin-bottom: 3px; font-size: .95rem; }
.timeline { --date: 9.2em; }
.job { display: grid; grid-template-columns: var(--date) 1fr; column-gap: 18px; break-inside: avoid; }
.job time { padding-top: 2px; color: var(--soft); font-size: .84rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.job-body { position: relative; padding: 0 0 20px 20px; border-left: 2px solid var(--line); }
.job:last-child .job-body { padding-bottom: 2px; border-left-color: transparent; }
.job-body::before { content: ""; position: absolute; left: -6px; top: 7px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--card); }
h3 { margin: 0; font-size: .98rem; font-weight: 600; line-height: 1.4; }
.org { margin-left: .5em; color: var(--soft); font-weight: 400; }
.job-body p { margin: 3px 0 0; color: var(--body); font-size: .91rem; }
.job-body ul { margin: 4px 0 0; padding-left: 16px; color: var(--body); font-size: .91rem; }
.job-body li { margin-top: 1px; }
.job-body li::marker { color: var(--accent); }
.edu { display: grid; grid-template-columns: 3.2em 1fr; gap: 3px 10px; margin: 0; font-size: .92rem; }
.edu dt { color: var(--soft); }
.edu dd { margin: 0; }
@media screen { .print-only { display: none; } }
.closing { display: flex; gap: 24px; align-items: flex-start; }
.closing .plain { flex: 1; min-width: 0; }
.qr { flex: none; width: 19mm; margin: 0; text-align: center; }
.qr svg { display: block; width: 100%; height: auto; }
.qr figcaption { margin-top: 3px; color: var(--soft); font-size: .64rem; line-height: 1.2; white-space: nowrap; }
p.plain { margin: 0; font-size: .92rem; }
@media (max-width: 680px) {
  body { background: var(--card); font-size: 15.5px; }
  .page { margin: 0; padding: 24px 20px 32px; border-radius: 0; box-shadow: none; }
  h1 { font-size: 1.75rem; }
  .strengths { grid-template-columns: 1fr; }
  .job { display: block; position: relative; padding-left: 20px; border-left: 2px solid var(--line); padding-bottom: 20px; }
  .job:last-child { border-left-color: transparent; padding-bottom: 2px; }
  .job::before { content: ""; position: absolute; left: -6px; top: 6px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--card); }
  .job-body, .job:last-child .job-body { padding: 0; border: 0; }
  .job-body::before { display: none; }
  .job time { display: block; padding: 0; }
  .download { flex: 1 1 180px; text-align: center; }
  .theme { position: static; flex: none; }
  .title small { display: block; margin: 2px 0 0; }
}
@page { size: A4; margin: 9mm 14mm; }
@media print {
  html, body { background: #fff; font-size: 11.6px; line-height: 1.38; }
  .page { max-width: none; margin: 0; padding: 0; border-radius: 0; box-shadow: none; }
  .actions { display: none; }
  .photo { width: 78px; height: 78px; }
  h2 { margin: 11px 0 6px; }
  .summary { margin-top: 13px; }
  .job-body { padding-bottom: 8px; }
  .strength { padding: 8px 12px; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
${priv ? '' : `<script>try { var t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}</script>`}
</head>
<body>
<main class="page">
  <header>
    <div class="id">
      <h1>${esc(c.name)}</h1>
      <p class="title">${esc(c.title)} <small>${esc(c.subtitle)}</small></p>
      <div class="contact">${contact}</div>
      ${priv ? '' : `<div class="actions"><a class="download" href="${PDF_NAME}" download>Télécharger le CV en PDF</a><div class="theme" id="theme" role="group" aria-label="Thème d\'affichage" hidden><button type="button" data-t="" title="Thème du système" aria-label="Thème du système"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></button><button type="button" data-t="light" title="Thème clair" aria-label="Thème clair"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button><button type="button" data-t="dark" title="Thème sombre" aria-label="Thème sombre"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg></button></div></div>`}
    </div>
    ${photo ? `<img class="photo" src="${photo}" alt="Portrait de ${esc(c.name)}">` : ''}
  </header>
  <p class="summary">${esc(c.summary)}</p>
  <h2>Points forts</h2>
  <section class="strengths">${c.strengths.map((s) => `<div class="strength"><strong>${esc(s.label)}</strong>${esc(s.text)}</div>`).join('')}</section>
  <h2>Parcours</h2>
  <section class="timeline">${experiences}</section>
  <h2>Formation</h2>
  <dl class="edu">${c.education.map((e) => `<dt>${esc(e.dates)}</dt><dd>${esc(e.text)}</dd>`).join('')}</dl>
  <h2>Projet personnel</h2>
  <div class="closing">
    <p class="plain">${esc(c.projects)}</p>
    ${qr ? `<figure class="qr${priv ? '' : ' print-only'}">${qr}<figcaption>Version numérique</figcaption></figure>` : ''}
  </div>
</main>
${priv ? '' : `<script>
(function () {
  var box = document.getElementById('theme'), root = document.documentElement, btns = box.querySelectorAll('button');
  function show() { btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.t === (root.dataset.theme || ''))); }); }
  btns.forEach(function (x) {
    x.addEventListener('click', function () {
      var t = x.dataset.t;
      if (t) root.dataset.theme = t; else delete root.dataset.theme;
      try { t ? localStorage.setItem('theme', t) : localStorage.removeItem('theme'); } catch (e) {}
      show();
    });
  });
  box.hidden = false;
  show();
})();
</script>`}
</body>
</html>
`;
}

const content = JSON.parse(await readFile('content.json', 'utf8'));
const browser = await chromium.launch();
const toPdf = async (htmlPath, pdfPath) => {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true, tagged: true });
  await page.close();
};

const qr = await QRCode.toString(SITE_URL, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#22302f', light: '#ffffff' } });
const publicHtml = render(content, { tokens: PUBLIC_TOKENS, fontBase: 'fonts/', qr });
await writeFile('docs/index.html', publicHtml);
await writeFile('docs/.nojekyll', '');
await toPdf(new URL('docs/index.html', import.meta.url).pathname, `docs/${PDF_NAME}`);

if (await exists('private/private.json')) {
  const priv = JSON.parse(await readFile('private/private.json', 'utf8'));
  const photo = priv.photo && await exists(`private/${priv.photo}`)
    ? `data:image/png;base64,${(await readFile(`private/${priv.photo}`)).toString('base64')}` : null;
  const html = render(content, { tokens: { ...PUBLIC_TOKENS, ...priv.tokens }, priv, photo, fontBase: '../docs/fonts/', qr });
  await writeFile('private/cv-complet.html', html);
  await toPdf(new URL('private/cv-complet.html', import.meta.url).pathname, 'private/cv-anthony-garreau-complet.pdf');

  // Garde-fou : aucune donnée privée dans la version publique.
  const secrets = [priv.email, priv.phone, priv.phone.replace(/\s/g, ''), priv.location, ...Object.values(priv.tokens)];
  const pdfText = execFileSync('pdftotext', [`docs/${PDF_NAME}`, '-']).toString();
  const pdfInfo = execFileSync('pdfinfo', [`docs/${PDF_NAME}`]).toString();
  for (const s of secrets) {
    for (const [where, text] of [['index.html', publicHtml], ['PDF', pdfText], ['métadonnées PDF', pdfInfo], ['content.json', JSON.stringify(content)]]) {
      if (text.includes(s)) throw new Error(`Donnée privée « ${s} » trouvée dans ${where}`);
    }
  }
  console.log('Contrôle OK : aucune donnée privée dans la version publique.');
}
await browser.close();
console.log('Public :', (await stat(`docs/${PDF_NAME}`)).size, 'octets');
