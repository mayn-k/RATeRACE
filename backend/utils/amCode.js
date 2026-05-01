'use strict';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT = '0123456789';

function generateAmCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += ALPHA[Math.floor(Math.random() * 26)];
  for (let i = 0; i < 4; i++) code += DIGIT[Math.floor(Math.random() * 10)];
  return code;
}

module.exports = { generateAmCode };
