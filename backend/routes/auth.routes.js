'use strict';
const { Router } = require('express');
const auth       = require('../middleware/auth');
const ctrl       = require('../controllers/auth.controller');

const router = Router();

router.post('/signup',     ctrl.signup);
router.post('/login',      ctrl.login);
router.post('/code-login', ctrl.codeLogin);
router.get('/me',          auth, ctrl.me);

module.exports = router;
