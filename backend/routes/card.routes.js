'use strict';
const { Router } = require('express');
const auth                   = require('../middleware/auth');
const { cardLimiter }        = require('../middleware/rateLimiter');
const ctrl                   = require('../controllers/card.controller');

const router = Router();

router.post('/generate', auth, cardLimiter, ctrl.generate);
router.get('/view/:code',        ctrl.getCardByCode);
router.get('/:id',               ctrl.getCard);
router.get('/:id/image',         ctrl.redirectToImage);

module.exports = router;
