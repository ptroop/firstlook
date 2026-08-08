-- Resume copies are reachable only through the authenticated Edge Function.
-- Do not add public storage policies for this bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resume-intake',
  'resume-intake',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/html'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
