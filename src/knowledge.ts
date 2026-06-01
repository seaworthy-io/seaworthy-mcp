import knowledgeData from './knowledge.json';

interface PageEntry {
  slug: string;
  title: string;
  description: string | null;
  url: string;
  publishDate: string | null;
  tldr: string | null;
}

interface CarrierRow {
  carrier: string;
  product: string;
  ownOcc: string;
  strengths: string[];
  dividendPotential: boolean;
  profile: string;
  bestFor: string;
}

interface Rider {
  name: string;
  worthIt: string;
  audience: string;
  summary: string;
  reference: string;
}

export interface Knowledge {
  generatedAt: string;
  siteUrl: string;
  sections: {
    specialties: Record<string, PageEntry>;
    education: Record<string, PageEntry>;
    carriers: Record<string, PageEntry>;
    associations: Record<string, PageEntry>;
  };
  carrierMatrix: CarrierRow[];
  riders: Rider[];
}

export const knowledge = knowledgeData as Knowledge;

export function resolveSpecialty(profession: string): PageEntry | null {
  if (!profession) return null;
  const key = profession.toLowerCase().replace(/\s+/g, '-');
  const specialties = knowledge.sections.specialties;
  if (specialties[key]) return specialties[key];
  const singular = key.endsWith('s') ? key.slice(0, -1) : null;
  if (singular && specialties[singular]) return specialties[singular];
  const plural = !key.endsWith('s') ? key + 's' : null;
  if (plural && specialties[plural]) return specialties[plural];
  for (const entry of Object.values(specialties)) {
    if (entry.title.toLowerCase().includes(key)) return entry;
  }
  return null;
}

export function resolveEducation(topic: string): PageEntry | null {
  if (!topic) return null;
  const key = topic.toLowerCase().replace(/\s+/g, '-');
  const education = knowledge.sections.education;
  if (education[key]) return education[key];
  for (const entry of Object.values(education)) {
    if (entry.title.toLowerCase().includes(key) || entry.slug.includes(key)) return entry;
  }
  return null;
}

export function listSpecialtyIndex(): Array<{ slug: string; title: string; url: string }> {
  return Object.values(knowledge.sections.specialties).map((s) => ({
    slug: s.slug,
    title: s.title,
    url: s.url
  }));
}
