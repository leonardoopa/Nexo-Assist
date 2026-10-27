# Plano por partes

O desenvolvimento acontece na branch `staging`, em partes pequenas, para que cada commit conte um pedaço da história. Cada parte termina com testes passando e o projeto subindo no Docker.

| Parte | Escopo | Estado |
| --- | --- | --- |
| 1 | Serviço de chamados legado simulado (Python): chamados, central de ajuda, diretório, SLA em horário útil, instabilidade simulada, dados de exemplo, testes, Docker | pronta |
| 2 | App web (Next.js 16, TypeScript estrito): login (tela 1), sessão, Meu perfil, esqueleto do chat e do console, banco de conversas com estados, cliente tipado do serviço com retentativas e idempotência, tokens de design | pronta |
| 3 | Agent (Mastra): tools sobre o serviço e a central de ajuda, regras do Anexo A em código, registro estruturado de cada decisão, streaming | escrita e testada com modelo roteirizado; falta testar com LLM real |
| 4 | Chat do funcionário (telas 2 e 3) com cards, rascunho para confirmação, opções rápidas, limite de 30 mensagens e painel de transparência | pendente |
| 5 | Console do analista (telas 4 e 5): lista com filtros, assumir, devolver, encerrar, chamados do funcionário | pendente |
| 6 | README final (arquitetura, como o agent decide, qualidade, trade-offs), avaliações do agent, métricas reais na tela de login, deploy opcional | pendente |

## Decisões e suposições da parte 1

- **Stack:** o PRD exige TypeScript, Mastra e Next.js para a aplicação; o serviço de chamados é o "sistema legado" separado do agent e foi feito em Python (FastAPI + SQLite). Isso reforça a separação (outro processo, outro contêiner, contrato HTTP) e permite simular a instabilidade sem tocar no agent.
- **Quem decide o quê:** o serviço aplica as regras de negócio que não dependem de interpretação (privacidade, janela de 7 dias para reabrir, prazos, numeração, idempotência). O que depende de interpretação (duplicidade, prioridade, quando transferir) fica no agent, com guardas em código na parte 3.
- **Privacidade em camadas:** o chamador é identificado pelo e-mail no diretório (o papel nunca vem de cabeçalho); funcionário só enxerga os próprios chamados e o de outra pessoa responde 404, igual a um chamado inexistente; analista enxerga todos.
- **Prazos:** horário útil é segunda a sexta, das 8h às 18h (horário de São Paulo). Média = 3 dias úteis = 30 horas úteis; Baixa = 5 dias úteis = 50 horas úteis; Crítica = 1 hora corrida (plantão 24 h). O prazo conta a partir da criação ou da última atualização do service desk; informação adicionada pelo funcionário não reinicia o relógio. Chamados "Aprovado" aguardam compra ou entrega e ficam com o relógio parado (não vencem). Feriados não são considerados.
- **Instabilidade do legado:** latência artificial e falhas 503 aleatórias (padrão 10%, configurável). Parte das falhas de escrita acontece depois de gravar, então o cliente precisa repetir com a mesma `Idempotency-Key` (a repetição devolve o mesmo chamado). `POST /admin/outage` força uma queda para demonstrar.
- **Dados de exemplo relativos ao momento da criação:** "vencido", "resolvido há 4 dias" e "resolvido há tempo demais para reabrir" continuam verdadeiros em qualquer data. Para recarregar: `POST /admin/reset`.
- **Fuso:** todos os horários da API são UTC; a interface converte para o fuso de São Paulo.

## Decisões e suposições da parte 2

