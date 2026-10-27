# Nexo Assist

Agent de atendimento do service desk de TI da Nexo, em formato de chat: o funcionário descreve o problema com as próprias palavras, e o agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados e chama um analista quando precisa. Projeto do desafio técnico do processo seletivo Beyond the Bytes.

> **Em construção, por partes.** Prontas: parte 1 (serviço de chamados) e parte 2 (app web com login, sessão e banco de conversas); o agent e o chat chegam nas próximas. Plano e decisões em [docs/plano.md](docs/plano.md), requisitos em [docs/prd.md](docs/prd.md), protótipo em [docs/prototipo.md](docs/prototipo.md).

## Como rodar

Requisito: Docker com Compose.

```bash
cp .env.example .env   # opcional, os padrões funcionam
docker compose up --build -d --wait
```

O app abre em http://localhost:3000. Entre com `ana.souza@nexo.com.br` (funcionária) ou `rafael.lima@nexo.com.br` (analista), com qualquer senha.

O serviço de chamados responde em http://localhost:8100 (documentação interativa em `/docs`). Toda chamada leva `X-API-Key`; as rotas de chamados também levam `X-Actor-Email`, que precisa existir no diretório:

```bash
curl -H 'X-API-Key: dev-servicedesk-key' -H 'X-Actor-Email: ana.souza@nexo.com.br' http://localhost:8100/v1/tickets
```

Testes (rodam em contêiner, sem instalar nada na máquina):

```bash
docker compose --profile test run --rm --build servicedesk-test   # pytest do serviço de chamados
docker compose --profile test run --rm --build web-test           # tipos, lint e Vitest do app web
```

Para parar e apagar os dados: `docker compose down -v`.

## Serviço de chamados (parte 1)

É o "sistema legado" do desafio: Python, FastAPI e SQLite, em um processo e contêiner próprios, separado do agent. Guarda chamados, histórico de cada chamado, central de ajuda e o diretório de pessoas. O arquivo SQLite fica em um volume, então os dados sobrevivem a reinícios.

| Rota | Quem usa | O que faz |
| --- | --- | --- |
| `GET /v1/tickets?status=open\|closed\|all&q=&category=&requester=` | funcionário (só os seus), analista (todos) | lista com busca por texto; cada chamado traz `sla.overdue` |
| `GET /v1/tickets/{id}` | idem | detalhe com histórico de eventos |
| `POST /v1/tickets` | funcionário | cria; exige título, descrição, tipo, categoria, prioridade e afetados |
| `POST /v1/tickets/{id}/updates` | funcionário | acrescenta informação a um chamado aberto |
| `POST /v1/tickets/{id}/transfer` | funcionário ou analista | transfere ao Suporte N1/N2 com motivo e resumo |
| `POST /v1/tickets/{id}/reopen` | funcionário ou analista | reabre se resolvido há até 7 dias |
| `POST /v1/tickets/{id}/assume`, `/respond`, `/resolve` | analista | assume, responde e resolve |
| `GET /v1/articles?q=` | app | central de ajuda, com pontuação de relevância de 0 a 1 |
| `GET /v1/directory/{email}` | app | perfil e equipamento (usado no login) |
| `GET /v1/meta`, `GET /v1/sla/{prioridade}` | app | categorias, prioridades, prazos e o prazo se o chamado fosse aberto agora |
| `POST /admin/outage`, `POST /admin/reset`, `GET /admin/state` | operação | forçar queda, recarregar dados de exemplo, ver estado (só com `SERVICEDESK_ADMIN=1`) |

Regras que o serviço garante:

- **Privacidade:** o chamador é identificado pelo e-mail no diretório; o papel nunca vem de cabeçalho. Funcionário só enxerga os próprios chamados, e o chamado de outra pessoa responde 404, igual a um chamado que não existe.
- **Prazos:** a prioridade define o prazo da próxima resposta: Crítica 1 hora corrida, Alta 4 horas úteis, Média 3 dias úteis, Baixa 5 dias úteis (horário útil: segunda a sexta, 8h às 18h, horário de São Paulo). O prazo conta da criação ou da última atualização do service desk; informação do funcionário não reinicia o relógio.
- **Reabertura:** chamado resolvido há até 7 dias pode ser reaberto; depois disso é preciso abrir outro.
- **Escritas seguras para repetir:** `POST` aceita `Idempotency-Key`; repetir a chamada devolve o mesmo resultado em vez de duplicar o chamado.
- **Instabilidade simulada:** com os padrões, cerca de 10% das chamadas falham com 503 (`Retry-After`) e há latência artificial. Parte das falhas acontece depois de gravar, para exigir repetição com a mesma chave. `POST /admin/outage?seconds=30` força uma queda; `SERVICEDESK_FLAKY_RATE=0` desliga o sorteio.

