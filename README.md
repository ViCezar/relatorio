# SaaS Relatorio Mensal de Atendimentos

Sistema web SaaS para importar Excel mensal e consolidar tickets finalizados por filial, setor e atendente, substituindo o processo manual.

## Stack

- Backend: FastAPI + SQLAlchemy + Alembic + JWT
- Banco: PostgreSQL
- Frontend: React + Vite + TypeScript + Tailwind + componentes no estilo shadcn/ui + lucide-react
- Importacao Excel: pandas + openpyxl

## Portas Fixas

- Backend: http://localhost:8002
- Swagger: http://localhost:8002/docs
- Frontend: http://localhost:5173
- PostgreSQL: localhost:5432

## Estrutura de Pastas

```text
relatorio/
  backend/
    app/
      api/endpoints/
      core/
      db/
      models/
      schemas/
      services/
      main.py
      seed.py
    alembic/
      versions/
    alembic.ini
    requirements.txt
    Dockerfile
    .env
  frontend/
    src/
      components/
      context/
      lib/
      pages/
      types/
    Dockerfile
    package.json
    .env
  docker-compose.yml
  .env
```

## Subir com Docker (Obrigatorio)

```bash
docker compose up --build
```

Apos subir:

- Frontend: http://localhost:5173
- API docs: http://localhost:8002/docs

## Login Seed

- Email: `admin@local`
- Senha: `admin123`

O seed roda automaticamente no startup do backend (apos migrations).

## Regra de Match de Nome (Excel x Cadastro)

- Comparacao por nome exato sem normalizacao/aliases.
- Implementacao consistente case-insensitive usando apenas `lower()` nos dois lados.
- Sem remocao de sufixos, sem limpeza adicional.
- Se nao encontrar atendente na filial selecionada: vira pendencia.

## Fluxo de Uso

1. Cadastrar estrutura:
   - Filiais
   - Setores por filial
   - Atendentes por filial/setor (nome exato do Excel)
2. Ir para `Importar Excel`:
   - Selecionar mes, ano e modo (`overwrite` ou `sum`)
   - Upload do arquivo `.xlsx` com colunas:
     - `Atendente`
     - `Tickets finalizados`
3. Ver pendencias em `Relatorios`:
   - Criar atendente com o mesmo nome pendente e resolver
   - Ou vincular manualmente a atendente existente
4. Se precisar lancamento manual estilo Baldussi:
   - Ir em `Baldussi Manual`
   - Preencher por setor e atendente: `Baldussi Destino`, `Baldussi Origem`, `Blip`
   - Salvar para recalcular o total do atendente automaticamente
5. Acompanhar consolidado no `Dashboard`:
   - Cards
   - Tabelas por setor/atendente
   - Graficos
6. Exportar o consolidado mensal em Excel na tela `Relatorios`.

## Modo de Importacao

- `overwrite`: apaga itens/pedencias do mes e recria tudo com base no novo arquivo.
- `sum`: soma com o que ja existe no relatorio mensal.

## Endpoints Obrigatorios

### Auth

- `POST /auth/login`
- `GET /auth/me`

### CRUD

- `GET/POST/PUT/DELETE /branches`
- `GET/POST/PUT/DELETE /sectors`
- `GET/POST/PUT/DELETE /agents`

### Relatorios

- `POST /reports/import`
- `GET /reports/{branch_id}/{year}/{month}`
- `GET /reports/{branch_id}/{year}/{month}/pending`
- `GET /reports/{branch_id}/{year}/{month}/manual-baldussi`
- `POST /reports/{branch_id}/{year}/{month}/manual-baldussi/bulk-upsert`
- `POST /reports/{report_id}/pending/{pending_id}/create-agent-and-resolve`
- `POST /reports/{report_id}/pending/{pending_id}/link-agent-and-resolve`

### Extra

- `GET /reports/{branch_id}/{year}/{month}/export`

## Variaveis de Ambiente

### Backend (`backend/.env`)

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/relatorio
JWT_SECRET_KEY=super_secret_local_key
JWT_ALGORITHM=HS256
JWT_EXPIRES_MINUTES=1440
CORS_ORIGINS=http://localhost:5173
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:8002
```

### Compose (`.env` na raiz)

Usado pelo `docker-compose.yml` para subir os containers com os mesmos endpoints locais.

## Observacoes

- Relatorio mensal e unico por `filial + mes + ano`.
- CORS liberado para `http://localhost:5173`.
- Backend exposto em `8002` com Swagger em `/docs`.
