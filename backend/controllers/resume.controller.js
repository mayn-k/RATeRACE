'use strict';
const { parseResume }    = require('../services/resumeParser');
const { parseLinkedIn }  = require('../services/linkedin');
const Card               = require('../models/Card');
const User               = require('../models/User');

async function _persistAndRespond(userId, profile, res, resumeText = null) {
  const update = { rawProfile: profile };
  if (resumeText !== null) update.resumeText = resumeText;
  await Card.findOneAndUpdate(
    { userId },
    { $set: update },
    { upsert: true, new: true }
  );
  res.json({ profile });
}

async function uploadResume(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'PDF file is required' } });
    }
    const { profile, resumeText } = await parseResume(req.file.buffer, req.user.userId);
    await _persistAndRespond(req.user.userId, profile, res, resumeText);
  } catch (err) {
    next(err);
  }
}

async function linkedinResume(req, res, next) {
  try {
    const { urlOrText } = req.body;
    if (!urlOrText) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'urlOrText is required' } });
    }
    const profile = await parseLinkedIn(urlOrText, req.user.userId);

    if (profile.photoUrl) {
      await User.findByIdAndUpdate(req.user.userId, { $set: { portraitUrl: profile.photoUrl } });
    }

    await _persistAndRespond(req.user.userId, profile, res);
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadResume, linkedinResume };
