'use strict';
const User               = require('../models/User');
const { uploadPortrait } = require('../services/cloudinary');

async function updateBio(req, res, next) {
  try {
    const userId = req.user.userId;
    const { bio, portfolioUrl, portraitUrl: portraitUrlBody, name } = req.body;

    const update = {};
    if (name         !== undefined) update.name         = name;
    if (bio          !== undefined) update.bio          = bio;
    if (portfolioUrl !== undefined) update.portfolioUrl = portfolioUrl;

    if (req.file) {
      update.portraitUrl = await uploadPortrait(req.file.buffer, userId);
    } else if (portraitUrlBody !== undefined) {
      update.portraitUrl = portraitUrlBody;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: update },
      { new: true, select: '-passwordHash' }
    );

    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
}

async function updatePhoto(req, res, next) {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    if (user.photoLocked) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Photo has already been changed once' } });
    }
    const { portraitUrl } = req.body;
    if (!portraitUrl) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'portraitUrl is required' } });
    }
    user.portraitUrl = portraitUrl;
    user.photoLocked = true;
    await user.save();
    res.json({ user: user.toObject({ versionKey: false }) });
  } catch (err) {
    next(err);
  }
}

module.exports = { updateBio, updatePhoto };
