'use strict';
const crypto   = require('crypto');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');
const Card     = require('../models/Card');
const config   = require('../config');
const logger   = require('../utils/logger');
const oauthSessions          = require('../utils/oauthSessions');
const { buildAuthUrl, exchangeCode, getUserInfo } = require('../services/linkedin-oauth');
const { uploadLinkedInPortrait } = require('../services/cloudinary');

const SALT_ROUNDS = 12;
const TOKEN_TTL   = '30d';

// CSRF nonces for OAuth state validation (in-memory, 10 min TTL)
const nonces = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of nonces) if (now > v.exp) nonces.delete(k);
}, 600_000);

function signToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), email: user.email, name: user.name },
    config.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function safeUser(user) {
  const { passwordHash: _, ...rest } = user.toObject();
  return rest;
}

async function signup(req, res, next) {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'email, password, and name are required' } });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Email already registered' } });
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ email, passwordHash, name });
    res.status(201).json({ token: signToken(user), user: safeUser(user) });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'email and password are required' } });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }
    res.json({ token: signToken(user), user: safeUser(user) });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    const card = await Card.findOne({ userId: user._id }).select('amCode').lean();
    res.json({ user, amCode: card?.amCode || null });
  } catch (err) {
    next(err);
  }
}

async function codeLogin(req, res, next) {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'email and code are required' } });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid email or code' } });
    }
    const card = await Card.findOne({ userId: user._id });
    if (!card?.amCode || card.amCode !== code.toUpperCase()) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid email or code' } });
    }
    res.json({
      token:       signToken(user),
      cardId:      card._id.toString(),
      imageUrl:    card.imageUrl || null,
      amCode:      card.amCode,
      photoLocked: user.photoLocked || false,
    });
  } catch (err) {
    next(err);
  }
}

// ── LinkedIn OAuth ────────────────────────────────────────────────────────────

function linkedinAuth(req, res) {
  if (!config.LINKEDIN_CLIENT_ID) {
    return res.status(503).json({ error: 'LinkedIn OAuth not configured' });
  }
  const intent = req.query.intent === 'existing' ? 'existing' : 'new';
  const nonce  = crypto.randomBytes(16).toString('hex');
  nonces.set(nonce, { intent, exp: Date.now() + 600_000 });
  const state = Buffer.from(JSON.stringify({ intent, nonce })).toString('base64url');
  res.redirect(buildAuthUrl(state));
}

async function linkedinCallback(req, res) {
  const frontendOrigin = config.FRONTEND_ORIGIN === '*' ? 'http://localhost:8000' : config.FRONTEND_ORIGIN;

  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${frontendOrigin}?oauth_error=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return res.redirect(`${frontendOrigin}?oauth_error=missing_params`);
    }

    let intent, nonce;
    try {
      ({ intent, nonce } = JSON.parse(Buffer.from(state, 'base64url').toString()));
    } catch {
      return res.redirect(`${frontendOrigin}?oauth_error=bad_state`);
    }

    const nonceData = nonces.get(nonce);
    nonces.delete(nonce);
    if (!nonceData || Date.now() > nonceData.exp) {
      return res.redirect(`${frontendOrigin}?oauth_error=expired`);
    }

    const tokenData  = await exchangeCode(code);
    const liProfile  = await getUserInfo(tokenData.access_token, tokenData.id_token);

    const email = liProfile.email?.toLowerCase();
    if (!email) {
      return res.redirect(`${frontendOrigin}?oauth_error=no_email`);
    }

    const rawPhoto = liProfile.picture || null;

    let user  = await User.findOne({ email });
    let isNew = false;

    if (!user) {
      if (intent === 'existing') {
        return res.redirect(`${frontendOrigin}?oauth_error=not_found`);
      }
      const passwordHash = await bcrypt.hash(email + '_am', SALT_ROUNDS);
      user = await User.create({
        email,
        passwordHash,
        name:        liProfile.name || email.split('@')[0],
        portraitUrl: rawPhoto,
      });
      isNew = true;
    }

    // Upload to Cloudinary with AI upscale — runs for both new and returning users
    // (skipped if user has locked their own photo)
    if (rawPhoto && !user.photoLocked) {
      try {
        const upscaledUrl = await uploadLinkedInPortrait(rawPhoto, user._id.toString());
        const portraitUpdate = { portraitUrl: upscaledUrl };
        if (!user.linkedinPortraitUrl) portraitUpdate.linkedinPortraitUrl = upscaledUrl;
        user = await User.findByIdAndUpdate(
          user._id,
          { $set: portraitUpdate },
          { new: true }
        );
      } catch (err) {
        logger.warn({ err }, 'Cloudinary portrait upload failed, using LinkedIn URL directly');
      }
    }

    const card = await Card.findOne({ userId: user._id });

    const sessionCode = oauthSessions.store({
      token:       signToken(user),
      name:        user.name,
      email:       user.email,
      photo:       user.portraitUrl,
      photoLocked: user.photoLocked || false,
      isNew,
      hasCard:     !!(card?.imageUrl),
      cardId:      card?._id?.toString() || null,
      imageUrl:    card?.imageUrl || null,
      amCode:      card?.amCode  || null,
    });

    res.redirect(`${frontendOrigin}?oauth=${sessionCode}`);
  } catch (err) {
    logger.error(err, 'LinkedIn callback error');
    const frontendFallback = config.FRONTEND_ORIGIN === '*' ? 'http://localhost:8000' : config.FRONTEND_ORIGIN;
    res.redirect(`${frontendFallback}?oauth_error=server`);
  }
}

async function linkedinExchange(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code required' });
  const session = oauthSessions.consume(code);
  if (!session) return res.status(410).json({ error: 'Code expired or already used' });
  const { exp: _, ...data } = session;
  res.json(data);
}

module.exports = { signup, login, me, codeLogin, linkedinAuth, linkedinCallback, linkedinExchange };
