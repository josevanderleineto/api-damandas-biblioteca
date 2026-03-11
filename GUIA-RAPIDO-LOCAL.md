# Guia Rápido (Uso Local Sem Terminal)

## Iniciar sistema (1 clique)

1. Dê duplo clique em `Iniciar-Sistema.command`
2. O sistema abre em `http://localhost:3000`

## Parar sistema

1. Dê duplo clique em `Parar-Sistema.command`

## Abrir no navegador

1. Dê duplo clique em `Abrir-Sistema.command`

## Requisitos

- macOS
- Node.js instalado
- `.env` preenchido na pasta do projeto

## Observações

- O script aplica migração de banco automaticamente antes de iniciar.
- Logs ficam em `local-server.log`.
- Lembretes seguem agendamento configurado no backend (dias úteis às 10:00).

## Projeto separado keepalive (Vercel)

- Pasta: `keepalive-vercel/`
- Finalidade: ping externo de healthcheck
- Não contém regras de negócio do sistema principal.
