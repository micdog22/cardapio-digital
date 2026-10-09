# Cardápio Digital — cardápio online com pedido pelo WhatsApp (HTML + JS)

Modelo gratuito de cardápio online para lanchonete, açaiteria, pizzaria, doceria ou qualquer pequeno negócio que vende pelo WhatsApp. O cliente abre o link, monta o pedido (com adicionais e observações), escolhe entrega ou retirada e a forma de pagamento, e o WhatsApp abre com a mensagem pronta para a loja.

Você edita **um único arquivo** (`cardapio.json`) direto no site do GitHub e publica de graça no GitHub Pages. Sem servidor, sem banco de dados e sem mensalidade.

**Acesse online:** https://micdog22.github.io/cardapio-digital/ (cardápio de exemplo)

## Recursos
- Selo "Aberto agora" / "Fechado — abre às 18h" calculado pelos horários do cardápio, no horário de Brasília (aceita horários que passam da meia-noite, como 18:00 às 02:00).
- Categorias com atalhos, busca sem diferenciar acentos e itens indisponíveis marcados.
- Carrinho com quantidades, adicionais com preço e observação por item.
- Entrega ou retirada, endereço, forma de pagamento e "troco para quanto" quando for dinheiro.
- Taxa de entrega e pedido mínimo para entrega.
- Mensagem do pedido organizada, com *negrito* do WhatsApp.
- O carrinho fica salvo no celular do cliente, mesmo se ele fechar a página.
- Se o `cardapio.json` tiver algum erro, a página mostra qual campo corrigir.
- Cor do tema configurável, modo claro e escuro, feito para celular.

## Como colocar o seu cardápio no ar (sem programar)
1. **Crie uma conta gratuita no GitHub** em https://github.com, se ainda não tiver.
2. **Faça uma cópia do projeto (fork):** abra https://github.com/micdog22/cardapio-digital, clique em **Fork** e depois em **Create fork**. Se quiser, troque o nome do repositório nesse momento (por exemplo, `cardapio`), porque ele vai fazer parte do endereço.
3. **Edite o cardápio:** no seu repositório, clique no arquivo `cardapio.json` e depois no ícone de lápis (**Edit this file**). Troque nome, WhatsApp, endereço, horários, preços e itens, seguindo o modelo que já está lá. Para salvar, clique em **Commit changes…** e confirme.
4. **Ative o GitHub Pages:** vá em **Settings** → **Pages**. Em **Build and deployment**, escolha **Deploy from a branch**, selecione a branch **main** e a pasta **/ (root)** e clique em **Save**. Em um ou dois minutos o endereço aparece no topo da página, no formato `https://SEU-USUARIO.github.io/cardapio-digital/`.
5. **Teste:** abra o link no celular, monte um pedido e envie. A mensagem vai para o número configurado; vale testar primeiro com o seu próprio número.
6. **Divulgue:** coloque o link na bio do Instagram, no status do WhatsApp e no perfil da empresa no Google. Para mesas e balcão, gere um QR code do link em qualquer gerador de QR code e imprima.

Para mudar preços ou itens depois, é só editar o `cardapio.json` de novo. A página publicada atualiza em poucos minutos (se não aparecer, recarregue a página).

## O arquivo cardapio.json
Exemplo resumido (o arquivo do projeto tem o cardápio completo da "Lanchonete Exemplo"):

```json
{
  "nome": "Lanchonete Exemplo",
  "slogan": "Lanches artesanais feitos na hora",
  "whatsapp": "5519900000000",
  "endereco": "Rua Exemplo, 123 – Centro",
  "taxaEntrega": 5.00,
  "pedidoMinimo": 20.00,
  "pagamentos": ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito"],
  "corTema": "#c2410c",
  "horarios": {
    "domingo": "18:00-23:30",
    "segunda": "fechado",
    "sexta": "18:00-02:00",
    "sabado": "11:00-14:00, 18:00-02:00"
  },
  "categorias": [
    {
      "nome": "Lanches",
      "itens": [
        {
          "id": "x-burguer",
          "nome": "X-Burguer",
          "descricao": "Pão brioche, hambúrguer de 150 g, queijo e molho da casa.",
          "preco": 24.90,
          "adicionais": [
            { "nome": "Adicional de bacon", "preco": 4.00 }
          ]
        }
      ]
    }
  ]
}
```

