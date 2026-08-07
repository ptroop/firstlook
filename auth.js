(function () {
  const SESSION_KEY = 'first-look-auth-session-v1';
  const VERIFIER_KEY = 'first-look-auth-verifier-v1';
  const listeners = [];
  let session = loadSession();

  function isConfigured() {
    return Boolean(window.SUPABASE_URL && window.SUPABASE_ANON_KEY);
  }

  function baseUrl() {
    return String(window.SUPABASE_URL || '').replace(/\/+$/, '');
  }

  function loadSession() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return parsed && parsed.access_token ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  function persist(next) {
    session = next;
    try {
      if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else localStorage.removeItem(SESSION_KEY);
    } catch (_error) { /* private mode */ }
    notify();
  }

  function notify() {
    listeners.forEach((fn) => { try { fn(currentUser()); } catch (_error) { /* keep going */ } });
  }

  function currentUser() {
    return session && session.email ? { id: session.userId || '', email: session.email } : null;
  }

  function sessionToken() {
    return session?.access_token || '';
  }

  function onAuthChange(fn) {
    listeners.push(fn);
    fn(currentUser());
  }

  async function request(path, body, token) {
    if (!isConfigured()) throw new Error('Auth is not configured.');
    const headers = { apikey: window.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_error) { data = null; }
    if (!response.ok) {
      throw new Error(data?.msg || data?.error_description || data?.error || `Auth request failed (${response.status})`);
    }
    return data;
  }

  function randomVerifier() {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async function sha256Base64Url(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function emailValid(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
  }

  async function sendMagicLink(email) {
    const address = String(email || '').trim();
    if (!emailValid(address)) throw new Error('Enter a valid email address.');
    const verifier = randomVerifier();
    localStorage.setItem(VERIFIER_KEY, verifier);
    const codeChallenge = await sha256Base64Url(verifier);
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    await request('/auth/v1/otp', {
      email: address,
      create_user: true,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      email_redirect_to: redirectTo,
    });
    return address;
  }

  async function exchangeCode(code) {
    const verifier = localStorage.getItem(VERIFIER_KEY) || '';
    localStorage.removeItem(VERIFIER_KEY);
    if (!verifier) throw new Error('This sign-in link has expired or was opened on another device. Request a new one.');
    const data = await request('/auth/v1/token?grant_type=pkce', { code, code_verifier: verifier });
    adoptSession(data);
    return currentUser();
  }

  async function verifyOtpCode(email, code) {
    const data = await request('/auth/v1/token?grant_type=otp', {
      email: String(email || '').trim(),
      token: String(code || '').trim(),
    });
    localStorage.removeItem(VERIFIER_KEY);
    adoptSession(data);
    return currentUser();
  }

  function adoptSession(data) {
    const expiresIn = Number(data?.expires_in) || 3600;
    persist({
      access_token: data?.access_token || '',
      refresh_token: data?.refresh_token || '',
      expires_at: Date.now() + expiresIn * 1000,
      userId: data?.user?.id || '',
      email: data?.user?.email || '',
    });
  }

  async function refreshSession() {
    if (!session?.refresh_token) return null;
    try {
      const data = await request('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      adoptSession(data);
      return currentUser();
    } catch (_error) {
      persist(null);
      return null;
    }
  }

  async function signOut() {
    if (session?.access_token) {
      try { await request('/auth/v1/logout', {}, session.access_token); } catch (_error) { /* local sign-out still happens */ }
    }
    localStorage.removeItem(VERIFIER_KEY);
    persist(null);
  }

  // On load: exchange a magic-link code from the URL, or silently refresh a
  // near-expired session. Runs before any UI registers so the first render
  // already sees the signed-in state.
  (async function boot() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      try {
        await exchangeCode(code);
      } catch (_error) { /* fall through to signed-out state */ }
      if (window.history?.replaceState) window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    if (session?.refresh_token && Date.now() > (session.expires_at || 0) - 60_000) {
      refreshSession().catch(() => {});
    }
  })();

  window.FirstLookAuth = {
    isConfigured,
    sendMagicLink,
    exchangeCode,
    verifyOtpCode,
    signOut,
    currentUser,
    sessionToken,
    onAuthChange,
    refresh: refreshSession,
  };
}());
