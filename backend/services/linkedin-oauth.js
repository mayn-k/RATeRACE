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

async function getUserInfo(accessToken) {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('LinkedIn userinfo fetch failed');
  return res.json();
}

module.exports = { buildAuthUrl, exchangeCode, getUserInfo };
