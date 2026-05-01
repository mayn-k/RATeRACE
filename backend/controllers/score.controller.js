'use strict';
const { scoreProfile } = require('../services/scoring');
const Card             = require('../models/Card');
const User             = require('../models/User');

async function generate(req, res, next) {
  try {
    const userId = req.user.userId;

    // Use profile from request body, or fall back to stored rawProfile
    let profile = req.body.profile;
    if (!profile) {
      const card = await Card.findOne({ userId });
      profile = card?.rawProfile;
    }
    if (!profile) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'No profile found. Upload a resume or paste LinkedIn text first.' } });
    }

    const scored = await scoreProfile(profile);

    // Persist score fields to Card
    const card = await Card.findOneAndUpdate(
      { userId },
      {
        $set: {
          rate:             scored.rate,
          replaceability:   scored.replaceability,
          chessPiece:       scored.chessPiece,
          employmentStatus: scored.employmentStatus,
          delta:            scored.delta,
          educationOrg:     scored.educationOrg,
          workOrg:          scored.workOrg,
        },
      },
      { upsert: true, new: true }
    );

    // Store LLM-suggested bio on User only if user hasn't set one yet
    if (scored.bioRewrite) {
      await User.findOneAndUpdate(
        { _id: userId, $or: [{ bio: null }, { bio: '' }] },
        { $set: { bio: scored.bioRewrite } }
      );
    }

    res.json({
      rate:             card.rate,
      replaceability:   card.replaceability,
      chessPiece:       card.chessPiece,
      employmentStatus: card.employmentStatus,
      delta:            card.delta,
      educationOrg:     card.educationOrg,
      workOrg:          card.workOrg,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { generate };
