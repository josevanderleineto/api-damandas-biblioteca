const express = require('express');
const controller = require('../controllers/demandasController');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authenticateToken);

router.get('/', requireRole('admin', 'root', 'colaborador'), controller.listar);
router.get('/prazo-solicitacoes', requireRole('admin', 'root'), controller.listarSolicitacoesProrrogacao);
router.patch('/prazo-solicitacoes/:requestId', requireRole('admin', 'root'), controller.decidirSolicitacaoProrrogacao);

router.post('/notificacoes/testar-smtp', requireRole('admin', 'root'), controller.testarSMTP);
router.post('/notificacoes/teste-envio', requireRole('admin', 'root'), controller.testarEnvio);
router.post('/notificacoes/lembretes', requireRole('admin', 'root'), controller.executarLembretes);
router.post('/notificacoes/atribuicoes', requireRole('admin', 'root'), controller.executarAtribuicoesPlanilha);
router.post('/notificacoes/relatorio-semanal', requireRole('admin', 'root'), controller.executarRelatorioSemanal);

router.post('/', requireRole('admin', 'root'), controller.criar);
router.get('/:id', requireRole('admin', 'root', 'colaborador'), controller.buscarPorId);
router.put('/:id', requireRole('admin', 'root', 'colaborador'), controller.atualizar);
router.put('/:id/assign', requireRole('admin', 'root'), controller.atribuirResponsaveis);
router.delete('/:id', requireRole('admin', 'root'), controller.remover);
router.post('/:id/prazo-solicitacao', requireRole('colaborador'), controller.solicitarProrrogacao);

module.exports = router;
