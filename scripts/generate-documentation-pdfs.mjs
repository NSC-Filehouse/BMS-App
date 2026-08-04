import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), '..');

const documents = [
  {
    source: join(projectRoot, 'docs', 'ANWENDERHANDBUCH.md'),
    output: join(projectRoot, 'docs', 'BMS-App_Anwenderhandbuch.pdf'),
    title: 'BMS-App – Anwenderhandbuch',
    subtitle: 'Vollständige Anwenderdokumentation',
    description: 'Screens, Funktionen, Eingaben und Arbeitsabläufe im Detail',
    tocDepth: 3,
    sectionBreaks: true,
  },
  {
    source: join(projectRoot, 'docs', 'FUNKTIONSUEBERSICHT.md'),
    output: join(projectRoot, 'docs', 'BMS-App_Funktionsuebersicht.pdf'),
    title: 'BMS-App – Funktionsübersicht',
    subtitle: 'Kompakter Funktionskatalog',
    description: 'Alle Anwenderfunktionen als schnelle Stichpunktübersicht',
    tocDepth: 2,
    sectionBreaks: false,
  },
];

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!chromePath) {
  throw new Error('Kein kompatibler Chrome- oder Edge-Browser für die PDF-Erzeugung gefunden.');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderInline(value) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return text;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'abschnitt';
}

