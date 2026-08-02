export interface JobRow {
  source_company: string;
  apply_url: string;
  title: string;
  location: string;
  description: string;
  first_seen_at: string;
  posted_at: string | null;
}

export function presentJob(row: JobRow) {
  return {
    company: row.source_company,
    applyUrl: row.apply_url,
    title: row.title,
    location: row.location,
    description: row.description,
    firstSeenAt: row.first_seen_at,
    postedAt: row.posted_at
  };
}

