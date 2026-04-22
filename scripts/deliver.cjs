#!/usr/bin/env node
/**
 * deliver.cjs — Pipeline Delivery Script
 * Scans squad outputs for a mentor and uploads all available content to the platform API.
 *
 * Usage:
 *   node scripts/deliver.cjs <mentor-name> [options]
 *
 * Options:
 *   --api-url=URL     Override API base URL (default: API_BASE_URL env or http://localhost:3005)
 *   --dry-run         Show what would be uploaded without uploading
 *   --squad=name      Only deliver outputs from specific squad
 *   --user-id=ID      Skip user lookup, use this userId directly
 *   --bb-status=ST    Brand Brain status to set (default: mentor_review)
 *
 * Environment:
 *   JWT_SECRET        Required — used to mint admin JWT token (local)
 *   VPS_JWT_SECRET    Required — used to mint admin JWT token (production, default)
 *   API_BASE_URL      Optional — override API URL (default: https://prosperusclub.com.br)
 *
 * Examples:
 *   node scripts/deliver.cjs monica-cereser
 *   node scripts/deliver.cjs monica-cereser --dry-run
 *   node scripts/deliver.cjs monica-cereser --squad=insights-feedback
 *   node scripts/deliver.cjs monica-cereser --api-url=https://prosperusclub.com.br/prosperus-mentor-diagnosis
 *   node scripts/deliver.cjs monica-cereser --user-id=abc123 --bb-status=danilo_review
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// --- Paths ---
const SCRIPT_DIR = __dirname;
const MENTORIA_DIR = path.resolve(SCRIPT_DIR, '..');
const ROOT_DIR = path.resolve(MENTORIA_DIR, '..');
const SQUADS_DIR = path.join(ROOT_DIR, 'squads');

// --- Load .env ---
require('dotenv').config({ path: path.join(MENTORIA_DIR, '.env') });

// --- BB section file → API key mapping ---
// File numbers follow BB document order (§1-§5), API keys follow platform DB order (s1-s5).
// §1 Oferta=s1, §2 Método=s5, §3 ICP=s2, §4 Posicionamento=s3, §5 Copy=s4
const BB_SECTION_FILE_MAP = {
  'section-1-oferta.md': 'section1_offer',
  'section-2-metodo.md': 'section5_method',
  'section-3-icp.md': 'section2_icp',
  'section-4-posicionamento.md': 'section3_positioning',
  'section-5-copy.md': 'section4_copy',
};

// --- Asset file → API structure mapping ---
const ASSET_FILE_MAP = {
  '01-sales-script.md': { pack: 'readyToSell', key: 'salesScript' },
  '02-outreach-script.md': { pack: 'readyToSell', key: 'outreachScript' },
  '03-follow-up-cadence.md': { pack: 'readyToSell', key: 'followUpSequences' },
  '04-vsl-script.md': { pack: 'bonus', key: 'vslScript' },
  '07-landing-page-design.html': { pack: 'bonus', key: 'landingPageCopy' },
  '06-lead-magnet-strategy.md': { pack: 'bonus', key: 'leadMagnetStrategy' },
};

// --- Deliverable squads (order matters for status transitions) ---
const DELIVERABLE_SQUADS = ['brand-brain-gen', 'asset-gen', 'insights-feedback'];

// =============================================================================
// CLI
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    mentorName: null,
    apiUrl: process.env.API_BASE_URL || 'https://prosperusclub.com.br',
    dryRun: false,
    local: false,
    squad: null,
    userId: null,
    bbStatus: 'mentor_review',
  };

  for (const arg of args) {
    if (arg.startsWith('--api-url=')) opts.apiUrl = arg.split('=').slice(1).join('=');
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--local') { opts.local = true; opts.apiUrl = 'http://localhost:3005'; }
    else if (arg.startsWith('--squad=')) opts.squad = arg.split('=')[1];
    else if (arg.startsWith('--user-id=')) opts.userId = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--bb-status=')) opts.bbStatus = arg.split('=')[1];
    else if (!arg.startsWith('--')) opts.mentorName = arg;
  }

  // Normalize apiUrl — strip trailing slash
  opts.apiUrl = opts.apiUrl.replace(/\/+$/, '');

  return opts;
}

function printUsage() {
  console.error('Usage: node scripts/deliver.cjs <mentor-name> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --api-url=URL     Override API base URL (default: production VPS)');
  console.error('  --local           Target local dev server (localhost:3005, uses JWT_SECRET)');
  console.error('  --dry-run         Show what would be uploaded without uploading');
  console.error('  --squad=name      Only deliver specific squad (brand-brain-gen|asset-gen|insights-feedback)');
  console.error('  --user-id=ID      Skip user lookup, use this userId directly');
  console.error('  --bb-status=ST    Brand Brain status (default: mentor_review)');
  console.error('');
  console.error('Squads scanned: ' + DELIVERABLE_SQUADS.join(', '));
}

// =============================================================================
// Auth
// =============================================================================

function mintAdminToken(useLocal = false) {
  const secret = useLocal
    ? process.env.JWT_SECRET
    : (process.env.VPS_JWT_SECRET || process.env.JWT_SECRET);
  if (!secret) throw new Error(`${useLocal ? 'JWT_SECRET' : 'VPS_JWT_SECRET'} not found in .env`);
  return jwt.sign(
    { userId: 'admin-001', role: 'admin', user: 'admin', name: 'Admin' },
    secret,
    { expiresIn: '1h' }
  );
}

// =============================================================================
// HTTP helpers
// =============================================================================

async function apiGet(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

async function apiPost(url, token, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`POST ${url} -> ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

// =============================================================================
// User lookup
// =============================================================================

async function lookupUser(apiUrl, token, mentorName) {
  // Convert slug to display name: "monica-cereser" -> "monica cereser"
  const displayName = mentorName.replace(/-/g, ' ');
  const url = `${apiUrl}/api/admin/diagnostic/_/full-export?name=${encodeURIComponent(displayName)}`;
  const data = await apiGet(url, token);
  if (!data.success || !data.data) {
    throw new Error(`User not found for name: "${displayName}"`);
  }
  return {
    userId: data.data.user_id,
    diagnosticId: data.data.id,
    name: data.data.name,
    email: data.data.email,
  };
}

// =============================================================================
// Squad output scanning
// =============================================================================

function scanSquadOutputs(mentorName, squadFilter) {
  const found = {};

  for (const squad of DELIVERABLE_SQUADS) {
    if (squadFilter && squadFilter !== squad) continue;

    const outputDir = path.join(SQUADS_DIR, squad, 'output', mentorName);
    if (fs.existsSync(outputDir)) {
      found[squad] = outputDir;
    }
  }

  return found;
}

function listAvailableMentors() {
  const mentorsBySquad = {};
  for (const squad of DELIVERABLE_SQUADS) {
    const dir = path.join(SQUADS_DIR, squad, 'output');
    if (fs.existsSync(dir)) {
      mentorsBySquad[squad] = fs.readdirSync(dir)
        .filter(f => !f.startsWith('.') && f !== 'archive' && fs.statSync(path.join(dir, f)).isDirectory());
    }
  }
  return mentorsBySquad;
}

// =============================================================================
// Delivery functions
// =============================================================================

// Valid BB status transitions — must step through each sequentially
const BB_STATUS_CHAIN = ['pending', 'generated', 'danilo_review', 'mentor_review', 'approved'];

async function deliverBrandBrain(outputDir, apiUrl, token, userId, targetStatus) {
  const sectionsDir = path.join(outputDir, 'sections');
  if (!fs.existsSync(sectionsDir)) {
    console.log('  -- No sections/ directory found, skipping Brand Brain');
    return false;
  }

  const body = { status: 'generated' }; // First valid transition from pending
  let sectionCount = 0;

  for (const [fileName, apiKey] of Object.entries(BB_SECTION_FILE_MAP)) {
    const filePath = path.join(sectionsDir, fileName);
    if (fs.existsSync(filePath)) {
      body[apiKey] = fs.readFileSync(filePath, 'utf-8');
      sectionCount++;
    }
  }

  if (sectionCount === 0) {
    console.log('  -- No section files found in sections/, skipping Brand Brain');
    return false;
  }

  // Upload content with initial status 'generated'
  await apiPost(`${apiUrl}/api/pipeline/${userId}/brand-brain`, token, body);
  console.log(`  [ok] Brand Brain uploaded (${sectionCount}/5 sections)`);

  // Auto-step through transitions to reach target status
  const targetIdx = BB_STATUS_CHAIN.indexOf(targetStatus);
  const startIdx = BB_STATUS_CHAIN.indexOf('generated');

  if (targetIdx > startIdx) {
    for (let i = startIdx + 1; i <= targetIdx; i++) {
      const nextStatus = BB_STATUS_CHAIN[i];
      await apiPost(`${apiUrl}/api/pipeline/${userId}/brand-brain`, token, { status: nextStatus });
      console.log(`  [ok] Status transitioned -> ${nextStatus}`);
    }
  }

  console.log(`  [ok] Final BB status: ${targetStatus}`);
  return true;
}

async function deliverEducationalSuggestions(outputDir, apiUrl, token, userId) {
  const filePath = path.join(outputDir, 'educational-suggestions.json');
  if (!fs.existsSync(filePath)) {
    console.log('  -- No educational-suggestions.json, skipping');
    return false;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const suggestions = raw.educational_suggestions || raw;

  if (!suggestions.marketing || !suggestions.vendas || !suggestions.modelo_de_negocios) {
    console.log('  -- educational-suggestions.json missing required keys (marketing/vendas/modelo_de_negocios), skipping');
    return false;
  }

  await apiPost(`${apiUrl}/api/admin/pipeline/${userId}/educational-suggestions`, token, suggestions);
  const counts = `${suggestions.marketing.length}m / ${suggestions.vendas.length}v / ${suggestions.modelo_de_negocios.length}n`;
  console.log(`  [ok] Educational Suggestions uploaded (${counts})`);
  return true;
}

async function deliverAssets(outputDir, apiUrl, token, userId) {
  const assetsDir = path.join(outputDir, 'assets');
  if (!fs.existsSync(assetsDir)) {
    console.log('  -- No assets/ directory found, skipping Assets');
    return false;
  }

  const assets = { readyToSell: {}, bonus: {} };
  let assetCount = 0;
  const assetNames = [];

  for (const [fileName, mapping] of Object.entries(ASSET_FILE_MAP)) {
    const filePath = path.join(assetsDir, fileName);
    if (fs.existsSync(filePath)) {
      assets[mapping.pack][mapping.key] = {
        content: fs.readFileSync(filePath, 'utf-8'),
        generatedAt: new Date().toISOString(),
        version: 1,
      };
      assetCount++;
      assetNames.push(mapping.key);
    }
  }

  if (assetCount === 0) {
    console.log('  -- No asset files found, skipping Assets');
    return false;
  }

  await apiPost(`${apiUrl}/api/pipeline/${userId}/assets`, token, { assets });
  console.log(`  [ok] Assets uploaded (${assetCount}/6): ${assetNames.join(', ')}`);
  return true;
}

async function deliverFeedback(outputDir, apiUrl, token, userId) {
  const filePath = path.join(outputDir, 'feedback.md');
  if (!fs.existsSync(filePath)) {
    console.log('  -- No feedback.md, skipping Feedback');
    return false;
  }

  const feedback = fs.readFileSync(filePath, 'utf-8');
  if (!feedback.trim()) {
    console.log('  -- feedback.md is empty, skipping');
    return false;
  }

  await apiPost(`${apiUrl}/api/admin/pipeline/${userId}/feedback`, token, { feedback });
  console.log(`  [ok] Feedback uploaded (${Math.round(feedback.length / 1024)}KB, ${feedback.split('\n').length} lines)`);
  return true;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const opts = parseArgs();

  if (!opts.mentorName) {
    printUsage();
    console.error('');

    // Show available mentors
    const mentors = listAvailableMentors();
    console.error('Available mentors per squad:');
    for (const [squad, names] of Object.entries(mentors)) {
      console.error(`  ${squad}: ${names.join(', ') || '(none)'}`);
    }
    process.exit(1);
  }

  console.log('');
  console.log(`Pipeline Delivery: ${opts.mentorName}`);
  console.log(`  API: ${opts.apiUrl}${opts.dryRun ? ' (DRY RUN)' : ''}`);

  // 1. Auth
  const token = mintAdminToken(opts.local);
  console.log(`  Token: admin JWT minted (${opts.local ? 'local' : 'production'})`);

  // 2. User lookup
  let userId = opts.userId;
  if (!userId) {
    try {
      const user = await lookupUser(opts.apiUrl, token, opts.mentorName);
      userId = user.diagnosticId;
      console.log(`  User: ${user.name} (${user.email}) -> ${userId}`);
    } catch (err) {
      console.error(`\n[ERROR] User lookup failed: ${err.message}`);
      console.error('  Tip: use --user-id=ID to skip lookup');
      process.exit(1);
    }
  } else {
    console.log(`  User: provided userId ${userId}`);
  }

  // 3. Scan outputs
  const outputs = scanSquadOutputs(opts.mentorName, opts.squad);
  const squadNames = Object.keys(outputs);

  if (squadNames.length === 0) {
    console.error(`\n[ERROR] No squad outputs found for "${opts.mentorName}"`);
    console.error(`  Scanned: ${SQUADS_DIR}`);
    const mentors = listAvailableMentors();
    console.error('  Available mentors:');
    for (const [squad, names] of Object.entries(mentors)) {
      console.error(`    ${squad}: ${names.join(', ') || '(none)'}`);
    }
    process.exit(1);
  }

  console.log(`  Outputs found: ${squadNames.join(', ')}`);

  // 4. Dry run — just list files
  if (opts.dryRun) {
    console.log('\n[DRY RUN] Would deliver:\n');
    for (const [squad, dir] of Object.entries(outputs)) {
      console.log(`  ${squad}/`);
      const listFiles = (d, prefix = '    ') => {
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) {
            console.log(`${prefix}${entry.name}/`);
            listFiles(full, prefix + '  ');
          } else {
            const size = fs.statSync(full).size;
            console.log(`${prefix}${entry.name} (${Math.round(size / 1024)}KB)`);
          }
        }
      };
      listFiles(dir);
      console.log('');
    }
    console.log('Re-run without --dry-run to upload.');
    return;
  }

  // 5. Deliver each squad
  const results = { success: [], skipped: [], failed: [] };

  for (const [squad, dir] of Object.entries(outputs)) {
    console.log(`\n[DELIVERING] ${squad}`);

    try {
      switch (squad) {
        case 'brand-brain-gen': {
          const bbOk = await deliverBrandBrain(dir, opts.apiUrl, token, userId, opts.bbStatus);
          (bbOk ? results.success : results.skipped).push('Brand Brain');

          const eduOk = await deliverEducationalSuggestions(dir, opts.apiUrl, token, userId);
          (eduOk ? results.success : results.skipped).push('Educational Suggestions');
          break;
        }
        case 'asset-gen': {
          const ok = await deliverAssets(dir, opts.apiUrl, token, userId);
          (ok ? results.success : results.skipped).push('Assets (6)');
          break;
        }
        case 'insights-feedback': {
          const ok = await deliverFeedback(dir, opts.apiUrl, token, userId);
          (ok ? results.success : results.skipped).push('Feedback');
          break;
        }
        default:
          console.log(`  -- Unknown squad "${squad}", skipping`);
          results.skipped.push(squad);
      }
    } catch (err) {
      console.error(`  [FAIL] ${squad}: ${err.message}`);
      results.failed.push(`${squad}: ${err.message}`);
    }
  }

  // 6. Summary
  console.log('\n' + '-'.repeat(60));
  console.log('DELIVERY SUMMARY');
  if (results.success.length) console.log(`  Delivered: ${results.success.join(', ')}`);
  if (results.skipped.length) console.log(`  Skipped:   ${results.skipped.join(', ')}`);
  if (results.failed.length) console.log(`  Failed:    ${results.failed.join(', ')}`);
  console.log('-'.repeat(60) + '\n');

  if (results.failed.length > 0) process.exit(1);
}

main().catch(err => {
  console.error(`\n[FATAL] ${err.message}`);
  process.exit(1);
});
