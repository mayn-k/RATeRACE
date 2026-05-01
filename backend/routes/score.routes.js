'use strict';
const { Router } = require('express');
const auth                    = require('../middleware/auth');
const { scoreLimiter }        = require('../middleware/rateLimiter');
const ctrl                    = require('../controllers/score.controller');

const router = Router();

router.post('/generate', auth, scoreLimiter, ctrl.generate);

module.exports = router;
