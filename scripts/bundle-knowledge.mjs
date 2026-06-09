#!/usr/bin/env node
// Bundle the MCP Worker's knowledge.json on deploy.
//  - specialties / education / carriers / associations: derived from Astro page frontmatter
//    (title, description, publishDate, tldr), so they always match the live pages.
//  - carrierMatrix + riders: read from CONTENT-TRUTH.md §13 (the single source of truth),
//    NOT hardcoded here, so a carrier/rider fact changes in exactly one place.
// Snapshots at deploy time; the Worker stays fast with no runtime dependency on the live site.

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASTRO_SRC = join(__dirname, '..', '..', 'astro-site', 'src', 'pages');
// Content-collection articles (2026-06 migration): most education/specialty/
// association articles live as markdown in src/content/articles/<section>/,
// not as .astro pages. Both locations must be scanned or the knowledge
// silently loses those entries.
const ARTICLES_SRC = join(__dirname, '..', '..', 'astro-site', 'src', 'content', 'articles');
const CONTENT_TRUTH = join(__dirname, '..', '..', '..', 'CONTENT-TRUTH.md');

// Noindex routes (paid LPs, utility pages) stay OUT of agent-facing knowledge:
// an AI agent should never be steered to an ads-only landing page when the
// canonical organic page exists. Same single source the robots meta and
// sitemap use.
const { NOINDEX_ROUTES } = await import(
  join(__dirname, '..', '..', 'astro-site', 'src', 'data', 'noindex-routes.js')
);
const OUT_PATH = join(__dirname, '..', 'src', 'knowledge.json');

const SITE_URL = 'https://seaworthy.io';

function listAstroFiles(dir) {
  const entries = readdirSync(dir);
  const out = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isFile() && entry.endsWith('.astro')) out.push(full);
  }
  return out;
}

function extract(content, varName) {
  // Pattern A: `const <varName> = "..."` (top-level const)
  const topLevel = new RegExp(`const\\s+${varName}\\s*=\\s*(["'\`])([\\s\\S]*?)\\1\\s*;?`, 'm');
  const a = content.match(topLevel);
  if (a) return a[2].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\'/g, "'").trim();
  // Pattern B: inside `const frontmatter = { <varName>: "..." }`
  const inObject = new RegExp(`(?:^|[,{\\s])${varName}\\s*:\\s*(["'\`])([\\s\\S]*?)\\1\\s*(?:,|\\n|})`, 'm');
  const b = content.match(inObject);
  if (b) return b[2].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\'/g, "'").trim();
  return null;
}

function firstParagraphAfterHero(content) {
  const body = content.split('---').slice(2).join('---');
  const paragraphMatch = body.match(/<p[^>]*>([\s\S]*?)<\/p>/);
  if (!paragraphMatch) return null;
  const stripped = paragraphMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return stripped.length > 40 ? stripped : null;
}

// YAML frontmatter field from a markdown article. Handles quoted and
// unquoted scalar values on a single line (the shape our frontmatter uses).
function extractYaml(content, fieldName) {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const m = fm[1].match(new RegExp(`^${fieldName}:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)'|(.+))$`, 'm'));
  if (!m) return null;
  const v = (m[1] ?? m[2] ?? m[3] ?? '').trim();
  return v ? v.replace(/\\"/g, '"').replace(/\\'/g, "'") : null;
}

function firstParagraphOfMarkdown(content) {
  const body = content.replace(/^---\n[\s\S]*?\n---/, '');
  const paragraphMatch = body.match(/<p[^>]*>([\s\S]*?)<\/p>/);
  if (!paragraphMatch) return null;
  const stripped = paragraphMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return stripped.length > 40 ? stripped : null;
}

function listMdFiles(dir) {
  try {
    return readdirSync(dir).map((e) => join(dir, e)).filter((f) => f.endsWith('.md') && statSync(f).isFile());
  } catch {
    return [];
  }
}

function bundleSection(dirName) {
  const entries = {};
  // .astro pages still in src/pages/<dirName>/ (hubs, carrier reviews, etc.)
  for (const f of listAstroFiles(join(ASTRO_SRC, dirName))) {
    const slug = basename(f, '.astro');
    if (slug === 'index') continue;
    if (NOINDEX_ROUTES.includes(`/${dirName}/${slug}/`)) continue;
    const src = readFileSync(f, 'utf8');
    const title = extract(src, 'title');
    const description = extract(src, 'description');
    const publishDate = extract(src, 'publishDate');
    const tldr = extract(src, 'tldr') || firstParagraphAfterHero(src);
    if (!title) continue;
    entries[slug] = {
      slug,
      title,
      description: description || null,
      url: `${SITE_URL}/${dirName}/${slug}/`,
      publishDate: publishDate || null,
      tldr: tldr || null
    };
  }
  // Markdown articles in the content collection for the same section.
  for (const f of listMdFiles(join(ARTICLES_SRC, dirName))) {
    const slug = basename(f, '.md');
    if (NOINDEX_ROUTES.includes(`/${dirName}/${slug}/`)) continue;
    const src = readFileSync(f, 'utf8');
    const title = extractYaml(src, 'title');
    if (!title) continue;
    entries[slug] = {
      slug,
      title,
      description: extractYaml(src, 'description'),
      url: `${SITE_URL}/${dirName}/${slug}/`,
      publishDate: extractYaml(src, 'publishDate'),
      tldr: extractYaml(src, 'tldr') || firstParagraphOfMarkdown(src)
    };
  }
  return entries;
}

// Read carrierMatrix + riders from the single source of truth (CONTENT-TRUTH.md §13).
function readStructured() {
  const md = readFileSync(CONTENT_TRUTH, 'utf8');
  const after13 = md.split(/^##\s+13\.\s/m)[1];
  if (!after13) throw new Error('bundle-knowledge: CONTENT-TRUTH.md §13 (MCP structured data) not found');
  const sec = after13.split(/^##\s+1[4-9]\.\s/m)[0]; // bound to §13 (stop at §14+)
  const m = sec.match(/```json\s*([\s\S]*?)```/);
  if (!m) throw new Error('bundle-knowledge: no ```json block in CONTENT-TRUTH.md §13');
  const data = JSON.parse(m[1]);
  if (!Array.isArray(data.carrierMatrix) || !Array.isArray(data.riders)) {
    throw new Error('bundle-knowledge: §13 JSON missing carrierMatrix/riders arrays');
  }
  return data;
}

const structured = readStructured();

const knowledge = {
  generatedAt: new Date().toISOString(),
  siteUrl: SITE_URL,
  sections: {
    specialties: bundleSection('specialties'),
    education: bundleSection('education'),
    carriers: bundleSection('carriers'),
    associations: bundleSection('associations')
  },
  carrierMatrix: structured.carrierMatrix,
  riders: structured.riders
};

writeFileSync(OUT_PATH, JSON.stringify(knowledge, null, 2) + '\n');
const specCount = Object.keys(knowledge.sections.specialties).length;
const eduCount = Object.keys(knowledge.sections.education).length;
const carrierCount = Object.keys(knowledge.sections.carriers).length;
const assocCount = Object.keys(knowledge.sections.associations).length;
console.log(`knowledge.json written: ${specCount} specialties, ${eduCount} education, ${carrierCount} carriers, ${assocCount} associations, ${knowledge.carrierMatrix.length} carriers matrixed (from CONTENT-TRUTH §13), ${knowledge.riders.length} riders`);