- **Versões:** Next.js 16 (Turbopack, `proxy.ts` no lugar do middleware, sem Cache Components), React 19, TypeScript 5 com `strict` e `noUncheckedIndexedAccess`, Tailwind 4, zod 4, better-sqlite3, Vitest, Node 22. O `AGENTS.md` do template manda ler `node_modules/next/dist/docs` antes de codar: as convenções de sessão, `proxy` e `cookies()` assíncrono foram conferidas ali.
- **Login:** o PRD aceita os funcionários dos dados de exemplo com qualquer senha, então a senha só é exigida não vazia; quem existe ou não é decidido pelo diretório do serviço de chamados (fonte única de pessoas). Resposta genérica "E-mail ou senha inválidos" para não confirmar quais e-mails existem.
- **Sessão:** JWT assinado (HS256, `jose`) em cookie `HttpOnly`, `SameSite=Lax`, `Secure` quando a requisição chega por HTTPS. "Manter conectado" dá 30 dias; sem marcar, é cookie de sessão com validade de 12 h. O token guarda só e-mail, nome, papel e grupo. `proxy.ts` faz apenas redirecionamentos otimistas; cada página e rota confere a sessão de novo (`requireSession`), perto dos dados. Login limitado a 10 tentativas a cada 5 min por cliente, e POSTs de outra origem são recusados.
- **Cliente do serviço de chamados:** camada anticorrupção. Converte snake_case em camelCase, valida toda resposta com zod (se o contrato mudar, erro explícito em vez de dado torto), tem timeout e repete leituras e escritas em 502/503/504 e falhas de rede, respeitando `Retry-After`. Toda escrita exige uma chave de idempotência (o tipo não deixa chamar sem), por isso repetir é seguro: no máximo um chamado criado.
- **Conversas:** uma "sessão" do PRD é uma conversa. Cada funcionário tem no máximo uma conversa aberta (índice único no banco); voltar outro dia continua a aberta, e uma encerrada vira histórico. Estados: `agent`, `awaiting_analyst`, `with_analyst`, `closed`, com transições validadas (ver `state.ts`). O agent só fala em `agent`. O limite de 30 conta mensagens do funcionário e do agent; barra o funcionário ao chegar em 30, mas nunca impede o agent de responder a uma mensagem já aceita. Mensagens de analista e eventos (transferência, assumiu, devolveu, encerrou) não contam.
- **Banco:** SQLite em arquivo (volume Docker), migrações versionadas e só de acréscimo, aplicadas ao abrir. O chat e o console ainda são esqueletos: o chat mostra o contador real vindo do banco e o console mostra as contagens das abas.

## Decisões e suposições da parte 3

- **Agent:** Mastra (`@mastra/core`), uma execução por mensagem com `toolChoice: required`. O agent só fala pela tool `reply_to_employee`, que traz a mensagem e a explicação (intenção, o que entendeu, o que fez, confiança, motivo, regras); a mensagem é transmitida enquanto o modelo escreve. Se o modelo responder fora do formato, a resposta é mantida com confiança reduzida.
- **O que é código e o que é modelo:** o modelo entende o pedido e relata fatos; o código decide a prioridade (matriz do Anexo A), a duplicidade, os prazos e quando uma transferência é permitida. Criar, atualizar e reabrir só acontecem em rascunhos que o funcionário confirma (botão ou "sim"). Confirmar e cancelar não passam pelo modelo e usam a chave de idempotência `draft-<id>`.
- **Proteções:** número de chamado que nenhuma consulta devolveu para o funcionário é bloqueado na resposta; transferência por "vencido" ou "crítico" é verificada com dados reais; abaixo de 50% de confiança o agent transfere em vez de chutar; a confiança do modelo é limitada pelas evidências (artigo fraco, sistema instável).
- **Registro de decisões:** cada resposta guarda os passos (com tempo e resumo), as regras verificadas pelo sistema e as apenas declaradas pelo modelo, as proteções acionadas, a confiança com seus fatores e o uso de tokens (tabela `agent_decisions`).
- **Custo:** modelo pequeno por padrão (`LLM_MODEL=anthropic/claude-haiku-5-5`), no máximo 6 passos e 1.200 tokens de saída por turno, histórico limitado pelas 30 mensagens da sessão, confirmação e cancelamento sem modelo, e regras fixas separadas do contexto do turno para permitir cache do provedor.
- **Limites desta parte:** a interface do chat (parte 4) ainda não consome o stream. Os testes usam um modelo roteirizado, então a qualidade das decisões com um LLM real não foi medida; as avaliações ficam para a parte 6.
