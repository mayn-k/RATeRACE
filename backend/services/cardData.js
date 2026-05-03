'use strict';
const { replaceabilityToHourglass, statusToBlocks } = require('../utils/mappers');
const { generateAmCode } = require('../utils/amCode');

/**
 * Builds the exact CARD_DATA object expected by rate-card.html's window.CARD_DATA.
 * Pure function — no DB or LLM calls.
 *
 * @param {object} user  - Mongoose User document (or plain object)
 * @param {object} card  - Mongoose Card document (or plain object)
 * @returns {object} CARD_DATA
 */
function buildCardData(user, card) {
  const amCode   = card.amCode || generateAmCode();
  const direction = card.delta?.direction ?? 'up';

  return {
    rateLabel:    'RATE',
    replaceLabel: 'REPLACEABILITY',

    rate:          card.rate,
    replaceability: card.replaceability,

    portrait: user.portraitUrl || card.portraitUrl || null,

    code: amCode,

    delta: {
      value:     card.delta?.value     ?? 0,
      direction,
      color:     direction === 'down' ? '#bf0000' : '#0b8e2b',
    },

    logos: [
      card.educationOrg?.logoUrl ?? null,
      card.workOrg?.logoUrl      ?? null,
    ],

    cta: {
      label: 'Click here',
      url:   card.ctaUrl || user.portfolioUrl || card.linkedinUrl || '#',
    },

    chessPiece: card.chessPiece,

    name: user.name,

    // Template renders bio inside quote marks on the card
    bio: user.bio ? `"${user.bio}"` : '""',

    statusBlocks: statusToBlocks(card.employmentStatus),
    hourglass:    replaceabilityToHourglass(card.replaceability),
  };
}

module.exports = { buildCardData };
