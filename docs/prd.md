# PRD resumido: Nexo Assist

Fonte: "Desafio Técnico: Nexo Assist, o agent do service desk de TI" (Beyond the Bytes · processo seletivo, PRD v5, 5 páginas). Este arquivo guarda o essencial para consulta rápida; em caso de dúvida, vale o PDF original.

## Objetivo

A Nexo tem cerca de 2.000 funcionários. Hoje o chamado de TI nasce de um formulário, o que gera chamados para dúvidas que a central de ajuda já responde, duplicados, prioridade errada, informação faltando e analistas gastando o dia em triagem. O Nexo Assist é um agent de atendimento em chat: o funcionário descreve o problema com as próprias palavras e o agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados e chama um analista quando precisa.

O sucesso é medido por:

- **Resolução sem fila:** dúvidas e consultas resolvidas no próprio chat.
- **Chamados bem abertos:** completos, com tipo, categoria e prioridade corretos, sem duplicidade.
- **Encaminhamento certo:** o que precisa de pessoa chega ao analista na hora certa e com contexto.
- **Transparência:** dá para entender o que o agent fez e por quê em cada resposta.

## Histórias

Funcionário (entra com o e-mail corporativo):

1. Tirar uma dúvida sem abrir chamado.
2. Saber como está um chamado, mesmo sem lembrar o número, e se está atrasado.
3. Complementar um chamado aberto.
4. Abrir um chamado só conversando, conferindo os dados antes da criação.
5. Falar com um analista quando preferir ou quando o problema for grave.
6. Voltar outro dia e continuar de onde parou.

Analista (Suporte N1 e N2):

1. Receber chamados com tipo, categoria e prioridade corretos e descrição que não exija perguntar tudo de novo.
2. Ver as conversas que precisam dele, inclusive quando o agent não teve segurança para decidir.
3. Assumir uma conversa (agent pausado), devolvê-la ao agent ou encerrá-la.

## O que construir

1. **Login** (tela 1): e-mail corporativo e senha; aceita os funcionários dos dados de exemplo com qualquer senha.
2. **Chat do funcionário** (telas 2 e 3): respostas em tempo real, cards de chamado, seleção de chamado, rascunho para confirmação, perguntas com opções rápidas, limite de 30 mensagens por sessão.
3. **Agent:** decide o que fazer a cada mensagem usando a central de ajuda e o serviço de chamados, seguindo o Anexo A.
4. **Serviço de chamados simulado**, separado do agent, com dados de exemplo: consultar, criar, atualizar e transferir. É um sistema legado e de vez em quando fica indisponível por alguns segundos.
5. **Transferência para analista:** a conversa fica "aguardando atendente" e o agent para de responder até ser liberado.
6. **Console do analista** (telas 4 e 5): lista de conversas com filtros e status, histórico, assumir (agent pausado), devolver ao agent, encerrar, painel com os chamados do funcionário.

**Visibilidade das decisões (a parte mais importante):** acima de cada resposta, as ações do agent ("consultou seus chamados", "classificou a prioridade"). Além disso, deve dar para ver em detalhe o que o agent entendeu, que ação tomou, com que grau de segurança e por quê. O formato é livre (expandir ações, painel lateral ou log estruturado), desde que seja fácil de ler.

## Requisitos técnicos

| Tema | Requisito |
| --- | --- |
| Linguagem | TypeScript, com tipagem estrita |
| Agent | Mastra (preferência) ou LangGraph.js |
| Modelo | Qualquer provedor de LLM; explicar a escolha no README |
| Interface | Seguir o protótipo (sugestão: Next.js ou React) |
| Dados | Serviço de chamados simulado, separado do agent |
| Persistência | Conversas, chamados e estado de cada conversa (com o agent ou com um analista) sobrevivem a reinício |
| Execução | Rodar local com poucos comandos documentados no README, e um `.env.example` |

