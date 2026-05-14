'use strict';
const config = require('../config');

const AUTH_URL     = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL    = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

function buildAuthUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     config.LINKEDIN_CLIENT_ID,
    redirect_uri:  config.LINKEDIN_REDIRECT_URI,
    state,
    scope:         'openid profile email',
  });
  return `${AUTH_URL}?${params}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  config.LINKEDIN_REDIRECT_URI,
    client_id:     config.LINKEDIN_CLIENT_ID,
    client_secret: config.LINKEDIN_CLIENT_SECRET,
  });
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  if (!res.ok) throw new Error(`LinkedIn token exchange failed (${res.status})`);
  return res.json();
}

async function getUserInfo(accessToken, idToken) {
  // Prefer decoding the id_token payload locally — avoids an extra round-trip to api.linkedin.com
  if (idToken) {
    try {
      const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
      if (payload.email) {
        return {
          sub:     payload.sub    || null,
          email:   payload.email,
          name:    payload.name   || `${payload.given_name || ''} ${payload.family_name || ''}`.trim() || null,
          picture: payload.picture || null,
        };
      }
    } catch (_) { /* fall through to network */ }
  }

  // Fallback: userinfo endpoint with a 10-second timeout
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal:  ctrl.signal,
    });
    if (!res.ok) throw new Error(`LinkedIn userinfo fetch failed (${res.status})`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { buildAuthUrl, exchangeCode, getUserInfo };
