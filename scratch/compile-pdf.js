const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// File paths
const mdPath = path.join(__dirname, '../docs/valuation-abbla.md');
const htmlPath = path.join(__dirname, '../docs/valuation-abbla.html');
const pdfPath = path.join(__dirname, '../docs/valuation-abbla.pdf');

console.log('Iniciando compilação do Valuation para HTML e PDF...');

// Check if markdown exists
if (!fs.existsSync(mdPath)) {
  console.error(`Erro: Arquivo Markdown não encontrado em ${mdPath}`);
  process.exit(1);
}

// Read markdown content
let mdContent = fs.readFileSync(mdPath, 'utf8');

// Parse markdown to HTML
function parseMarkdown(md) {
  let html = '';
  const lines = md.split('\n');
  let inList = false;
  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];
  let inCodeBlock = false;
  let codeBlockContent = [];
  let codeBlockLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle Code Blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        inCodeBlock = false;
        const contentStr = codeBlockContent.join('\n');
        
        if (codeBlockLang === 'mermaid') {
          // Render custom premium HTML components instead of raw mermaid
          if (contentStr.includes('Canais Fragmentados')) {
            html += `
            <div class="workflow-container">
              <div class="workflow-row">
                <div class="workflow-card before">
                  <div class="card-tag">Cenário Fragmentado</div>
                  <div class="card-item">❌ Canais Fragmentados (WA, Insta, FB, TikTok, E-mail)</div>
                  <div class="card-item">❌ Atendimento Manual Lento & Churn Elevado</div>
                  <div class="card-item">❌ Venda Interrompida na hora do pagamento</div>
                </div>
                <div class="workflow-arrow">➔</div>
                <div class="workflow-card after">
                  <div class="card-tag secure">Solução Abbla Hub</div>
                  <div class="card-item font-semibold">✓ Caixa de Entrada Unificada Multicanal</div>
                  <div class="card-item font-semibold">✓ Automações com Flow Builder & IA</div>
                  <div class="card-item font-semibold">✓ Cobrança e Checkout Integrado (Abbla Pay)</div>
                </div>
              </div>
            </div>`;
          } else if (contentStr.includes('pie title')) {
            // Render beautiful charts/progress bars for Use of Funds
            html += `
            <div class="chart-container">
              <div class="chart-title">Distribuição de Recursos — Rodada Pré-Seed</div>
              
              <div class="chart-bar-item">
                <div class="chart-bar-labels">
                  <span class="chart-label-name">Tecnologia & Infraestrutura Fintech</span>
                  <span class="chart-label-pct">45% (R$ 337.500)</span>
                </div>
                <div class="chart-bar-track">
                  <div class="chart-bar-fill" style="width: 45%; background-color: #10b981;"></div>
                </div>
              </div>

              <div class="chart-bar-item">
                <div class="chart-bar-labels">
                  <span class="chart-label-name">Marketing, Vendas & Canais</span>
                  <span class="chart-label-pct">35% (R$ 262.500)</span>
                </div>
                <div class="chart-bar-track">
                  <div class="chart-bar-fill" style="width: 35%; background-color: #3b82f6;"></div>
                </div>
              </div>

              <div class="chart-bar-item">
                <div class="chart-bar-labels">
                  <span class="chart-label-name">Operações & Liquidez Financeira</span>
                  <span class="chart-label-pct">12% (R$ 90.000)</span>
                </div>
                <div class="chart-bar-track">
                  <div class="chart-bar-fill" style="width: 12%; background-color: #f59e0b;"></div>
                </div>
              </div>

              <div class="chart-bar-item">
                <div class="chart-bar-labels">
                  <span class="chart-label-name">Segurança, PCI & Jurídico</span>
                  <span class="chart-label-pct">8% (R$ 60.000)</span>
                </div>
                <div class="chart-bar-track">
                  <div class="chart-bar-fill" style="width: 8%; background-color: #64748b;"></div>
                </div>
              </div>
            </div>`;
          }
        } else {
          // Standard code block
          html += `<pre><code>${escapeHtml(contentStr)}</code></pre>`;
        }
        codeBlockContent = [];
        codeBlockLang = '';
      } else {
        // Start of code block
        inCodeBlock = true;
        codeBlockLang = line.replace('```', '').trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Close list if line does not start with -
    if (inList && !line.trim().startsWith('*') && !line.trim().startsWith('-')) {
      html += '</ul>\n';
      inList = false;
    }

    // Close table if line does not start/end with |
    if (inTable && !line.trim().startsWith('|')) {
      html += renderTable(tableHeaders, tableRows);
      inTable = false;
      tableHeaders = [];
      tableRows = [];
    }

    // Empty line
    if (line.trim() === '') {
      continue;
    }

    // Headers
    if (line.startsWith('# ')) {
      html += `<h1 class="main-title">${parseInline(line.substring(2))}</h1>\n`;
    } else if (line.startsWith('## ')) {
      // Add page break before h2, except the first ones
      const text = parseInline(line.substring(3));
      const sectionId = text.toLowerCase().replace(/[^\w]/g, '-');
      html += `<h2 id="${sectionId}" class="section-title">${text}</h2>\n`;
    } else if (line.startsWith('### ')) {
      html += `<h3 class="subsection-title">${parseInline(line.substring(4))}</h3>\n`;
    } 
    // Horizontal Rule
    else if (line.trim() === '---') {
      html += '<hr class="styled-hr" />\n';
    }
    // Lists
    else if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
      if (!inList) {
        html += '<ul class="styled-list">\n';
        inList = true;
      }
      html += `<li>${parseInline(line.trim().substring(2))}</li>\n`;
    }
    // Tables
    else if (line.trim().startsWith('|')) {
      if (!inTable) {
        inTable = true;
        // Parse headers
        tableHeaders = line.split('|').map(s => s.trim()).filter(s => s !== '');
        // Skip separator line in markdown table (the |---|---| line)
        i++; 
      } else {
        const row = line.split('|').map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
        tableRows.push(row);
      }
    }
    // Callouts / Alerts
    else if (line.trim().startsWith('> [!NOTE]') || line.trim().startsWith('> [!TIP]') || line.trim().startsWith('> [!IMPORTANT]') || line.trim().startsWith('> [!WARNING]')) {
      const alertType = line.includes('NOTE') ? 'note' : line.includes('TIP') ? 'tip' : line.includes('WARNING') ? 'warning' : 'important';
      let alertContent = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim().startsWith('>')) {
        alertContent.push(lines[j].trim().substring(1).trim());
        j++;
      }
      i = j - 1; // Advance outer loop index
      html += `
      <div class="alert-box alert-${alertType}">
        <div class="alert-title">${alertType.toUpperCase()}</div>
        <div class="alert-body">${parseInline(alertContent.join(' '))}</div>
      </div>\n`;
    }
    // Standard paragraphs
    else {
      // Check if it's blockquotes
      if (line.trim().startsWith('>')) {
        html += `<blockquote class="styled-blockquote">${parseInline(line.trim().substring(1).trim())}</blockquote>\n`;
      } else {
        html += `<p class="paragraph">${parseInline(line)}</p>\n`;
      }
    }
  }

  // Cleanup lists/tables at EOF
  if (inList) html += '</ul>\n';
  if (inTable) html += renderTable(tableHeaders, tableRows);

  return html;
}