Também esperado: arquitetura clara (interface, agent e serviços separados, decisões justificadas); boas práticas (código organizado, testes onde fazem diferença, tratamento de erros, commits que contam a história); eficiência (respostas rápidas, uso consciente do modelo, custo por conversa); segurança e privacidade (chaves fora do código e chamados de um funcionário nunca expostos a outro).

**Diferencial:** deploy publicado (Vercel, Railway, Fly.io, Render...). Se fizer, proteger as chaves, limitar o uso e explicar no README.

## Entregáveis e avaliação

Entregar: link do repositório no GitHub; README com como rodar, visão geral da arquitetura, como o agent decide o que fazer, como a qualidade das decisões foi garantida, principais trade-offs e o que faria com mais tempo; link do deploy, se houver. O uso de IA é permitido e esperado; na entrevista haverá conversa sobre o código e pedidos de pequenas mudanças ao vivo.

Critérios: qualidade das decisões; condução da conversa (pergunta quando falta informação, confirma antes de agir, mantém o contexto, responde com clareza); transparência; interface (fidelidade ao protótipo, estados de carregamento e erro); arquitetura e boas práticas; clareza do README; deploy (conta pontos extras, a ausência não penaliza).

## Anexo A: regras do service desk

- **Tipos:** incidente (INC), quando algo parou ou não funciona; requisição (REQ), pedido de acesso, equipamento ou software.
- **Categorias:** Acesso, Rede e VPN, Hardware, Software, E-mail e Outros.
- **Abertura:** todo chamado precisa de título, descrição, tipo, categoria, prioridade e de quem é afetado. O agent mostra um rascunho e só cria ou atualiza depois da confirmação do funcionário.
- **Sem duplicidade:** se já existe chamado aberto sobre o mesmo problema, ele é atualizado, não duplicado. Chamados resolvidos há até 7 dias podem ser reabertos.
- **Transferência:** quando o funcionário pede, em casos críticos, em chamados vencidos ou quando o agent não tem segurança. Leva um resumo do caso; o agent não responde enquanto a conversa está com um analista.
- **Privacidade:** informações de um chamado só podem ser passadas a quem o abriu.
- **Escopo:** apenas assuntos de TI; RH, financeiro e facilities são redirecionados.
- **Prioridade:** combina impacto (quantas pessoas são afetadas) e urgência (há compromisso em risco). O prazo vale para a primeira resposta e para cada atualização; passado o prazo, o chamado está vencido.

| Prioridade | Quando usar | Prazo |
| --- | --- | --- |
| Crítica | Algo parado para uma equipe ou para a empresa | 1 hora |
| Alta | Impede uma pessoa de trabalhar, ou há compromisso no mesmo dia | 4 horas úteis |
| Média | Atrapalha, mas há alternativa | 3 dias úteis |
| Baixa | Pedidos e melhorias sem urgência | 5 dias úteis |

## Anexo B: dados de exemplo

Criar funcionários, de 5 a 10 artigos curtos para a central de ajuda e chamados em situações variadas (aberto, vencido, resolvido recentemente, de outros funcionários). Exemplos do PDF:

- Artigo: "VPN com erro 809: reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado."
- Artigo: "Horário do service desk: de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas."
- INC-20311, "Notebook lento após atualização do Windows", Hardware, Média, Aguardando analista, há 6 dias.
- REQ-10442, "Segundo monitor para home office", Hardware, Baixa, Aprovado, há 1 semana.
- INC-20150, "Senha do SAP bloqueada", Acesso, Média, Resolvido, há 4 dias.

## Anexo C: protótipo

Arquivo `nexo.pen` no pen.dev (link no PDF). Telas: 1 Login; 2 Abertura de chamado; 3 Consulta de chamado; 4 Console, conversa transferida; 5 Console, analista atendendo. Os dados do protótipo são ilustrativos. Detalhes em [prototipo.md](prototipo.md).
