# Protótipo (pen.dev): notas para a interface

Arquivo `nexo.pen`, 6 telas desktop (1440×900; a tela 5 tem 1567 de largura). O PRD lista 5 telas; o arquivo traz uma sexta, "Meu perfil". Os dados mostrados são ilustrativos.

Para reler o arquivo: abrir o link de compartilhamento no navegador, achar a requisição para `storage.googleapis.com/pencil-user-data/.../*.pen` (URL assinada) e baixar. O conteúdo é JSON comprimido com zstd (`zstd -d`).

## Identidade visual

- **Fonte da interface:** Schibsted Grotesk (quase tudo). **Fonte de destaque:** Newsreader, só no título grande do login (34 px).
- **Tamanhos:** 11, 11.5, 12, 12.5, 13.5, 14.5, 15.5 (texto corrido e rótulos), 16, 18, 20, 34. **Pesos:** 400, 500, 600, 700.
- **Raios:** 999 (pílulas e avatares), 6, 8, 12, 16. Balões de chat com raio 12 e 4 no canto de origem.
- **Cores base:** `ink` #1B2431 (texto e painel escuro do login), `ink-2` #3D4656, `ink-3` #5B6472 (texto secundário), `rule` #E6E8EC (bordas), `paper` #FFFFFF, `desk` #F6F7F9 (fundo).
- **Ação:** `cta` #0062C4, `primary` #0285F7, `primary-text` #0069C7, `primary-soft` #0285F712 (fundo claro de destaque).
- **Estados:** sucesso #00BD6C (texto #00804A), alerta #F5A500 (texto #946300), perigo #EE343B (texto #C4161D); cada um tem versão suave com transparência de 8% a 10%.
- Os chips de ação do agent e os selos de status usam as versões suaves com texto escuro da mesma família.

## Telas

**1. Identificação (login).** Painel escuro à esquerda (800 px): marca "Nexo Assist", rótulo "Service desk de TI da Nexo", título "Seu problema de TI, resolvido em uma conversa.", subtítulo explicando que o assistente consulta chamados, busca na central de ajuda e chama um analista; uma prévia de conversa (pedido de VPN com erro 809, ações "consultou seus chamados · criou um chamado", card INC-20517 "Rede e VPN · Alta · em até 4 h") e três números (8 s primeira resposta em média, 72% resolvidos sem fila, 6 analistas online agora). À direita: "Entrar", "Use seu e-mail corporativo e a senha da rede Nexo.", campos E-mail corporativo (exemplo ana.souza@nexo.com.br) e Senha, link "Esqueci minha senha", opção "Manter conectado neste computador". Topo: "Problema para entrar? Ligue no ramal 4000". Rodapé: "© 2026 Nexo · Service desk de TI" e "Privacidade e uso de dados".

**2. Chat, novo chamado.** Menu lateral: marca, "Atendimento", "Meu perfil", cartão do usuário (iniciais, nome, e-mail), "Sair". Topo: "Service desk de TI › Atendimento" e "Assistente online". Conversa:

- Mensagem do funcionário, depois resposta do "Nexo Assist" com chips de ação acima do texto ("consultou seus chamados", "buscou na central de ajuda").
- Pergunta com opções rápidas numeradas: "Quem está sendo afetado?" com 1 Só eu, 2 Minha equipe, 3 Toda a empresa, 4 Não sei.
- Novos chips ("classificou a prioridade", "consultou o SLA", "montou o rascunho") e a explicação da prioridade escolhida.
- **Card de rascunho:** "Novo chamado", "Rascunho D-381", selo "Aguardando confirmação"; título; descrição; Categoria, Prioridade (com prazo, "resposta até 13:43") e Afetados; botões Confirmar (atalho ⌘↵), Editar e Cancelar.
- Campo "Escreva para o Nexo…", botão Enviar e contador "18/30 mensagens nesta sessão".

**3. Chat, consulta e transferência.** Mesma estrutura. Pergunta "Qual o status do meu chamado?"; o agent lista "Você tem 3 chamados abertos. Sobre qual deles quer saber?" com cards selecionáveis (ID, título, selo de status, data): INC-20311 Aguardando analista, INC-20298 Em andamento, REQ-10442 Aprovado. Após a escolha, o chip "consultou o INC-20311 · calculou o prazo" e o **card do chamado:** ID, selo de status, título, descrição, Categoria (com subcategoria, "Hardware › Notebook"), Prioridade, Aberto em, Última atualização ("há 5 dias · prazo vencido"). O agent explica o atraso em relação ao prazo da prioridade e oferece opções rápidas: "Falar com um analista", "Adicionar informação", "Não, obrigado". Contador "16/30 mensagens nesta sessão".

**4. Atendente, conversas.** Três colunas.

- **Trilho:** logo, ícone "Conversas" com contador (5), iniciais do analista.
- **Lista:** título "Conversas", seletor de disponibilidade ("Disponível"), busca "Pesquisar conversa ou chamado", abas Todas, Para você (3), Com o agent (9), Minhas (1). Cada item mostra iniciais, nome, hora, prévia da última mensagem, contador de não lidas e um rótulo de estado: "Transferida · INC-20311", "Transferida · contato em 25 min", "Agent pediu ajuda · confiança 41%", "Agent atendendo", "Resolvida pelo agent", "Você está atendendo".
- **Conversa:** cabeçalho (nome, "online · Financeiro · INC-20311", selo "Aguardando atendente"), mensagens com separador de dia, evento "Transferida para Suporte N2 · 10:05" e barra inferior "Ana espera um atendente · Agent pausado · até 12:05" com os botões "Devolver ao agent" e "Assumir atendimento"; o campo de resposta fica bloqueado ("Assuma o atendimento para responder").
- **Painel direito, "Chamados da Ana"** ("3 abertos · 2 encerrados"): bloco "Desta conversa" (INC-20311, selo de status, título, "Hardware · prioridade média", "Transferido para um analista", hora) e "Outros chamados" (ID, status ou "Resolvido em 02 set"); rodapé "Ver todos os chamados da Ana".

**5. Atendente, atendimento assumido.** Mesma tela, com o evento "Rafael Lima assumiu · agent pausado · 10:12", mensagens do analista (nome e "Suporte N2") em vez do agent, campo de resposta liberado, botões "Devolver ao agent" e "Encerrar atendimento" no cabeçalho, item da lista marcado "Você está atendendo" e o chamado em "Em atendimento · Assumido por Rafael Lima".

**6. Meu perfil.** Menu lateral igual. "Meu perfil", "Seus dados de acesso ao service desk de TI."; Nome, E-mail corporativo ("Gerenciado pela TI"), Senha ("Alterada há 42 dias") com botão "Redefinir senha" e aviso "Enviaremos um link de redefinição para ana.souza@nexo.com.br."

## Observações para implementar

- A transparência do protótipo é só a faixa de chips; o PRD pede também o detalhe (entendimento, ação, confiança, motivo). Reservar espaço para expandir cada resposta ou abrir painel lateral.
- Os nomes do protótipo (Ana Souza, Carla Mendes, Bruno Tavares, Diego Ramos, Elisa Prado, Fábio Nunes, Gabriela Rocha, Rafael Lima) e os chamados citados estão nos dados de exemplo do serviço de chamados.
