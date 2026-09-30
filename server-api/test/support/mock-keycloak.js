/* eslint-disable */
// Minimal Keycloak stand-in for the e2e tests: realms "customers" (OIDC, PKCE)
// and "machines" (client credentials). Real RS256 tokens, separate keys per realm.
// Test hooks: POST /_next, /_revoke, /_mode, /realms/machines/_mint; GET /_stats.
const http = require('http');
const { createHash, randomBytes } = require('crypto');
const { exportJWK, generateKeyPair, SignJWT } = require('jose');

const PORT = Number(process.argv[2] || 8181);
const BASE = `http://localhost:${PORT}`;
const C_ISS = `${BASE}/realms/customers`;
const M_ISS = `${BASE}/realms/machines`;
const CLIENT = { id: 'carbonoz-login', secret: 'test-secret' };
const MACHINES = { 'solarbms-pi-kc': 'machine-secret' };

(async () => {
  const cKeys = await generateKeyPair('RS256');
  const mKeys = await generateKeyPair('RS256');
  const cJwk = { ...(await exportJWK(cKeys.publicKey)), kid: 'c1', alg: 'RS256', use: 'sig' };
  const mJwk = { ...(await exportJWK(mKeys.publicKey)), kid: 'm1', alg: 'RS256', use: 'sig' };

  let next = null; // user for the next authorize request
  const codes = new Map();
  const refresh = new Map();
  let revoked = false;
  let mode = { mode: 'normal', delayMs: 0 };
  const stats = { tokenRequests: 0, refreshRequests: 0 };

  const body = (req) => new Promise((r) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => r(s)); });
  const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const idToken = (c, nonce) =>
    new SignJWT({ email: c.email, email_verified: c.email_verified, nonce, azp: CLIENT.id })
      .setProtectedHeader({ alg: 'RS256', kid: 'c1' }).setSubject(c.sub)
      .setIssuer(C_ISS).setAudience(CLIENT.id).setIssuedAt().setExpirationTime('5m').sign(cKeys.privateKey);
  const machineToken = (o) => {
    const iss = o.realm === 'customers' ? C_ISS : M_ISS;
    const key = o.realm === 'customers' ? cKeys.privateKey : mKeys.privateKey;
    const kid = o.realm === 'customers' ? 'c1' : 'm1';
    return new SignJWT({ azp: o.clientId, client_id: o.clientId, realm_access: { roles: o.roles || ['solarbms-ingest'] } })
      .setProtectedHeader({ alg: 'RS256', kid }).setSubject('service-account-' + o.clientId)
      .setIssuer(iss).setAudience(o.aud || 'carbonoz-ingest').setIssuedAt().setExpirationTime(o.exp || '5m').sign(key);
  };
  const discovery = (iss) => ({
    issuer: iss,
    authorization_endpoint: `${iss}/protocol/openid-connect/auth`,
    token_endpoint: `${iss}/protocol/openid-connect/token`,
    end_session_endpoint: `${iss}/protocol/openid-connect/logout`,
    jwks_uri: `${iss}/protocol/openid-connect/certs`,
  });

  http.createServer(async (req, res) => {
    const url = new URL(req.url, BASE);
    const p = url.pathname;
    try {
      if (p === '/_next' && req.method === 'POST') { next = JSON.parse(await body(req)); return json(res, 200, next); }
      if (p === '/_revoke' && req.method === 'POST') { revoked = true; return json(res, 200, {}); }
      if (p === '/_unrevoke' && req.method === 'POST') { revoked = false; return json(res, 200, {}); }
      if (p === '/_mode' && req.method === 'POST') { mode = JSON.parse(await body(req)); return json(res, 200, mode); }
      if (p === '/_stats') return json(res, 200, stats);

      if (p.startsWith('/realms/machines')) {
        const q = p.replace('/realms/machines', '');
        if (q === '/protocol/openid-connect/certs') return json(res, 200, { keys: [mJwk] });
        if (q === '/_mint' && req.method === 'POST') return json(res, 200, { token: await machineToken(JSON.parse(await body(req))) });
        if (q === '/protocol/openid-connect/token' && req.method === 'POST') {
          const f = new URLSearchParams(await body(req));
          if (f.get('grant_type') !== 'client_credentials' || MACHINES[f.get('client_id')] !== f.get('client_secret')) return json(res, 401, { error: 'invalid_client' });
          return json(res, 200, { access_token: await machineToken({ clientId: f.get('client_id') }), expires_in: 300 });
        }
        return json(res, 404, {});
      }

      const q = p.replace('/realms/customers', '');
      if (q === '/.well-known/openid-configuration') return json(res, 200, discovery(C_ISS));
      if (q === '/protocol/openid-connect/certs') return json(res, 200, { keys: [cJwk] });
      if (q === '/protocol/openid-connect/auth') {
        const s = url.searchParams;
        if (s.get('client_id') !== CLIENT.id || s.get('code_challenge_method') !== 'S256') return json(res, 400, { error: 'bad_request' });
        if (!next) return json(res, 400, { error: 'no test user queued (POST /_next)' });
        const code = randomBytes(16).toString('hex');
        codes.set(code, { claims: next, nonce: s.get('nonce'), challenge: s.get('code_challenge'), redirect: s.get('redirect_uri') });
        next = null;
        res.writeHead(302, { location: `${s.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(s.get('state'))}` });
        return res.end();
      }
      if (q === '/protocol/openid-connect/token' && req.method === 'POST') {
        stats.tokenRequests++;
        const f = new URLSearchParams(await body(req));
        if (f.get('grant_type') === 'refresh_token') stats.refreshRequests++;
        if (mode.delayMs) await new Promise((r) => setTimeout(r, mode.delayMs));
        if (mode.mode === 'down') return json(res, 503, { error: 'unavailable' });
        const [id, secret] = Buffer.from((req.headers.authorization || '').replace('Basic ', ''), 'base64').toString().split(':');
        if (id !== CLIENT.id || secret !== CLIENT.secret) return json(res, 401, { error: 'invalid_client' });
        if (f.get('grant_type') === 'authorization_code') {
          const c = codes.get(f.get('code')); codes.delete(f.get('code'));
          if (!c || c.redirect !== f.get('redirect_uri')) return json(res, 400, { error: 'invalid_grant' });
          if (createHash('sha256').update(f.get('code_verifier') || '').digest('base64url') !== c.challenge) return json(res, 400, { error: 'invalid_grant' });
          const rt = randomBytes(16).toString('hex'); refresh.set(rt, c.claims);
          return json(res, 200, { access_token: 'at', id_token: await idToken(c.claims, c.nonce), refresh_token: rt, expires_in: c.claims.expiresIn ?? 300 });
        }
        if (f.get('grant_type') === 'refresh_token') {
          const claims = refresh.get(f.get('refresh_token'));
          if (!claims || revoked) return json(res, 400, { error: 'invalid_grant' });
          return json(res, 200, { access_token: 'at2', refresh_token: f.get('refresh_token'), expires_in: claims.expiresIn ?? 300 });
        }
      }
      if (q === '/protocol/openid-connect/logout') { res.writeHead(200); return res.end('logged out'); }
      json(res, 404, {});
    } catch (e) {
      json(res, 500, { error: String(e) });
    }
  }).listen(PORT, () => console.log(`mock keycloak on ${PORT}`));
})();