function splitTableRow(line) {
  return String(line)
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function markdownToHtml(markdown, tocDepth) {
  const originalLines = String(markdown).replaceAll('\r\n', '\n').split('\n');
  const lines = [...originalLines];
  if (lines[0]?.startsWith('# ')) lines.shift();
  while (lines[0]?.trim() === '') lines.shift();
  if (/^Stand:\s*/i.test(lines[0] || '')) lines.shift();
  while (lines[0]?.trim() === '') lines.shift();

  const output = [];
  const toc = [];
  const slugCounts = new Map();
  let paragraph = [];
  let listType = '';

  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = '';
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${renderInline(paragraph.join(' ').trim())}</p>`);
    paragraph = [];
  };

  const uniqueSlug = (heading) => {
    const base = slugify(heading);
    const count = slugCounts.get(base) || 0;
    slugCounts.set(base, count + 1);
    return count ? `${base}-${count + 1}` : base;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();
      const id = uniqueSlug(heading);
      if (level >= 2 && level <= tocDepth) toc.push({ level, heading, id });
      output.push(`<h${level} id="${id}">${renderInline(heading)}</h${level}>`);
      continue;
    }

    if (trimmed.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      flushParagraph();
      closeList();
      const headers = splitTableRow(trimmed);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      output.push('<div class="table-wrap"><table><thead><tr>');
      output.push(headers.map((cell) => `<th>${renderInline(cell)}</th>`).join(''));
      output.push('</tr></thead><tbody>');
      for (const row of rows) {
        output.push('<tr>');
        output.push(headers.map((_, cellIndex) => `<td>${renderInline(row[cellIndex] || '')}</td>`).join(''));
        output.push('</tr>');
      }
      output.push('</tbody></table></div>');
      continue;
    }

    const unorderedMatch = /^-\s+(.+)$/.exec(trimmed);
    if (unorderedMatch) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        output.push('<ul>');
        listType = 'ul';
      }
      output.push(`<li>${renderInline(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (orderedMatch) {
      flushParagraph();
      if (listType !== 'ol') {
        closeList();
        output.push('<ol>');
        listType = 'ol';
      }
      output.push(`<li>${renderInline(orderedMatch[1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();
  return { body: output.join('\n'), toc };
}

function renderToc(items) {
  const entries = items.map((item) => (
    `<a class="toc-entry toc-level-${item.level}" href="#${item.id}">`
      + `<span>${renderInline(item.heading)}</span><span class="toc-dots"></span><span class="toc-number"></span>`
      + '</a>'
  ));
  return entries.join('\n');
}

function renderDocument(config, markdown) {
  const { body, toc } = markdownToHtml(markdown, config.tocDepth);
  const bodyClass = config.sectionBreaks ? 'section-breaks' : 'continuous-sections';
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="author" content="MLHolding GmbH" />
  <meta name="description" content="${escapeHtml(config.description)}" />
  <title>${escapeHtml(config.title)}</title>
  <style>
    :root {
      --primary: #5788c2;
      --primary-dark: #315d91;
      --primary-pale: #eef4fb;
      --secondary: #00adef;
      --ink: #203040;
      --muted: #667788;
      --line: #d9e1e8;
      --paper: #ffffff;
    }

    * { box-sizing: border-box; }

    html {
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: var(--ink);
      font-size: 10.5pt;
      line-height: 1.48;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    body { margin: 0; background: var(--paper); }

    @page { size: A4; margin: 0; }

    html, body { width: 210mm; margin: 0; padding: 0; }

    .print-page {
      width: 210mm;
      height: 296.8mm;
      position: relative;
      overflow: hidden;
      background: #fff;
      break-before: page;
      page-break-before: always;
    }

    .print-page:first-child { break-before: auto; page-break-before: auto; }

    .page-header {
      position: absolute;
      z-index: 10;
      top: 9mm;
      left: 19mm;
      right: 17mm;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10mm;
      color: #667788;
      font-size: 8pt;
      line-height: 1;
    }

    .page-header strong {
      flex: 0 0 auto;
      color: #5788c2;
      font-size: 8.5pt;
      font-weight: 700;
      letter-spacing: 0.12em;
    }

    .page-header span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: right;
    }

    .page-footer {
      position: absolute;
      z-index: 10;
      left: 19mm;
      right: 17mm;
      bottom: 8mm;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      color: #7b8996;
      font-size: 8pt;
      line-height: 1;
    }

    .page-content {
      position: absolute;
      z-index: 1;
      top: 22mm;
      right: 17mm;
      bottom: 18mm;
      left: 19mm;
      overflow: hidden;
    }

    .cover {
      background: linear-gradient(145deg, #ffffff 0%, #ffffff 58%, #eef4fb 58%, #dceafa 100%);
      padding: 30mm 24mm;
    }

    .cover::before {
      content: "";
      position: absolute;
      width: 155mm;
      height: 155mm;
      border-radius: 50%;
      right: -72mm;
      top: -75mm;
      background: linear-gradient(135deg, #00adef, #5788c2);
    }

    .cover::after {
      content: "";
      position: absolute;
      width: 105mm;
      height: 8mm;
      right: -18mm;
      bottom: 35mm;
      transform: rotate(-33deg);
      background: #5788c2;
      opacity: 0.92;
    }

    .brand {
      position: relative;
      z-index: 2;
      display: inline-flex;
      align-items: center;
      gap: 4mm;
      color: var(--primary-dark);
      font-size: 12pt;
      font-weight: 800;
      letter-spacing: 0.14em;
    }

    .brand-mark {
      display: grid;
      place-items: center;
      width: 15mm;
      height: 15mm;
      color: #fff;
      background: linear-gradient(135deg, var(--secondary), var(--primary));
      border-radius: 4mm;
      font-size: 14pt;
      letter-spacing: 0;
      box-shadow: 0 3mm 7mm rgba(49, 93, 145, 0.2);
    }

    .cover-content {
      position: relative;
      z-index: 2;
      margin-top: 62mm;
      max-width: 145mm;
    }

    .cover-kicker {
      color: var(--secondary);
      font-size: 10pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      margin-bottom: 8mm;
    }

    .cover h1 {
      margin: 0;
      color: var(--primary-dark);
      font-size: 31pt;
      line-height: 1.08;
      letter-spacing: -0.035em;
    }

    .cover-subtitle {
      margin-top: 8mm;
      font-size: 16pt;
      font-weight: 600;
      color: var(--ink);
    }

    .cover-description {
      margin-top: 4mm;
      max-width: 125mm;
      color: var(--muted);
      font-size: 11pt;
    }

    .cover-meta {
      position: absolute;
      z-index: 2;
      left: 24mm;
      bottom: 28mm;
      display: grid;
      gap: 1mm;
      color: var(--muted);
      font-size: 9.5pt;
    }

    .cover-meta strong { color: var(--primary-dark); }

    .toc-page h1 {
      margin: 0 0 12mm;
      color: var(--primary-dark);
      font-size: 25pt;
      line-height: 1.15;
    }

    .toc-entry {
      display: flex;
      align-items: baseline;
      gap: 2mm;
      color: var(--ink);
      text-decoration: none;
      padding: 1.2mm 0;
      border-bottom: 0.25mm solid rgba(217, 225, 232, 0.6);
    }

    .toc-entry span:first-child { max-width: 143mm; }
    .toc-dots { flex: 1; border-bottom: 0.25mm dotted #b9c5d1; }
    .toc-number { flex: 0 0 8mm; color: var(--muted); text-align: right; }
    .toc-level-2 { color: var(--primary-dark); font-weight: 700; margin-top: 1.5mm; }
    .toc-level-3 { padding-left: 7mm; color: #415467; font-size: 9.5pt; }

    h2, h3, h4 { break-after: avoid; page-break-after: avoid; }

    h2 {
      margin: 12mm 0 5mm;
      padding-bottom: 2.5mm;
      border-bottom: 0.7mm solid var(--primary);
      color: var(--primary-dark);
      font-size: 20pt;
      line-height: 1.16;
      letter-spacing: -0.02em;
    }

    .continuous-sections h2 { margin-top: 9mm; }

    h3 {
      margin: 7mm 0 3mm;
      color: var(--primary-dark);
      font-size: 14.5pt;
      line-height: 1.25;
    }

    h4 {
      margin: 5mm 0 2mm;
      color: #385b7c;
      font-size: 11.5pt;
      line-height: 1.3;
    }

    p { margin: 0 0 3.5mm; }

    ul, ol {
      margin: 1.5mm 0 4mm;
      padding-left: 7mm;
    }

    li {
      margin: 0 0 1.3mm;
      padding-left: 1mm;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    li::marker { color: var(--primary); font-weight: 700; }

    code {
      padding: 0.2mm 1mm;
      background: var(--primary-pale);
      border-radius: 1mm;
      font-family: Consolas, monospace;
      font-size: 0.92em;
    }

    .table-wrap {
      margin: 3mm 0 5mm;
      break-inside: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.2pt;
    }

    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }

    th {
      padding: 2.3mm 2.5mm;
      text-align: left;
      vertical-align: top;
      color: #fff;
      background: var(--primary);
      border: 0.25mm solid var(--primary);
      font-weight: 700;
    }

    td {
      padding: 2.1mm 2.5mm;
      vertical-align: top;
      border: 0.25mm solid var(--line);
    }

    tbody tr:nth-child(even) td { background: #f7fafd; }

    a { color: var(--primary-dark); }

  </style>
</head>
<body>
  <div id="pages">
    <section class="print-page cover">
      <div class="brand"><span class="brand-mark">B</span><span>BMS APP</span></div>
      <div class="cover-content">
        <div class="cover-kicker">Anwenderdokumentation</div>
        <h1>${escapeHtml(config.title.replace(/^BMS-App\s*[–-]\s*/, ''))}</h1>
        <div class="cover-subtitle">${escapeHtml(config.subtitle)}</div>
        <div class="cover-description">${escapeHtml(config.description)}</div>
      </div>
      <div class="cover-meta">
        <strong>Funktionsstand: 20. Juli 2026</strong>
        <span>MLHolding GmbH</span>
      </div>
    </section>
  </div>

  <template id="toc-template">
    <h1>Inhaltsverzeichnis</h1>
    ${renderToc(toc)}
  </template>

  <template id="main-template">
    <div class="source-main ${bodyClass}">
      ${body}
    </div>
  </template>

  <script>
    (() => {
      const documentTitle = ${JSON.stringify(config.title)};
      const sectionBreaks = ${config.sectionBreaks ? 'true' : 'false'};
      const pagesRoot = document.getElementById('pages');

      function createPage(kind) {
        const page = document.createElement('section');
        page.className = 'print-page ' + kind + '-page';

        const header = document.createElement('header');
        header.className = 'page-header';
        header.innerHTML = '<strong>BMS-APP</strong><span></span>';
        header.querySelector('span').textContent = documentTitle;

        const content = document.createElement(kind === 'toc' ? 'nav' : 'main');
        content.className = 'page-content';
        if (kind === 'toc') content.setAttribute('aria-label', 'Inhaltsverzeichnis');

        const footer = document.createElement('footer');
        footer.className = 'page-footer';
        footer.innerHTML = '<span>Stand: 20. Juli 2026</span><span class="page-number"></span>';

        page.append(header, content, footer);
        pagesRoot.append(page);
        return { page, content };
      }

      function pageHasContent(content) {
        return content.children.length > 0;
      }

      function usedHeight(content) {
        const last = content.lastElementChild;
        if (!last) return 0;
        const contentRect = content.getBoundingClientRect();
        const lastRect = last.getBoundingClientRect();
        const marginBottom = Number.parseFloat(getComputedStyle(last).marginBottom) || 0;
        return lastRect.bottom - contentRect.top + marginBottom;
      }

      function fits(content) {
        return usedHeight(content) <= content.clientHeight + 1;
      }

      function remainingHeight(content) {
        return content.clientHeight - usedHeight(content);
      }

      function prepareFirstBlock(content, block) {
        if (!pageHasContent(content) && /^H[2-4]$/.test(block.tagName)) {
          block.style.marginTop = '0';
        }
      }

      function detachTrailingHeading(content) {
        const last = content.lastElementChild;
        if (!last || !/^H[2-4]$/.test(last.tagName)) return null;
        last.remove();
        return last;
      }

      function paginateToc() {
        const source = document.getElementById('toc-template').content;
        let state = createPage('toc');
        for (const original of Array.from(source.children)) {
          const block = original.cloneNode(true);
          state.content.append(block);
          if (!fits(state.content)) {
            block.remove();
            state = createPage('toc');
            state.content.append(block);
          }
        }
      }

      function paginateMain() {
        const sourceRoot = document.getElementById('main-template').content.querySelector('.source-main');
        let state = createPage('main');

        const nextPage = (heading = null) => {
          state = createPage('main');
          if (heading) {
            heading.style.marginTop = '0';
            state.content.append(heading);
          }
        };

        const moveAtomicBlock = (original) => {
          const block = original.cloneNode(true);
          const isHeading = /^H[2-4]$/.test(block.tagName);

          if (block.tagName === 'H2' && sectionBreaks && pageHasContent(state.content)) {
            nextPage();
          }

          prepareFirstBlock(state.content, block);
          state.content.append(block);

          const headingNeedsRoom = isHeading && remainingHeight(state.content) < 28;
          if ((!fits(state.content) || headingNeedsRoom) && state.content.children.length > 1) {
            block.remove();
            nextPage();
            prepareFirstBlock(state.content, block);
            state.content.append(block);
          }
        };

        const moveList = (original) => {
          let list = original.cloneNode(false);
          state.content.append(list);

          for (const originalItem of Array.from(original.children)) {
            const item = originalItem.cloneNode(true);
            list.append(item);
            if (fits(state.content)) continue;

            item.remove();
            if (!list.children.length) {
              list.remove();
              const heading = detachTrailingHeading(state.content);
              nextPage(heading);
            } else {
              nextPage();
            }
            list = original.cloneNode(false);
            state.content.append(list);
            list.append(item);
          }
        };

        const createTableShell = (original) => {
          const sourceTable = original.querySelector('table');
          const wrap = original.cloneNode(false);
          const table = sourceTable.cloneNode(false);
          const head = sourceTable.querySelector('thead');
          if (head) table.append(head.cloneNode(true));
          const body = document.createElement('tbody');
          table.append(body);
          wrap.append(table);
          return { wrap, body };
        };

        const moveTable = (original) => {
          const rows = Array.from(original.querySelectorAll('tbody > tr'));
          let shell = createTableShell(original);
          state.content.append(shell.wrap);

          for (const originalRow of rows) {
            const row = originalRow.cloneNode(true);
            shell.body.append(row);
            if (fits(state.content)) continue;

            row.remove();
            if (!shell.body.children.length) {
              shell.wrap.remove();
              const heading = detachTrailingHeading(state.content);
              nextPage(heading);
            } else {
              nextPage();
            }
            shell = createTableShell(original);
            state.content.append(shell.wrap);
            shell.body.append(row);
          }
        };

        for (const original of Array.from(sourceRoot.children)) {
          if (original.matches('ul, ol')) {
            moveList(original);
          } else if (original.classList.contains('table-wrap')) {
            moveTable(original);
          } else {
            moveAtomicBlock(original);
          }
        }
      }

      paginateToc();
      paginateMain();

      const pages = Array.from(document.querySelectorAll('.print-page'));
      const total = pages.length;
      pages.forEach((page, index) => {
        const number = page.querySelector('.page-number');
        if (number) number.textContent = 'Seite ' + (index + 1) + ' von ' + total;
      });

      document.querySelectorAll('.toc-entry[href^="#"]').forEach((link) => {
        const target = document.getElementById(link.getAttribute('href').slice(1));
        const targetPage = target ? target.closest('.print-page') : null;
        const pageIndex = targetPage ? pages.indexOf(targetPage) : -1;
        const number = link.querySelector('.toc-number');
        if (number && pageIndex >= 0) number.textContent = String(pageIndex + 1);
      });

      document.getElementById('toc-template').remove();
      document.getElementById('main-template').remove();
      document.documentElement.dataset.pagination = 'ready';
    })();
  </script>
</body>
</html>`;
}

function printPdf(html, outputPath) {
  const tempFolder = mkdtempSync(join(tmpdir(), 'bms-doc-pdf-'));
  const htmlPath = join(tempFolder, `${basename(outputPath, '.pdf')}.html`);
  const profilePath = join(tempFolder, 'browser-profile');
  try {
    writeFileSync(htmlPath, html, 'utf8');
    if (existsSync(outputPath)) unlinkSync(outputPath);

    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-extensions',
      '--disable-background-networking',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=1000',
      '--allow-file-access-from-files',
      '--no-pdf-header-footer',
      '--print-to-pdf-no-header',
      '--generate-pdf-document-outline',
      '--export-tagged-pdf',
      `--user-data-dir=${profilePath}`,
      `--print-to-pdf=${outputPath}`,
      pathToFileURL(htmlPath).href,
    ];

    const result = spawnSync(chromePath, args, {
      encoding: 'utf8',
      timeout: 120_000,
      windowsHide: true,
    });

    if (result.error) throw result.error;
    if (result.status !== 0 || !existsSync(outputPath)) {
      throw new Error(`PDF-Erzeugung fehlgeschlagen (${result.status}): ${result.stderr || result.stdout || 'keine Ausgabe'}`);
    }
    if (statSync(outputPath).size < 10_000) {
      throw new Error(`Erzeugte PDF-Datei ist unerwartet klein: ${outputPath}`);
    }
  } finally {
    rmSync(tempFolder, { recursive: true, force: true });
  }
}

for (const document of documents) {
  if (!existsSync(document.source)) throw new Error(`Quelldokument fehlt: ${document.source}`);
  const markdown = readFileSync(document.source, 'utf8');
  const html = renderDocument(document, markdown);
  printPdf(html, document.output);
  const sizeKb = Math.round(statSync(document.output).size / 1024);
  process.stdout.write(`PDF erstellt: ${document.output} (${sizeKb} KB)\n`);
}
