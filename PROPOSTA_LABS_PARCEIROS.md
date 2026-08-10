# Proposta — Encaminhamento de exames para laboratórios parceiros

Texto para alinhamento com a equipe da BioPet. O objetivo aqui é **fechar todas
as regras antes de programar qualquer coisa**. Onde houver "❓", precisamos da
resposta de vocês.

---

## 1. A ideia em uma frase

A BioPet passa a receber pedidos de exame (de vet parceiro, clínica parceira, ou
de um cliente que fala com vocês), e o sistema cuida do resto: decide o jeito mais
barato de fazer cada exame, monta o pedido de coleta, imprime as etiquetas, agenda
a coleta, calcula e compra o frete, controla o estoque e o dinheiro, e no fim
entrega o laudo com a cara da BioPet.

---

## 2. O que o sistema vai fazer sozinho

**Escolher a opção mais vantajosa.** Para cada pedido, o sistema compara todos os
caminhos e escolhe o de **menor custo total** (valor do exame + frete + isopro +
gelo + tubo). Ele considera que o frete é cobrado **por caixa enviada**, não por
exame — então sabe aproveitar o frete. Na prática ele pode concluir coisas como:
- "vale a pena fazer esses 3 aqui dentro e mandar só esses 2 pro lab";
- "manda tudo pro mesmo lab, porque paga um frete só";
- "mesmo esse exame sendo mais caro nesse lab, compensa, porque já vai uma caixa
  pra lá de qualquer forma";
- "divide: esses vão pro laboratório A, aqueles pro B".

**Montar o pedido de coleta (a requisição).** O sistema gera uma folha de trabalho
explicando o que fazer com cada amostra: quantas coletas, de que tipo, em qual
tubo cada exame vai, qual etiqueta cola em qual tubo — como um pedido de exame de
verdade.

**Imprimir todas as etiquetas.** Etiqueta de cada tubo e etiqueta de postagem —
tudo numa impressora térmica só.

**Agendar a coleta e avisar a hora.** O compromisso de coleta entra na agenda que
vocês já usam, e o sistema notifica quando chega a hora de coletar.

**Cuidar do frete.** Cota as transportadoras, escolhe a mais barata que atende o
prazo, compra e gera a etiqueta de postagem, e acompanha o rastreio.

**Controlar o dinheiro.** Calcula o custo total e a margem de cada pedido; quando
a clínica recebeu do cliente, calcula quanto ela tem que repassar para a BioPet;
e diz em qual maquininha passar cada valor (o rodízio de R$ 1.500).

**Controlar o estoque.** Dá baixa automática de tubos, isopor, gelo e etiquetas a
cada pedido, e avisa quando algum item está acabando.

**Emitir o laudo com a cara da BioPet** ao receber o resultado do laboratório.

---

## 3. O que continua sendo feito por uma pessoa

O sistema decide e documenta tudo, mas o trabalho físico é de vocês: **coletar a
amostra, montar a caixa de isopor com gelo, colar as etiquetas, postar e passar o
cartão na maquininha**. E, enquanto o laboratório não mandar resultado de forma
automática, alguém precisa **lançar o resultado** para o sistema gerar o laudo.

---

## 4. O que precisamos ter/comprar

- **Uma impressora térmica de etiquetas** (a mesma imprime etiqueta de tubo e de
  postagem — sem tinta). Modelos comuns custam de R$ 500 a R$ 1.000.
- **Conta no Melhor Envio** com **saldo pré-pago** (o frete é debitado desse saldo).
- **Caixas de isopor + gelo** (já usam).
- Impressora comum **não** é necessária (o laudo é digital). Só se quiserem laudo
  em papel.

---

## 5. Decisões e dúvidas que precisamos fechar

### A. Preço e cobrança
1. ❓ A coluna **"Vet e Clínica Parceira"** da tabela está em branco. Quem define
   esse preço e qual a regra? (uma margem fixa sobre o custo? valor a valor?)
2. ❓ O preço **direto ao cliente** é o "+40%" que já está na tabela — confirmam?
3. ❓ Quando é uma **clínica** que atende o cliente: a clínica cobra o cliente o
   preço que quiser, ou usa um preço que a BioPet sugere?
4. ❓ O **repasse que a clínica deve à BioPet** é sempre o "preço parceiro"? O
   **frete e os insumos** entram nesse repasse, ou a BioPet absorve?
5. ❓ Existe algum caso de **exame gratuito/cortesia** nesse fluxo?

### B. A escolha do "mais vantajoso"
6. ❓ O critério é **só o menor custo**, ou menor custo **respeitando um prazo
   máximo**? Qual é o prazo máximo aceitável de entrega do resultado?
