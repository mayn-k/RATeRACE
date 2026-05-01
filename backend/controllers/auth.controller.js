'use strict';
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const Card   = require('../models/Card');
const config = require('../config');

const SALT_ROUNDS = 12;
const TOKEN_TTL   = '30d';

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
    res.json({ user });
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
    res.json({ token: signToken(user), cardId: card._id.toString(), imageUrl: card.imageUrl || null });
  } catch (err) {
    next(err);
  }
}

module.exports = { signup, login, me, codeLogin };
