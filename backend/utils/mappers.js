'use strict';

// index 0 = yellow (retired), 1 = blue (intern), 2 = green (employed), 3 = red (unemployed)
const STATUS_INDEX = { retired: 0, intern: 1, employed: 2, unemployed: 3 };

function replaceabilityToHourglass(replaceability) {
  // replaceability 13 → frame 10 (most sand), 99 → frame 1 (nearly empty)
  const frame = Math.min(10, Math.max(1, Math.round(10 - ((replaceability - 13) / 86) * 9)));
  return { frame };
}

function statusToBlocks(employmentStatus) {
  const activeIdx = STATUS_INDEX[employmentStatus] ?? 2;
  return [
    { color: '#FCD71F', active: activeIdx === 0 },
    { color: '#005EFF', active: activeIdx === 1 },
    { color: '#17E700', active: activeIdx === 2 },
    { color: '#FF001F', active: activeIdx === 3 },
  ];
}

module.exports = { replaceabilityToHourglass, statusToBlocks };