7. ❓ Existe exame que **sempre** tem que ir para um laboratório específico (por
   qualidade/metodologia), custe o que custar? Se sim, quais?
8. ❓ Quais exames a BioPet **faz internamente hoje** (para o sistema poder
   comparar "fazer" contra "encaminhar")? Confirmar a lista exata.
9. ❓ Em caso de **empate** (dois caminhos custam quase o mesmo), o que ganha?
   O mais rápido? Um laboratório preferido?

### C. Frete e transporte
10. ❓ Endereço/CEP **de origem** (de onde a BioPet posta).
11. ❓ Endereços/CEP **de destino** de cada laboratório (Tecsa, Hormonalle, outros).
12. ❓ Medidas e peso das **caixas de isopor** que vocês usam (pode ser 2–3
    tamanhos padrão: pequena/média/grande).
13. ❓ Confirmado: transporte **sem refrigeração** (isopor + gelo), prazo 2–3 dias,
    aceito por vocês e pelo lab. Segue valendo?
14. ❓ Há **horário-limite de postagem** por dia que a gente precise respeitar?

### D. Coleta, agenda e requisição
15. ❓ A coleta é sempre na BioPet, ou às vezes em outro lugar?
16. ❓ Quais **horários/janelas de coleta** existem? Depende do dia da postagem?
17. ❓ A **notificação da hora de coletar** deve ir para quem e por onde
    (WhatsApp? painel do sistema?).
18. ❓ Na **requisição de coleta** (a folha de trabalho), que informações vocês
    querem ver? (pet, tutor, exames, tubo de cada um, jejum, observações...)
19. ❓ Precisa constar **preparo do paciente** (jejum, medicação) na requisição?
20. ❓ Quanto tempo a amostra pode esperar entre **coletar e postar**?

### E. Tubos
21. ❓ Confirmar que a regra de **quantos tubos** (juntar exames de mesma cor/tipo
    num tubo só) bate com a prática de vocês.
22. ❓ Existe exame que **não pode dividir tubo** com outro?
23. ❓ Qual o **volume útil** de cada tubo de vocês (para o sistema saber quando
    precisa de um 2º tubo da mesma cor)?

### F. Maquininhas (rodízio de recebimento)
24. ❓ **Quantas** maquininhas e em que **ordem** entram no rodízio?
25. ❓ O limite é **sempre R$ 1.500**, ou muda de uma máquina para outra?
26. ❓ O acumulado de R$ 1.500 **zera quando**? Nunca (rodízio contínuo), todo dia,
    ou só quando vocês mandam zerar?
27. ❓ Um pagamento **único acima de R$ 1.500** (ex.: exame de R$ 2.000): vai
    inteiro na próxima máquina, ou divide entre duas?
28. ❓ O rodízio vale **só para labs** ou para **todos os recebimentos** da BioPet
    (inclusive os agendamentos normais)?
29. ❓ Entram no rodízio só **cartão**, ou **Pix/dinheiro** também?

### G. Estoque de insumos
30. ❓ Quais itens controlar? (tubos por cor, isopor por tamanho, gelo, etiquetas,
    seringa, agulha, álcool... o que mais?)
31. ❓ **Custo unitário** de cada item (para calcular o custo real do pedido).
32. ❓ **Estoque mínimo** de cada item (para o alerta de reposição).
33. ❓ Controlar também os **reagentes da bioquímica interna**, ou só os insumos de
    envio por enquanto?

### H. Resultado e laudo
34. ❓ Como o **resultado chega** do laboratório? (PDF por e-mail? portal do lab?
    algum lab entrega de forma automática/integrada?)
35. ❓ **Quem lança/confere** o resultado para virar laudo BioPet?
36. ❓ O laudo BioPet **substitui** o do laboratório, ou **anexa** o original junto?

### I. Pagamento e faturamento
37. ❓ Cliente direto paga como? (Pix/cartão na hora — maquininha; ou link de
    pagamento?)
38. ❓ A clínica é cobrada **por pedido** ou **em lote** (juntando vários e
    fechando depois, como já é feito hoje)?

### J. Origem do pedido (confirmar)
39. ❓ Confirmado: o pedido só nasce de **vet parceiro, clínica parceira, ou vocês
    lançando por um cliente**. O cliente **nunca** marca sozinho. Correto?

---

## 6. Como seguimos

Assim que essas respostas estiverem fechadas, montamos a versão final das regras e
só então começamos a construir — em etapas, começando pelo **cadastro dos exames
dos laboratórios** (a tabela dos ~600 exames) e a tela de pedido, deixando o frete,
o estoque, as maquininhas e o motor de decisão para as etapas seguintes.
