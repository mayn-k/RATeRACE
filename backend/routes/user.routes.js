'use strict';
const { Router } = require('express');
const auth               = require('../middleware/auth');
const { portrait }       = require('../middleware/upload');
const ctrl               = require('../controllers/user.controller');

const router = Router();

router.post('/bio',   auth, portrait.single('portrait'), ctrl.updateBio);
router.patch('/photo', auth, ctrl.updatePhoto);

module.exports = router;
