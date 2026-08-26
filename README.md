# Sistema de Demandas da Biblioteca

Aplicação Web desenvolvida em **Next.js** para registrar, acompanhar e gerenciar demandas diárias da equipe. O sistema é sincronizado com uma planilha do Google Sheets e envia notificações automáticas por e-mail via SMTP.

O projeto foi migrado de uma estrutura Desktop/Localhost (Electron) para uma arquitetura **100% Web**, ideal para acesso em qualquer dispositivo, sendo hospedado e otimizado para a **Vercel**.

## 🚀 Como instalar e rodar localmente

1. **Pré-requisitos:**
   - Node.js (versão 20 ou superior recomendada).
   - Gerenciador de pacotes (npm, yarn, ou pnpm).

2. **Clone ou faça um fork do repositório:**
   ```bash
   git clone https://github.com/SEU_USUARIO/api-damandas-biblioteca.git
   cd api-damandas-biblioteca
   ```

3. **Instale as dependências:**
   ```bash
   npm install
   ```

4. **Configuração de Variáveis de Ambiente:**
   Copie o arquivo `.env.example` (se houver) ou crie um arquivo `.env` na raiz do projeto com as chaves descritas na seção **Variáveis de Ambiente** abaixo.

5. **Rode o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```
   O sistema estará disponível em `http://localhost:3000`.

## ☁️ Deploy na Vercel (Recomendado)

A infraestrutura atual está otimizada para implantação na **Vercel**.

1. Crie uma conta na [Vercel](https://vercel.com).
2. Conecte sua conta do GitHub e importe este repositório.
3. Na tela de configuração do projeto na Vercel, acesse a aba **Environment Variables** e insira todas as chaves contidas no seu arquivo `.env` local.
4. Clique em **Deploy**. O build ocorrerá automaticamente e você receberá um link público da sua aplicação.

## ⚙️ Variáveis de Ambiente Essenciais

As principais configurações que o sistema exige no arquivo `.env` (ou na Vercel):

- **Banco de Dados (Postgres):**
  - `DATABASE_URL` (Sua string de conexão)
  - `DATABASE_SSL` (true/false)

- **Autenticação JWT:**
  - `JWT_SECRET` (Uma chave longa e segura)
  - `JWT_EXPIRES_IN` (Ex: 7d)
  - `ROOT_LOGIN` e `ROOT_PASSWORD` (Credenciais de primeiro acesso)

- **Google Sheets (Sincronização de Demandas):**
  - `SPREADSHEET_ID` (ID da sua planilha na URL do Google Sheets)
  - `SHEET_NAME` (Nome da aba, ex: Demandas)
  - O e-mail de serviço (`api-demandas@...`) precisa ser convidado como **Editor** da planilha.

- **Configuração de SMTP (Envio de E-mails):**
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
  - `EMAIL_FROM`

- **URLs do Sistema:**
  - `APP_URL`: URL oficial da aplicação (Ex: `https://api-demandas-biblioteca.vercel.app`), usada nos botões e links dos e-mails disparados.

## 🔄 Tarefas de Fundo (Lembretes e Relatórios)

A nova estrutura também gerencia os alertas e relatórios usando a API do Next.js.
- Se você usar soluções externas como **Vercel Cron Jobs** (configurados através do arquivo `vercel.json`), o sistema pode disparar:
  - **Lembretes Automáticos:** Diariamente para atualizar sobre pendências de demandas abertas.
  - **Relatório Semanal:** Resumo enviado toda segunda-feira contendo o rendimento e panorama geral da equipe.
  - **Atribuições Diretas:** Notificações disparadas caso ocorram criações ou alterações de donos nas demandas através do dashboard.

## 📝 Licença
MIT License.
