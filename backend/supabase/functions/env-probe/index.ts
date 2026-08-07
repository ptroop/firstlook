Deno.serve(() => new Response(JSON.stringify({
  VAPID_SUBJECT: Boolean(Deno.env.get('VAPID_SUBJECT')),
  VAPID_PUBLIC_KEY: Boolean(Deno.env.get('VAPID_PUBLIC_KEY')),
  VAPID_PRIVATE_KEY: Boolean(Deno.env.get('VAPID_PRIVATE_KEY')),
  PUSH_TOKEN: Boolean(Deno.env.get('PUSH_TOKEN')),
  SCAN_TOKEN: Boolean(Deno.env.get('SCAN_TOKEN')),
  ALLOWED_ORIGIN: Boolean(Deno.env.get('ALLOWED_ORIGIN')),
  SUPABASE_URL: Boolean(Deno.env.get('SUPABASE_URL')),
}), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
}));
