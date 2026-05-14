'use strict';
const Card = require('../models/Card');
const User = require('../models/User');

function boardScore(card) {
  return (card.rate || 0) - (card.replaceability || 0);
}

function formatAmCode(code) {
  if (!code || code.length !== 8) return code || '';
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

function getRole(rawProfile) {
  return rawProfile?.headline || rawProfile?.experience?.[0]?.title || rawProfile?.currentRole || '';
}

function buildRow(card, userMap) {
  const user = userMap[card.userId?.toString()] || {};
  return {
    amCode:            formatAmCode(card.amCode),
    name:              user.name || 'Anonymous',
    role:              getRole(card.rawProfile),
    employmentStatus:  card.employmentStatus || 'employed',
    chessPiece:        card.chessPiece || 'pawn',
    rate:              card.rate || 0,
    repl:              card.replaceability || 0,
    portraitUrl:       user.portraitUrl || card.portraitUrl || null,
    imageUrl:          card.imageUrl || null,
    shareUrl:          `/card/${card.amCode}`,
  };
}

exports.getLeaderboard = async (req, res) => {
  const { status, piece, amCode } = req.query;

  const cardFilter = {
    imageUrl:        { $exists: true, $ne: null },
    rate:            { $exists: true },
    replaceability:  { $exists: true },
  };
  if (status && status !== 'all') cardFilter.employmentStatus = status;
  if (piece  && piece  !== 'all') cardFilter.chessPiece       = piece;

  const allCards = await Card.find(cardFilter)
    .select('userId rate replaceability chessPiece employmentStatus amCode imageUrl portraitUrl rawProfile')
    .lean();

  allCards.sort((a, b) => boardScore(b) - boardScore(a));

  const totalCount = allCards.length;
  const top50Cards = allCards.slice(0, 50);

  const userIdSet = new Set(top50Cards.map(c => c.userId?.toString()).filter(Boolean));

  let queryCard = null;
  if (amCode) {
    const normalized = amCode.replace(/\s/g, '').toUpperCase();
    queryCard = allCards.find(c => c.amCode === normalized);
    if (queryCard) userIdSet.add(queryCard.userId?.toString());
  }

  const users = await User.find({ _id: { $in: [...userIdSet] } })
    .select('_id name portraitUrl')
    .lean();
  const userMap = {};
  users.forEach(u => { userMap[u._id.toString()] = u; });

  const rows = top50Cards.map(card => buildRow(card, userMap));

  let userRank = null;
  let userRow  = null;
  if (amCode && queryCard) {
    const normalized = amCode.replace(/\s/g, '').toUpperCase();
    const rankIdx = allCards.findIndex(c => c.amCode === normalized);
    userRank = rankIdx >= 0 ? rankIdx + 1 : null;
    userRow  = buildRow(queryCard, userMap);
  }

  res.json({ rows, totalCount, userRank, userRow });
};
