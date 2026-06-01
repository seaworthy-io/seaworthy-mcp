#!/usr/bin/env node
// Bundle Astro page metadata into a JSON file the MCP Worker ships.
// Extracts title, description, publishDate, and tldr from the frontmatter
// of each .astro page in specialties/, education/, carriers/. Snapshots at
// deploy time; the Worker stays fast and has no runtime dependency on the
// live site.

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASTRO_SRC = join(__dirname, '..', '..', 'astro-site', 'src', 'pages');
const OUT_PATH = join(__dirname, '..', 'src', 'knowledge.json');

const SITE_URL = 'https://disabilityinsurance.io';

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

function bundleSection(section, dirName) {
  const dir = join(ASTRO_SRC, dirName);
  const files = listAstroFiles(dir);
  const entries = {};
  for (const f of files) {
    const slug = basename(f, '.astro');
    if (slug === 'index') continue;
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
  return entries;
}

const knowledge = {
  generatedAt: new Date().toISOString(),
  siteUrl: SITE_URL,
  sections: {
    specialties: bundleSection('specialties', 'specialties'),
    education: bundleSection('education', 'education'),
    carriers: bundleSection('carriers', 'carriers'),
    associations: bundleSection('associations', 'associations')
  },
  carrierMatrix: [
    {
      carrier: 'Guardian',
      product: 'ProVider Plus',
      ownOcc: 'True own-occupation with industry-leading contract language',
      strengths: ['Financial strength', 'Claims handling reputation', 'Strong mental/nervous clauses in select states'],
      dividendPotential: false,
      profile: `${SITE_URL}/carriers/guardian/`,
      bestFor: 'Physicians, dentists, high earners who prioritize claims reputation'
    },
    {
      carrier: 'MassMutual',
      product: 'Radius',
      ownOcc: 'True own-occupation; specialist-friendly language',
      strengths: ['Mutual company dividends', 'Long-term policyholder value', 'Competitive for financial professionals'],
      dividendPotential: true,
      profile: `${SITE_URL}/carriers/massmutual/`,
      bestFor: 'Professionals valuing long-term dividend potential'
    },
    {
      carrier: 'Principal',
      product: 'Individual DI',
      ownOcc: 'True own-occupation; strong surgical language',
      strengths: ['Competitive surgical/dental rates', 'Thorough underwriting', 'Catastrophic Disability rider'],
      dividendPotential: false,
      profile: `${SITE_URL}/carriers/principal/`,
      bestFor: 'Surgeons, dentists, and procedural specialists'
    },
    {
      carrier: 'Ameritas',
      product: 'DInamic',
      ownOcc: 'True own-occupation; competitive contract',
      strengths: ['Efficient underwriting', 'Competitive pricing', 'Straightforward contract'],
      dividendPotential: false,
      profile: `${SITE_URL}/carriers/ameritas/`,
      bestFor: 'Value-conscious professionals'
    },
    {
      carrier: 'The Standard',
      product: 'Platinum Advantage',
      ownOcc: 'True own-occupation; clear contract language',
      strengths: ['Contract clarity', 'Strong across career stages', 'Survivor Benefit rider'],
      dividendPotential: false,
      profile: `${SITE_URL}/carriers/the-standard/`,
      bestFor: 'Professionals across career stages seeking clear language'
    }
  ],
  riders: [
    {
      name: 'Residual (Partial) Disability',
      worthIt: 'almost always',
      audience: 'every high earner',
      summary: 'Pays a proportional benefit when a covered disability reduces income by roughly 15-20% or more. Most disabilities are partial, not total; without this rider a policy only pays when you cannot work at all.',
      reference: `${SITE_URL}/education/residual-disability-benefits/`
    },
    {
      name: 'Cost-of-Living Adjustment (COLA)',
      worthIt: 'high value under age 45',
      audience: 'early- and mid-career professionals',
      summary: 'Increases the monthly benefit during long claims to keep pace with inflation. Compound 3% is the standard structure. Value drops materially past age 50 because the remaining benefit horizon shortens.',
      reference: `${SITE_URL}/education/cola-rider/`
    },
    {
      name: 'Future Increase Option (FIO)',
      worthIt: 'essential for early career',
      audience: 'residents, fellows, early-career professionals',
      summary: 'Locks in insurability. Lets the insured buy more coverage as income rises without new medical underwriting. Typically available until age 55 or a set number of years.',
      reference: `${SITE_URL}/education/future-increase-options/`
    },
    {
      name: 'Own-Occupation Enhancement',
      worthIt: 'depends on base contract',
      audience: 'anyone with a modified-own-occ base policy',
      summary: 'Extends the true own-occupation definition beyond the standard 24-month transition if the base contract is modified own-occ. Not needed when the base policy is true own-occ to age 65 by default.',
      reference: `${SITE_URL}/education/own-occupation-definitions-by-carrier/`
    },
    {
      name: 'Retirement Protection',
      worthIt: 'context-dependent',
      audience: 'high earners with significant retirement-savings goals',
      summary: 'Continues retirement-fund contributions during a disability. Valuable with a long career horizon and large retirement-savings targets; less valuable for late-career buyers.',
      reference: `${SITE_URL}/education/retirement-protection-rider/`
    },
    {
      name: 'Return of Premium',
      worthIt: 'rarely',
      audience: 'few scenarios justify the cost',
      summary: 'Adds roughly 30-50% to the base premium. The opportunity cost of the extra premium invested elsewhere almost always exceeds the returned amount.',
      reference: `${SITE_URL}/education/return-of-premium-rider/`
    },
    {
      name: 'Catastrophic Disability',
      worthIt: 'rarely',
      audience: 'niche',
      summary: 'Adds benefit for severe disabilities (loss of two or more activities of daily living). Coverage is meaningful but catastrophic disabilities are rare; cost-to-expected-value is typically unfavorable.',
      reference: `${SITE_URL}/education/catastrophic-disability-rider/`
    },
    {
      name: 'Social Insurance Supplement',
      worthIt: 'rarely for high earners',
      audience: 'lower-income buyers only',
      summary: 'Pays if a Social Security disability claim is denied. Most high earners will not qualify for SSDI under the "any occupation" standard, so the trigger rarely fires usefully.',
      reference: `${SITE_URL}/education/social-insurance-supplement/`
    }
  ]
};

writeFileSync(OUT_PATH, JSON.stringify(knowledge, null, 2) + '\n');
const specCount = Object.keys(knowledge.sections.specialties).length;
const eduCount = Object.keys(knowledge.sections.education).length;
const carrierCount = Object.keys(knowledge.sections.carriers).length;
const assocCount = Object.keys(knowledge.sections.associations).length;
console.log(`knowledge.json written: ${specCount} specialties, ${eduCount} education, ${carrierCount} carriers, ${assocCount} associations, ${knowledge.carrierMatrix.length} carriers matrixed, ${knowledge.riders.length} riders`);