| Campo | O que é |
|---|---|
| `nome` | Nome do negócio (obrigatório). |
| `slogan` | Frase curta embaixo do nome (opcional). |
| `whatsapp` | Número que recebe os pedidos: 55 + DDD + número, só dígitos. Ex.: `"5519900000000"`. |
| `endereco` | Endereço da loja, mostrado no topo e para quem escolhe retirada (opcional). |
| `taxaEntrega` | Valor da entrega. Use `0` para entrega grátis. |
| `pedidoMinimo` | Valor mínimo dos produtos para entrega (sem contar a taxa). Use `0` para não ter mínimo. |
| `pagamentos` | Formas de pagamento aceitas. Se uma delas tiver a palavra "Dinheiro", o cliente pode informar o troco. |
| `corTema` | Cor do topo e dos botões, no formato `"#c2410c"`. A cor do texto se ajusta sozinha. |
| `horarios` | Um texto por dia: `domingo`, `segunda`, `terca`, `quarta`, `quinta`, `sexta`, `sabado`. |
| `fusoHorario` | Opcional. Padrão: `"America/Sao_Paulo"`. Em outros fusos, use por exemplo `"America/Manaus"`. |
| `categorias` | Lista de categorias, cada uma com `nome` e `itens`. |

Cada item tem `nome` e `preco` (obrigatórios) e, se quiser, `id`, `descricao`, `imagem`, `adicionais` (lista de `nome` e `preco`) e `disponivel`.

Dicas:
- **Preços:** use ponto como separador decimal nos números (`24.90`) ou escreva entre aspas no formato brasileiro (`"24,90"`).
- **Horários:** `"18:00-23:00"`; vários períodos separados por vírgula (`"11:00-14:00, 18:00-02:00"`); `"fechado"` para dias sem atendimento. Quando o fechamento é depois da meia-noite, coloque o horário no dia em que a loja abre: `"sexta": "18:00-02:00"` vale de sexta às 18h até sábado às 2h. Dia que não aparece na lista conta como fechado.
- **Item em falta:** coloque `"disponivel": false` no item. Ele continua no cardápio, mas não pode ser pedido.
- **Fotos:** envie as imagens para uma pasta `img` do repositório (**Add file** → **Upload files**) e use `"imagem": "img/x-burguer.jpg"`, sem barra no começo. Prefira fotos pequenas (até uns 300 KB) para o cardápio abrir rápido.
- **`id`:** identifica o item no carrinho salvo do cliente. Se não informar, ele é criado a partir do nome.
- Textos sempre entre aspas retas (`"`), sem vírgula depois do último item de uma lista. Se algo estiver errado, a página mostra o que corrigir em vez do cardápio.

## Como funciona
Tudo acontece no navegador do cliente: a página lê o `cardapio.json`, monta o cardápio e, ao enviar, abre `https://wa.me/<número>?text=<pedido>` com a mensagem pronta. A loja recebe o pedido como uma conversa normal no WhatsApp e confirma por lá. Não há pagamento online: a forma de pagamento escolhida vai na mensagem.

O selo de aberto/fechado usa o relógio do aparelho de quem abre o cardápio, convertido para o fuso configurado.

## Como rodar localmente
Na pasta do projeto:

```bash
python3 -m http.server 8000
```

Depois abra http://localhost:8000 (módulos ES e a leitura do `cardapio.json` não funcionam via `file://`).

## Testes
```bash
npm test
```

Usa o `node:test` nativo, sem nenhuma dependência. Os testes cobrem a validação do `cardapio.json`, os totais com adicionais e taxa de entrega, o pedido mínimo, a mensagem do WhatsApp e os horários (madrugada, dias fechados e fuso horário). A lógica fica em `src/cardapio.js`.

## Contribuindo
Issues e pull requests são bem-vindos.

## Licença
MIT — veja [LICENSE](LICENSE).
