# Nexo Assist

Agent de atendimento do service desk de TI da Nexo, em formato de chat: o funcionário descreve o problema com as próprias palavras, e o agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados e chama um analista quando precisa. Projeto do desafio técnico do processo seletivo Beyond the Bytes.

> **Em construção, por partes.** Pronta: parte 1, o serviço de chamados. Plano e decisões em [docs/plano.md](docs/plano.md), requisitos em [docs/prd.md](docs/prd.md), protótipo em [docs/prototipo.md](docs/prototipo.md).

## Como rodar

Requisito: Docker com Compose.

```bash
cp .env.example .env   # opcional, os padrões funcionam
docker compose up --build -d --wait servicedesk
```

O serviço de chamados responde em http://localhost:8100 (documentação interativa em `/docs`). Toda chamada leva `X-API-Key`; as rotas de chamados também levam `X-Actor-Email`, que precisa existir no diretório:

```bash
curl -H 'X-API-Key: dev-servicedesk-key' -H 'X-Actor-Email: ana.souza@nexo.com.br' http://localhost:8100/v1/tickets
```

Testes (rodam em contêiner, sem instalar nada na máquina):

```bash
docker compose --profile test run --rm --build servicedesk-test
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

Criados na primeira subida, com datas relativas ao momento da criação. Qualquer senha vale no login (parte 2).

| E-mail | Papel | Observação |
| --- | --- | --- |
| `ana.souza@nexo.com.br` | funcionária (Financeiro, Windows 11) | 3 chamados abertos (um vencido, um aprovado) e 2 resolvidos há muito tempo |
| `carla.mendes@nexo.com.br` | funcionária (Controladoria) | chamado do SAP resolvido há 4 dias: ainda dá para reabrir |
| `bruno.tavares@nexo.com.br` | funcionário (Operações, Windows 10) | chamado de prioridade alta de Wi-Fi em andamento |
| `diego.ramos@nexo.com.br`, `elisa.prado@nexo.com.br`, `fabio.nunes@nexo.com.br`, `gabriela.rocha@nexo.com.br` | funcionários | chamados variados de outras pessoas, para testar privacidade |
| `marina.alves@nexo.com.br` | analista N1 | |
| `rafael.lima@nexo.com.br` | analista N2 | |

A central de ajuda tem 10 artigos curtos (VPN erro 809, horário do service desk, senha da rede, senha do SAP, Wi-Fi, Outlook no celular, software, equipamento, notebook lento, impressora).

## Estrutura

```
docs/                    PRD resumido, notas do protótipo, plano por partes
services/servicedesk/    serviço de chamados (Python)
docker-compose.yml       serviços e perfil de testes
.env.example             variáveis de ambiente
```
