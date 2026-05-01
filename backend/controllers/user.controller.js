'use strict';
const User               = require('../models/User');
const { uploadPortrait } = require('../services/cloudinary');

async function updateBio(req, res, next) {
  try {
    const userId = req.user.userId;
    const { bio, portfolioUrl, portraitUrl: portraitUrlBody } = req.body;

    const update = {};
    if (bio          !== undefined) update.bio          = bio;
    if (portfolioUrl !== undefined) update.portfolioUrl = portfolioUrl;

    // Portrait can arrive as a file upload or a pre-hosted URL
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

module.exports = { updateBio };
