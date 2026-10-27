# Plano por partes

O desenvolvimento acontece na branch `staging`, em partes pequenas, para que cada commit conte um pedaço da história. Cada parte termina com testes passando e o projeto subindo no Docker.

| Parte | Escopo | Estado |
| --- | --- | --- |
| 1 | Serviço de chamados legado simulado (Python): chamados, central de ajuda, diretório, SLA em horário útil, instabilidade simulada, dados de exemplo, testes, Docker | pronta |
| 2 | App web (Next.js, TypeScript estrito): login (tela 1), sessão, banco de conversas, cliente tipado do serviço com retentativas e idempotência, tokens de design | pendente |
| 3 | Agent (Mastra): tools sobre o serviço e a central de ajuda, regras do Anexo A em código, registro estruturado de cada decisão, streaming | pendente |
| 4 | Chat do funcionário (telas 2 e 3) com cards, rascunho para confirmação, opções rápidas, limite de 30 mensagens e painel de transparência | pendente |
| 5 | Console do analista (telas 4 e 5): lista com filtros, assumir, devolver, encerrar, chamados do funcionário | pendente |
| 6 | Meu perfil, README final (arquitetura, como o agent decide, qualidade, trade-offs), avaliações do agent, deploy opcional | pendente |

## Decisões e suposições da parte 1

- **Stack:** o PRD exige TypeScript, Mastra e Next.js para a aplicação; o serviço de chamados é o "sistema legado" separado do agent e foi feito em Python (FastAPI + SQLite). Isso reforça a separação (outro processo, outro contêiner, contrato HTTP) e permite simular a instabilidade sem tocar no agent.
- **Quem decide o quê:** o serviço aplica as regras de negócio que não dependem de interpretação (privacidade, janela de 7 dias para reabrir, prazos, numeração, idempotência). O que depende de interpretação (duplicidade, prioridade, quando transferir) fica no agent, com guardas em código na parte 3.
- **Privacidade em camadas:** o chamador é identificado pelo e-mail no diretório (o papel nunca vem de cabeçalho); funcionário só enxerga os próprios chamados e o de outra pessoa responde 404, igual a um chamado inexistente; analista enxerga todos.
- **Prazos:** horário útil é segunda a sexta, das 8h às 18h (horário de São Paulo). Média = 3 dias úteis = 30 horas úteis; Baixa = 5 dias úteis = 50 horas úteis; Crítica = 1 hora corrida (plantão 24 h). O prazo conta a partir da criação ou da última atualização do service desk; informação adicionada pelo funcionário não reinicia o relógio. Chamados "Aprovado" aguardam compra ou entrega e ficam com o relógio parado (não vencem). Feriados não são considerados.
- **Instabilidade do legado:** latência artificial e falhas 503 aleatórias (padrão 10%, configurável). Parte das falhas de escrita acontece depois de gravar, então o cliente precisa repetir com a mesma `Idempotency-Key` (a repetição devolve o mesmo chamado). `POST /admin/outage` força uma queda para demonstrar.
- **Dados de exemplo relativos ao momento da criação:** "vencido", "resolvido há 4 dias" e "resolvido há tempo demais para reabrir" continuam verdadeiros em qualquer data. Para recarregar: `POST /admin/reset`.
- **Fuso:** todos os horários da API são UTC; a interface converte para o fuso de São Paulo.
