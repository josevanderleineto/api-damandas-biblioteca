const express = require('express');
const controller = require('../controllers/organogramaController');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authenticateToken);
router.get('/', requireRole('admin', 'root', 'colaborador'), controller.listar);

module.exports = router;
