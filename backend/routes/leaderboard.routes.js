'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/leaderboard.controller');

router.get('/', ctrl.getLeaderboard);

module.exports = router;
