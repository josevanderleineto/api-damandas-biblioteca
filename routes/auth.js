const express = require('express');
const controller = require('../controllers/authController');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/login', controller.login);
router.get('/me', authenticateToken, controller.me);

router.get('/users', authenticateToken, requireRole('admin', 'root'), controller.listarUsuarios);
router.post('/users', authenticateToken, requireRole('admin', 'root'), controller.criarUsuario);
router.patch('/users/:id/status', authenticateToken, requireRole('admin', 'root'), controller.alterarStatusUsuario);
router.put('/users/:id', authenticateToken, requireRole('admin', 'root'), controller.atualizarUsuario);
router.delete('/users/:id', authenticateToken, requireRole('admin', 'root'), controller.removerUsuario);

module.exports = router;
