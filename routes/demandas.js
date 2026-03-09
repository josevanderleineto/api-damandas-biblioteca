const express = require('express');
const router = express.Router();

const controller = require('../controllers/demandasController');

router.get('/', controller.listar);
router.post('/notificacoes/testar-smtp', controller.testarSMTP);
router.post('/notificacoes/lembretes', controller.executarLembretes);
router.get('/:id', controller.buscarPorId);
router.post('/', controller.criar);
router.put('/:id', controller.atualizar);
router.delete('/:id', controller.remover);

module.exports = router;
