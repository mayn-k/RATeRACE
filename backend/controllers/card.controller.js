'use strict';
const Card             = require('../models/Card');
const User             = require('../models/User');
const { buildCardData }   = require('../services/cardData');
const { renderCard }      = require('../services/puppeteer');
const { uploadCardImage } = require('../services/cloudinary');
const { generateAmCode }  = require('../utils/amCode');

async function generate(req, res, next) {
  try {
    const userId = req.user.userId;

    const [user, card] = await Promise.all([
      User.findById(userId),
      Card.findOne({ userId }),
    ]);

    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    if (!card?.rate) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Score not generated yet — run POST /api/score/generate first' } });
    }

    // New amCode on every generate (spec: regenerate on every card generation)
    const amCode = generateAmCode();
    card.amCode  = amCode;

    // Resolve linkedinUrl: prefer rawProfile, fall back to portfolioUrl if it's LinkedIn
    const rawLinkedin = card.rawProfile?.linkedinUrl || null;
    const portfolioIsLinkedin = user.portfolioUrl && user.portfolioUrl.includes('linkedin.com')
      ? user.portfolioUrl
      : null;
    const linkedinUrl = rawLinkedin || portfolioIsLinkedin || null;

    const cardData = buildCardData(user, card);
    const buffer   = await renderCard(cardData);
    const imageUrl = await uploadCardImage(buffer, userId);

    await Card.findByIdAndUpdate(card._id, { $set: { amCode, imageUrl, linkedinUrl } });

    res.json({ cardId: card._id.toString(), imageUrl, amCode, linkedinUrl });
  } catch (err) {
    next(err);
  }
}

async function getCard(req, res, next) {
  try {
    const card = await Card.findById(req.params.id).select('-rawProfile');
    if (!card) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Card not found' } });
    }
    res.json({ card, imageUrl: card.imageUrl });
  } catch (err) {
    next(err);
  }
}

async function redirectToImage(req, res, next) {
  try {
    const card = await Card.findById(req.params.id).select('imageUrl');
    if (!card?.imageUrl) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Card image not found' } });
    }
    res.redirect(302, card.imageUrl);
  } catch (err) {
    next(err);
  }
}

async function getCardByCode(req, res, next) {
  try {
    const code = (req.params.code || '').toUpperCase();
    const card = await Card.findOne({ amCode: code }).select('-rawProfile');
    if (!card) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Card not found' } });
    }
    const user = await User.findById(card.userId).select('name bio portfolioUrl');
    res.json({
      card: {
        amCode:           card.amCode,
        rate:             card.rate,
        replaceability:   card.replaceability,
        chessPiece:       card.chessPiece,
        employmentStatus: card.employmentStatus,
        delta:            card.delta,
        educationOrg:     card.educationOrg,
        workOrg:          card.workOrg,
        ctaUrl:           card.ctaUrl,
        linkedinUrl:      card.linkedinUrl,
        portraitUrl:      card.portraitUrl,
        imageUrl:         card.imageUrl,
      },
      user: {
        name: user?.name || null,
        bio:  user?.bio  || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { generate, getCard, redirectToImage, getCardByCode };