function parseInline(text) {
  // Bold
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Inline code
  text = text.replace(/`(.*?)`/g, '<code class="inline-code">$1</code>');
  // Markdown links to clean text or direct links
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
  
  // LaTeX inline equations: \(E=mc^2\) or $E=mc^2$
  text = text.replace(/\\\((.*?)\\\)/g, '<span class="math-inline">$1</span>');
  text = text.replace(/\$(.*?)\$/g, '<span class="math-inline">$1</span>');
  
  // LaTeX block equations: \[\text{Formula}\] or $$Formula$$
  text = text.replace(/\\\[(.*?)\\\]/g, '<div class="math-block">$1</div>');
  text = text.replace(/\$\$(.*?)\$\$/g, '<div class="math-block">$1</div>');

  return text;
}

function renderTable(headers, rows) {
  let html = '<div class="table-container"><table class="styled-table">\n<thead>\n<tr>\n';
  headers.forEach(h => {
    html += `<th>${parseInline(h)}</th>\n`;
  });
  html += '</tr>\n</thead>\n<tbody>\n';
  rows.forEach(row => {
    html += '<tr>\n';
    row.forEach(cell => {
      html += `<td>${parseInline(cell)}</td>\n`;
    });
    html += '</tr>\n';
  });
  html += '</tbody>\n</table></div>\n';
  return html;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const parsedBodyHtml = parseMarkdown(mdContent);

// Build final HTML wrapper with Premium styling
const finalHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Abbla Hub — Relatório de Valuation</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
    
    * {
      box-sizing: border-box;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      line-height: 1.6;
      font-size: 15px;
      margin: 0;
      padding: 0;
      background-color: #ffffff;
    }

    /* Print & PDF Settings */
    @page {
      size: A4;
      margin: 20mm 20mm 20mm 20mm;
      @bottom-right {
        content: counter(page);
      }
    }

    /* Cover Page */
    .cover-page {
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 40px 20px;
      page-break-after: always;
    }

    .cover-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-mark {
      width: 48px;
      height: 48px;
      background-color: #10b981;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 800;
      font-size: 24px;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
    }

    .logo-text {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
    }

    .cover-body {
      margin-top: 100px;
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .cover-badge {
      align-self: flex-start;
      background-color: #ecfdf5;
      color: #059669;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 12px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 20px;
    }

    .cover-title {
      font-size: 42px;
      font-weight: 800;
      line-height: 1.15;
      color: #0f172a;
      margin: 0 0 10px 0;
      letter-spacing: -1.5px;
    }

    .cover-subtitle {
      font-size: 18px;
      color: #64748b;
      margin: 0;
      max-width: 600px;
      font-weight: 400;
    }

    .cover-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 30px;
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #64748b;
    }

    .meta-label {
      font-weight: 600;
      color: #475569;
      margin-bottom: 4px;
    }

    /* Content Styling */
    .content-wrapper {
      max-width: 800px;
      margin: 0 auto;
      padding: 0 20px;
    }

    .main-title {
      display: none; /* Hide since we have cover */
    }

    .section-title {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
      margin-top: 40px;
      margin-bottom: 20px;
      letter-spacing: -0.5px;
      page-break-before: always;
    }

    /* Ensure specific sections dont break inside page */
    .section-title:first-of-type {
      page-break-before: avoid !important;
    }

    .subsection-title {
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
      margin-top: 25px;
      margin-bottom: 12px;
    }

    .paragraph {
      margin-top: 0;
      margin-bottom: 15px;
      text-align: justify;
      color: #334155;
    }

    .styled-list {
      margin-top: 0;
      margin-bottom: 20px;
      padding-left: 20px;
    }

    .styled-list li {
      margin-bottom: 8px;
      color: #334155;
    }

    .styled-hr {
      border: 0;
      height: 1px;
      background: #e2e8f0;
      margin: 30px 0;
    }

    /* Table Styling */
    .table-container {
      margin: 20px 0;
      overflow: hidden;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      page-break-inside: avoid;
    }

    .styled-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13.5px;
    }

    .styled-table th {
      background-color: #f8fafc;
      color: #475569;
      font-weight: 700;
      padding: 12px 16px;
      border-bottom: 1px solid #e2e8f0;
    }

    .styled-table td {
      padding: 12px 16px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
    }

    .styled-table tr:last-child td {
      border-bottom: none;
    }

    .styled-table tr:nth-child(even) {
      background-color: #fafafa;
    }

    /* Callouts / Alerts */
    .alert-box {
      margin: 25px 0;
      padding: 16px;
      border-left: 4px solid #cbd5e1;
      background-color: #f8fafc;
      border-radius: 0 8px 8px 0;
      page-break-inside: avoid;
    }

    .alert-title {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1px;
      margin-bottom: 6px;
      color: #64748b;
    }

    .alert-body {
      font-size: 14px;
      color: #334155;
    }

    .alert-note {
      border-left-color: #3b82f6;
      background-color: #eff6ff;
    }
    .alert-note .alert-title { color: #2563eb; }

    .alert-tip {
      border-left-color: #10b981;
      background-color: #ecfdf5;
    }
    .alert-tip .alert-title { color: #059669; }

    .alert-warning {
      border-left-color: #f59e0b;
      background-color: #fffbeb;
    }
    .alert-warning .alert-title { color: #d97706; }

    /* Custom Premium Components */
    .workflow-container {
      margin: 25px 0;
      page-break-inside: avoid;
    }

    .workflow-row {
      display: flex;
      align-items: center;
      gap: 15px;
    }

    .workflow-card {
      flex: 1;
      padding: 20px;
      border-radius: 10px;
      border: 1px solid #fee2e2;
      background-color: #fef2f2;
    }

    .workflow-card.after {
      border-color: #d1fae5;
      background-color: #ecfdf5;
    }

    .card-tag {
      font-size: 11px;
      font-weight: 800;
      color: #ef4444;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }

    .card-tag.secure {
      color: #10b981;
    }

    .card-item {
      font-size: 13px;
      margin-bottom: 8px;
      color: #475569;
    }

    .card-item:last-child {
      margin-bottom: 0;
    }

    .workflow-arrow {
      font-size: 24px;
      color: #94a3b8;
      font-weight: bold;
    }

    /* Progress/Bar Chart Components */
    .chart-container {
      margin: 25px 0;
      padding: 24px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      background-color: #ffffff;
      page-break-inside: avoid;
    }

    .chart-title {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 20px;
      text-align: center;
    }

    .chart-bar-item {
      margin-bottom: 16px;
    }

    .chart-bar-item:last-child {
      margin-bottom: 0;
    }

    .chart-bar-labels {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      margin-bottom: 6px;
    }

    .chart-label-name {
      font-weight: 600;
      color: #334155;
    }

    .chart-label-pct {
      font-weight: 700;
      color: #0f172a;
    }

    .chart-bar-track {
      width: 100%;
      height: 10px;
      background-color: #f1f5f9;
      border-radius: 5px;
      overflow: hidden;
    }

    .chart-bar-fill {
      height: 100%;
      border-radius: 5px;
    }

    /* Math Formula Block Styling */
    .math-block {
      text-align: center;
      font-size: 16px;
      margin: 15px 0;
      font-weight: 600;
      color: #0f172a;
      background-color: #f8fafc;
      padding: 12px;
      border-radius: 6px;
      font-family: Consolas, monospace;
      border-left: 3px solid #10b981;
    }

    .math-inline {
      font-weight: 600;
      color: #0f172a;
      background-color: #f8fafc;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: Consolas, monospace;
      font-size: 14px;
    }

    .font-semibold {
      font-weight: 600;
      color: #0f172a;
    }
  </style>
</head>
<body>

  <!-- Cover Page -->
  <div class="cover-page">
    <div class="cover-header">
      <div class="logo-mark">A</div>
      <div class="logo-text">Abbla</div>
    </div>
    
    <div class="cover-body">
      <div class="cover-badge">Investimento Pré-Seed</div>
      <h1 class="cover-title">Relatório de Valuation</h1>
      <p class="cover-subtitle">Fundamentos financeiros, análise de mercado e tese de captação de recursos para a rodada de investimento da Abbla Hub.</p>
    </div>
    
    <div class="cover-footer">
      <div>
        <div class="meta-label">PREPARADO PARA:</div>
        <div>Rodada de Captação 2026</div>
      </div>
      <div>
        <div class="meta-label">DATA DE REFERÊNCIA:</div>
        <div>Julho de 2026</div>
      </div>
      <div>
        <div class="meta-label">CLASSIFICAÇÃO:</div>
        <div style="color: #ef4444; font-weight: bold;">PRIVADO & CONFIDENCIAL</div>
      </div>
    </div>
  </div>

  <!-- Report Content -->
  <div class="content-wrapper">
    ${parsedBodyHtml}
  </div>

</body>
</html>`;

// Write HTML
fs.writeFileSync(htmlPath, finalHtml, 'utf8');
console.log('Compilação para HTML concluída: docs/valuation-abbla.html');

// Run Chrome Headless print-to-pdf
try {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const command = `"${chromePath}" --headless --disable-gpu --print-to-pdf="${pdfPath}" "${htmlPath}"`;
  
  console.log('Iniciando renderização do PDF via Chrome Headless...');
  execSync(command);
  console.log('PDF gerado com sucesso em: docs/valuation-abbla.pdf');
} catch (error) {
  console.error('Erro ao renderizar PDF via Chrome Headless:', error.message);
  process.exit(1);
}
