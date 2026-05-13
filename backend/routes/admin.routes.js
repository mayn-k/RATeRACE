'use strict';
const express          = require('express');
const path             = require('path');
const jwt              = require('jsonwebtoken');
const mongoose         = require('mongoose');
const config           = require('../config');
const adminAuth        = require('../middleware/adminAuth');
const User             = require('../models/User');
const Card             = require('../models/Card');
const { buildCardData }    = require('../services/cardData');
const { renderCard }       = require('../services/puppeteer');
const { uploadCardImage }  = require('../services/cloudinary');
const ApiUsage             = require('../models/ApiUsage');

const router = express.Router();

// ── Serve admin UI ────────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../admin.html'));
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/api/auth', (req, res) => {
  const { secret } = req.body;
  if (!secret || secret !== config.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Invalid secret' });
  }
  const token = jwt.sign({ admin: true }, config.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// ── All routes below require admin JWT ───────────────────────────────────────
router.use('/api', adminAuth);

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/api/stats', async (_req, res, next) => {
  try {
    const [users, cards, cardsWithImage] = await Promise.all([
      User.countDocuments(),
      Card.countDocuments(),
      Card.countDocuments({ imageUrl: { $ne: null } }),
    ]);
    res.json({ users, cards, cardsWithImage });
  } catch (err) { next(err); }
});

// ── API Usage ─────────────────────────────────────────────────────────────────
router.get('/api/usage', async (_req, res, next) => {
  try {
    const [totalsArr, byType, perUser] = await Promise.all([
      ApiUsage.aggregate([
        {
          $group: {
            _id:            null,
            requests:       { $sum: 1 },
            inputTokens:    { $sum: '$inputTokens' },
            outputTokens:   { $sum: '$outputTokens' },
            thinkingTokens: { $sum: '$thinkingTokens' },
            totalTokens:    { $sum: '$totalTokens' },
          },
        },
      ]),
      ApiUsage.aggregate([
        {
          $group: {
            _id:      '$callType',
            count:    { $sum: 1 },
          },
        },
      ]),
      ApiUsage.aggregate([
        {
          $group: {
            _id:            '$userId',
            requests:       { $sum: 1 },
            inputTokens:    { $sum: '$inputTokens' },
            outputTokens:   { $sum: '$outputTokens' },
            thinkingTokens: { $sum: '$thinkingTokens' },
            totalTokens:    { $sum: '$totalTokens' },
            lastCall:       { $max: '$createdAt' },
          },
        },
        {
          $lookup: {
            from:         'users',
            localField:   '_id',
            foreignField: '_id',
            as:           'user',
          },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id:            0,
            userId:         '$_id',
            name:           '$user.name',
            email:          '$user.email',
            requests:       1,
            inputTokens:    1,
            outputTokens:   1,
            thinkingTokens: 1,
            totalTokens:    1,
            lastCall:       1,
          },
        },
        { $sort: { totalTokens: -1 } },
      ]),
    ]);

    const raw = totalsArr[0] ?? {};
    const scoreCount = (byType.find(t => t._id === 'score') ?? {}).count ?? 0;
    const totalTokens = raw.totalTokens ?? 0;

    const totals = {
      requests:         raw.requests       ?? 0,
      inputTokens:      raw.inputTokens    ?? 0,
      outputTokens:     raw.outputTokens   ?? 0,
      thinkingTokens:   raw.thinkingTokens ?? 0,
      totalTokens,
      scoreCount,
      avgTokensPerCard: scoreCount > 0 ? Math.round(totalTokens / scoreCount) : 0,
    };

    res.json({ totals, perUser });
  } catch (err) { next(err); }
});

// ── Users CRUD ────────────────────────────────────────────────────────────────
router.get('/api/users', async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const q     = req.query.q ? req.query.q.trim() : '';

    const filter = q
      ? { $or: [
          { name:  { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
        ] }
      : {};

    const [docs, total] = await Promise.all([
      User.find(filter)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({ docs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.get('/api/users/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const user = await User.findById(req.params.id).select('-passwordHash').lean();
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (err) { next(err); }
});

router.patch('/api/users/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const allowed = ['name', 'email', 'bio', 'portfolioUrl', 'portraitUrl'];
    const update  = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k] === '' ? null : req.body[k];
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true, select: '-passwordHash' }
    ).lean();
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (err) { next(err); }
});

router.delete('/api/users/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    await Card.deleteOne({ userId: req.params.id });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Cards CRUD ────────────────────────────────────────────────────────────────
router.get('/api/cards', async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const q     = req.query.q ? req.query.q.trim() : '';

    const filter = q ? { amCode: { $regex: q, $options: 'i' } } : {};

    const [docs, total] = await Promise.all([
      Card.find(filter)
        .populate('userId', 'name email -_id')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Card.countDocuments(filter),
    ]);

    res.json({ docs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.get('/api/cards/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const card = await Card.findById(req.params.id)
      .populate('userId', 'name email')
      .lean();
    if (!card) return res.status(404).json({ error: 'Not found' });
    res.json(card);
  } catch (err) { next(err); }
});

router.patch('/api/cards/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const allowed = ['rate', 'replaceability', 'chessPiece', 'employmentStatus', 'ctaUrl', 'linkedinUrl', 'portraitUrl', 'amCode'];
    const update  = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k] === '' ? null : req.body[k];
    }
    if (req.body.rate          != null) update.rate          = parseInt(req.body.rate);
    if (req.body.replaceability != null) update.replaceability = parseInt(req.body.replaceability);

    const card = await Card.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    ).populate('userId', 'name email').lean();
    if (!card) return res.status(404).json({ error: 'Not found' });
    res.json(card);
  } catch (err) { next(err); }
});

router.delete('/api/cards/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const card = await Card.findByIdAndDelete(req.params.id);
    if (!card) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Regen card image (dev) ────────────────────────────────────────────────────
router.post('/api/cards/:id/regen', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const card = await Card.findById(req.params.id).lean();
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const user = await User.findById(card.userId).select('-passwordHash').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const cardData = buildCardData(user, card);
    const buffer   = await renderCard(cardData);
    const imageUrl = await uploadCardImage(buffer, String(card.userId));

    await Card.findByIdAndUpdate(req.params.id, { $set: { imageUrl } });
    res.json({ imageUrl });
  } catch (err) { next(err); }
});

module.exports = router;
