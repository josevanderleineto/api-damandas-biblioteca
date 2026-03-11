# Sistema de Demandas (Biblioteca)

Aplicativo desktop construído com Electron para apoiar o **controle de demandas da biblioteca**: ele inicia o servidor local, abre o browser em `http://localhost:3000/` e entrega ao usuário final um executável que não exige linha de comando.

## Releases
Os instaladores oficiais (Windows `.exe` e macOS `.dmg`) são gerados automaticamente pelo workflow GitHub Actions e ficam disponíveis para download direto na aba **Releases** deste repositório.

## Como baixar o instalador
1. Acesse a seção **Releases** do GitHub deste projeto.
2. Baixe o arquivo `.exe` (Windows) ou `.dmg` (macOS) correspondente à build mais recente.
3. Execute o instalador como qualquer outro aplicativo nativo do sistema.

## Instruções para Windows
1. Baixe o instalador `.exe` no Release mais recente.
2. Execute o `.exe` e siga os passos do instalador NSIS (`Next > Install`).
3. Após a instalação, abra o app pelo menu Iniciar ou pelo atalho criado.
4. O aplicativo abre o navegador automaticamente em `http://localhost:3000/`.
5. Para desinstalar: `Configurações > Aplicativos` → localize “Sistema de Demandas (Biblioteca)” → remover.

Se o Windows SmartScreen bloquear, clique em **Mais informações** e depois em **Executar mesmo assim**.

## Instruções para macOS
1. Baixe o arquivo `.dmg` da última Release.
2. Abra o `.dmg` e arraste o app para a pasta **Aplicativos**.
3. Execute a aplicação a partir de **Aplicativos**; ela vai iniciar o servidor e abrir `http://localhost:3000/` no navegador padrão.
4. Para remover: delete o app da pasta **Aplicativos** e esvazie a lixeira.

Se o macOS reclamar sobre desenvolvedor desconhecido, abra o app com botão direito e escolha **Abrir**, ou vá em **Ajustes do Sistema > Privacidade e Segurança** para permitir a execução.

## Rodando localmente (desenvolvedores)
1. Clone o repositório.
2. Instale as dependências com `npm install`.
3. Gere a build Electron (para ambiente local ou CI) usando `npm run build`.
4. Para testar durante o desenvolvimento, use `npm run desktop:dev` para abrir o aplicativo com hot reload.

### Comandos principais
- `npm install` – instala todas as dependências do backend e do Electron.
- `npm run build` – empacota o Electron via `electron-builder` (mesma configuração usada pelo CI).
- `npm run desktop:dev` – inicia o app em modo desenvolvimento.

## Estrutura do projeto
- `main.cjs` / `electron/` – bootstrap e arquivos do Electron que ligam o renderer ao servidor Express.
- `server.js` – servidor Express que serve a interface web e responde a `/healthz`.
- `routes/`, `controllers/`, `middlewares/`, `services/`, `utils/` – lógica da API e integrações da biblioteca.
- `db/` e `scripts/applySchema.js` – scripts e migrações para banco de dados (SQLite/PostgreSQL, conforme `.env`).
- `dist-desktop/` – saída dos instaladores gerados por `electron-builder` (não versionada).
- `.env` / `.env.example` – configurações de porta, banco e credenciais que o app precisa no runtime.

## Licença
MIT License.
