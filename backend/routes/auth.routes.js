'use strict';
const { Router } = require('express');
const auth       = require('../middleware/auth');
const ctrl       = require('../controllers/auth.controller');
const { authLimiter } = require('../middleware/rateLimiter');

const router = Router();

router.post('/signup',              authLimiter, ctrl.signup);
router.post('/login',               authLimiter, ctrl.login);
router.post('/code-login',          authLimiter, ctrl.codeLogin);
router.get('/me',                   auth, ctrl.me);
router.get('/linkedin',             ctrl.linkedinAuth);
router.get('/linkedin/callback',    ctrl.linkedinCallback);
router.get('/linkedin/exchange',    ctrl.linkedinExchange);

module.exports = router;
