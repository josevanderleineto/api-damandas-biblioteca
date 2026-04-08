# Deploy no Render

Este guia publica a API em uma URL do Render sem alterar o funcionamento atual do app local.

## Estratégia segura
- O app local continua funcionando como hoje.
- A instância do Render sobe com `BACKGROUND_JOBS_ENABLED=false` para não disputar os agendadores automáticos com a máquina local.
- Assim, o link do Render serve para acesso web dos colaboradores, enquanto os ciclos automáticos continuam no ambiente que você já usa hoje.

## O que vai para o Render
- API Express + frontend estático da pasta `public/`.
- Mesmo banco (`DATABASE_URL`) e mesma planilha (`SPREADSHEET_ID` / `SHEET_NAME`) se você quiser compartilhar os mesmos dados do sistema atual.

## Arquivos preparados
- `render.yaml`: blueprint para criar o serviço no Render.
- `server.js`: respeita `BACKGROUND_JOBS_ENABLED` para desligar agendadores em instâncias secundárias.

## Passo a passo
1. Suba o projeto para um repositório no GitHub.
2. Acesse o painel do Render e clique em `New` -> `Blueprint`.
3. Conecte o repositório que contém este projeto.
4. Confirme a criação usando o arquivo `render.yaml`.
5. Quando o Render pedir as variáveis secretas, preencha:
   - `DATABASE_URL`: use a mesma conexão do banco atual se quiser compartilhar os dados.
   - `JWT_SECRET`
   - `ROOT_LOGIN`
   - `ROOT_PASSWORD`
   - `SPREADSHEET_ID`
   - `SHEET_NAME`
   - `GOOGLE_CREDENTIALS_JSON`
6. Aguarde o deploy terminar.
7. Abra a URL `https://<nome-do-servico>.onrender.com`.
8. No painel do serviço, abra `Environment` e adicione:
   - `APP_URL=https://<nome-do-servico>.onrender.com`
   - `PASSWORD_RESET_URL=https://<nome-do-servico>.onrender.com`
9. Faça um novo deploy manual ou use `Manual Deploy` -> `Deploy latest commit` para aplicar essas URLs.

## Ajuste no app local
- Como os e-mails automáticos vão continuar saindo da máquina local, atualize também o `.env` local para:
  - `APP_URL=https://<nome-do-servico>.onrender.com`
  - `PASSWORD_RESET_URL=https://<nome-do-servico>.onrender.com`
  - `BACKGROUND_JOBS_ENABLED=true`
- Assim, qualquer link enviado por e-mail vai abrir o sistema público no Render, e os agendadores continuam rodando no seu computador como hoje.

## Se quiser e-mails também pelo Render
- Para ações executadas no próprio link do Render enviarem e-mail, adicione também:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_SECURE`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `EMAIL_FROM`
- Se quiser manter logos em e-mails, configure também os campos opcionais de logo.

## Recomendação importante sobre plano
- No plano `free`, o Render pode hibernar a aplicação após inatividade.
- No plano `free`, o Render também bloqueia tráfego de saída para portas SMTP, então cadastro/atualização/reset de senha por e-mail podem não funcionar a partir da instância web.
- Se você quiser que o sistema web do Render também envie e-mails normalmente, use pelo menos um plano pago (`starter` ou superior).

## Quando usar `BACKGROUND_JOBS_ENABLED=true`
- Só ative isso no Render quando ele virar a instância principal do sistema.
- Se fizer isso, desligue o app local ou deixe o local com `BACKGROUND_JOBS_ENABLED=false` para evitar concorrência nos agendadores.

## Checklist final
- `DATABASE_URL` correto.
- `GOOGLE_CREDENTIALS_JSON` válido.
- `APP_URL` apontando para o domínio do Render.
- `BACKGROUND_JOBS_ENABLED=false` no Render enquanto o local continuar ativo.
- SMTP configurado apenas se você realmente quiser envio de e-mails pela instância do Render.
