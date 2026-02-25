import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = [
    'src/pages/Watchlist.module.css',
    'src/pages/Market.module.css'
];

files.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // Backgrounds
    content = content.replace(/background:\s*#080c16;/g, 'background: var(--bg-secondary);');
    content = content.replace(/background:\s*#0a0e17;/g, 'background: var(--bg-primary);');
    content = content.replace(/background:\s*linear-gradient\([^)]+#111827[^)]+\);/g, 'background: var(--card-bg);');

    // Borders
    content = content.replace(/border-right:\s*1px solid rgba\(255, 255, 255, 0\.\d+\);/g, 'border-right: 1px solid var(--border-color);');
    content = content.replace(/border-bottom:\s*1px solid rgba\(255, 255, 255, 0\.\d+\);/g, 'border-bottom: 1px solid var(--border-color);');
    content = content.replace(/border-top:\s*1px solid rgba\(255, 255, 255, 0\.\d+\);/g, 'border-top: 1px solid var(--border-color);');
    content = content.replace(/border:\s*1px solid rgba\(255, 255, 255, 0\.\d+\);/g, 'border: 1px solid var(--border-color);');

    content = content.replace(/border-color:\s*rgba\(255, 255, 255, 0\.\d+\);/g, 'border-color: var(--border-color);');

    // Texts
    content = content.replace(/color:\s*#f1f5f9;/g, 'color: var(--text-primary);');
    content = content.replace(/color:\s*#cbd5e1;/g, 'color: var(--text-primary);');

    content = content.replace(/color:\s*#94a3b8;/g, 'color: var(--text-secondary);');
    content = content.replace(/color:\s*#64748b;/g, 'color: var(--text-secondary);');
    content = content.replace(/color:\s*#475569;/g, 'color: var(--text-secondary);');

    // Minor background hovers 
    content = content.replace(/background:\s*rgba\(255, 255, 255, 0\.03\);/g, 'background: var(--nav-hover);');
    content = content.replace(/background:\s*rgba\(255, 255, 255, 0\.04\);/g, 'background: var(--nav-hover);');
    content = content.replace(/background:\s*rgba\(255, 255, 255, 0\.02\);/g, 'background: var(--card-bg);');

    fs.writeFileSync(filePath, content);
});

console.log('Patched CSS files');
