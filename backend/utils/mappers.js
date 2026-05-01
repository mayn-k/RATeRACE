'use strict';

// index 0 = yellow (retired), 1 = blue (intern), 2 = green (employed), 3 = red (unemployed)
const STATUS_INDEX = { retired: 0, intern: 1, employed: 2, unemployed: 3 };

function replaceabilityToHourglass(replaceability) {
  const remaining = Math.round(64 * (99 - replaceability) / 86);
  return {
    totalPerDiamond: 64,
    remaining,
    elapsed: 64 - remaining,
    color: '#c40000',
    cellSize: 10.4,
    gap: 2.4,
  };
}

function statusToBlocks(employmentStatus) {
  const activeIdx = STATUS_INDEX[employmentStatus] ?? 2;
  return [
    { color: '#ece4b4', active: activeIdx === 0 },
    { color: '#cad8ea', active: activeIdx === 1 },
    { color: '#c7ddb8', active: activeIdx === 2 },
    { color: '#ff001a', active: activeIdx === 3 },
  ];
}

module.exports = { replaceabilityToHourglass, statusToBlocks };
