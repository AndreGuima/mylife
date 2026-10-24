# ✨ MyLife — Full-Stack Life Manager App

> 📝 Aplicação completa para gerenciamento de habitos e controle financeiro feita com **FastAPI + React Native + MySQL + Pytest + Docker + Kubernetes**.  
> Focada em boas práticas e ambiente moderno de desenvolvimento.

## Estrutura do projeto

- `frontend/` - aplicação web
- `backend/` - API FastAPI
- `docker/` - imagens e configurações do banco
- `graylog/` - stack opcional de logs
- `scripts/` - utilitários de operação
- `.env` - variáveis globais da aplicação

## Requisitos

- Docker
- Docker Compose

## Subir o ambiente completo

Na raiz do projeto:

```bash
cd /home/andre/repo/mylife
docker compose up --build -d
```

Isso reconstrói as imagens e inicia os containers:

- `mylife-db`
- `mylife-backend`
- `mylife-frontend`
- `mylife-cron`

## Reiniciar após mudanças no código

### Rebuild completo

```bash
cd /home/andre/repo/mylife
docker compose up --build -d
```

### Reiniciar apenas os containers existentes

```bash
docker compose restart
```

### Reiniciar serviços específicos

```bash
docker compose restart backend
docker compose restart frontend
docker compose restart db
```

## Parar o ambiente

```bash
docker compose down
```

Se quiser remover também os volumes persistentes do banco:

```bash
docker compose down -v
```

> Atenção: `-v` apaga os dados do banco MySQL local.

## Verificar status

```bash
docker ps
```

## Ver logs

```bash
docker logs mylife-backend --tail 100
docker logs mylife-frontend --tail 100
docker logs mylife-db --tail 100
```

## Testar a aplicação

### Backend

```bash
curl http://localhost:8000/
```

### Frontend

```bash
curl http://localhost:5173/
```

## Observações importantes

- Depois de alterar frontend, backend, Dockerfile, dependências ou variáveis de ambiente, use `docker compose up --build -d`.
- O banco MySQL usa volume persistente, então os dados podem sobreviver entre reinicializações.
- Se houver problemas de e-mail, SMTP ou validação de login, verifique o arquivo `.env` e os logs do backend.

## Fluxo recomendado

Para qualquer mudança no projeto:

```bash
cd /home/andre/repo/mylife
docker compose down
docker compose up --build -d
docker compose ps
```