### Dados de exemplo

Criados na primeira subida, com datas relativas ao momento da criação. Qualquer senha vale no login.

| E-mail | Papel | Observação |
| --- | --- | --- |
| `ana.souza@nexo.com.br` | funcionária (Financeiro, Windows 11) | 3 chamados abertos (um vencido, um aprovado) e 2 resolvidos há muito tempo |
| `carla.mendes@nexo.com.br` | funcionária (Controladoria) | chamado do SAP resolvido há 4 dias: ainda dá para reabrir |
| `bruno.tavares@nexo.com.br` | funcionário (Operações, Windows 10) | chamado de prioridade alta de Wi-Fi em andamento |
| `diego.ramos@nexo.com.br`, `elisa.prado@nexo.com.br`, `fabio.nunes@nexo.com.br`, `gabriela.rocha@nexo.com.br` | funcionários | chamados variados de outras pessoas, para testar privacidade |
| `marina.alves@nexo.com.br` | analista N1 | |
| `rafael.lima@nexo.com.br` | analista N2 | |

A central de ajuda tem 10 artigos curtos (VPN erro 809, horário do service desk, senha da rede, senha do SAP, Wi-Fi, Outlook no celular, software, equipamento, notebook lento, impressora).

## App web (parte 2)

Next.js 16 com TypeScript estrito, em `apps/web`. Da interface do protótipo já existem o login (tela 1) e o Meu perfil; o chat e o console são esqueletos que ganham vida nas próximas partes.

| Rota | Quem | O que faz |
| --- | --- | --- |
| `/login` | todos | tela 1 do protótipo; funcionário segue para `/chat`, analista para `/console` |
| `/chat`, `/profile` | funcionário | atendimento (esqueleto com o contador de mensagens vindo do banco) e Meu perfil |
| `/console` | analista | console (esqueleto com as contagens das abas) |
| `POST /api/auth/login`, `POST /api/auth/logout` | todos | abre e encerra a sessão |
| `GET /api/health` | contêiner | verificação de saúde |

- **Sessão:** JWT assinado em cookie `HttpOnly`, `SameSite=Lax`, `Secure` sob HTTPS. "Manter conectado" dura 30 dias; sem marcar, o cookie some com o navegador. O `proxy.ts` só faz redirecionamentos otimistas; cada página confere a sessão de novo, perto dos dados. O login limita tentativas por cliente e recusa POSTs de outra origem.
- **Cliente do serviço de chamados** (`src/server/servicedesk`): valida toda resposta com zod, repete leituras e escritas quando o legado cai (502/503/504, rede, timeout) respeitando `Retry-After`, e toda escrita carrega uma chave de idempotência, então repetir nunca duplica um chamado. Para ver: `curl -X POST -H 'X-API-Key: dev-servicedesk-key' 'http://localhost:8100/admin/outage?seconds=3'` e entre no app durante a queda; o login demora alguns segundos e passa.
- **Conversas** (`src/server/conversations`): SQLite em volume, com migrações versionadas. Cada funcionário tem no máximo uma conversa aberta; os estados são `agent`, `awaiting_analyst`, `with_analyst` e `closed`, com transições validadas e o limite de mensagens por sessão aplicado dentro de uma transação.
- **Configuração:** variáveis em `.env.example`. O app não sobe com configuração inválida e não tem nenhum segredo embutido no código.

## Estrutura

```
apps/web/                app web (Next.js, TypeScript)
docs/                    PRD resumido, notas do protótipo, plano por partes
services/servicedesk/    serviço de chamados (Python)
docker-compose.yml       serviços e perfil de testes
.env.example             variáveis de ambiente
```
