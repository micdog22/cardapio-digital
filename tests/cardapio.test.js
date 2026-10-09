import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addToCart,
  atTime,
  buildOrderMessage,
  cartSummary,
  describeJsonError,
  formatMoney,
  hoursTable,
  matchesSearch,
  openingStatus,
  parseDayHours,
  parsePrice,
  readableTextColor,
  reconcileCart,
  statusText,
  validateMenu,
  validateOrder,
  whatsappLink,
  zonedNow,
} from '../src/cardapio.js';

const NBSP = '\u00a0';
const sample = JSON.parse(readFileSync(new URL('../cardapio.json', import.meta.url), 'utf8'));
const { menu } = validateMenu(sample);
const money = (text) => text.replaceAll('R$ ', `R$${NBSP}`);
const customer = { name: 'Maria Exemplo', mode: 'entrega', address: 'Rua das Flores, 45 – Jardim Exemplo', complement: 'casa 2', payment: 'Pix', change: '' };

test('o cardapio.json de exemplo é válido', () => {
  const result = validateMenu(sample);
  assert.deepEqual(result.errors, []);
  assert.equal(menu.name, 'Lanchonete Exemplo');
  assert.equal(menu.categories.length, 4);
  assert.equal(menu.categories.reduce((n, c) => n + c.items.length, 0), 14);
  assert.equal(menu.deliveryFee, 500);
  assert.equal(menu.minimumOrder, 2000);
  assert.equal(menu.timeZone, 'America/Sao_Paulo');
});

test('validação aponta o campo errado', () => {
  const broken = structuredClone(sample);
  broken.nome = '';
  broken.whatsapp = '(19) 90000-0000';
  broken.taxaEntrega = 'cinco';
  broken.pagamentos = [];
  broken.corTema = 'laranja';
  broken.horarios = { sexta: '18h até tarde', feriado: '18:00-23:00', domingo: '18:00-18:00', 'Domingo': '18:00-22:00' };
  broken.categorias[0].itens[0].preco = 0;
  broken.categorias[0].itens[1].disponivel = 'sim';
  broken.categorias[1].itens[0].adicionais[0].preco = 'grátis';
  broken.categorias[2].itens[0].id = 'x-burguer';
  broken.categorias[3].itens = [];
  const { ok, errors } = validateMenu(broken);
  assert.equal(ok, false);
  const expected = [
    /^"nome": informe o nome do negócio/,
    /^"whatsapp": use o número com 55/,
    /^"taxaEntrega": use um número/,
    /^"pagamentos": liste as formas de pagamento/,
    /^"corTema": use uma cor no formato "#c2410c"/,
    /^"horarios" → sexta: não entendi "18h até tarde"/,
    /^"horarios": dia desconhecido "feriado"/,
    /^"horarios" → domingo: abertura e fechamento iguais/,
    /^"horarios": domingo aparece mais de uma vez \("Domingo"\)/,
    /^Item "X-Burguer": "preco" precisa ser um número maior que zero/,
    /^Item "X-Salada": "disponivel" deve ser true ou false/,
    /^Item "Batata frita \(300 g\)", adicional "Cheddar e bacon": "preco" precisa ser um número/,
    /^Item "Refrigerante lata \(350 ml\)": o "id" "x-burguer" já foi usado/,
    /^Categoria 4 \("Sobremesas"\): "itens" precisa ser uma lista/,
  ];
  assert.equal(errors.length, expected.length, errors.join('\n'));
  expected.forEach((pattern, i) => assert.match(errors[i], pattern));
});

test('validação de estrutura e itens sem nome', () => {
  assert.match(validateMenu([]).errors[0], /começar com \{/);
  const { errors } = validateMenu({ ...sample, horarios: 'todo dia', categorias: [{ nome: 'Bebidas', itens: [{ preco: 5 }] }] });
  assert.match(errors[0], /^"horarios": informe os horários/);
  assert.match(errors[1], /^Item 1 da categoria 1 \("Bebidas"\): falta o "nome"/);
  const semDias = validateMenu({ ...sample, horarios: { 'Sexta-feira': '18:00-23:00', 'sábado': '18h às 23h' } });
  assert.equal(semDias.ok, true);
  assert.equal(semDias.menu.schedule[1].length, 0, 'dia ausente = fechado');
  assert.equal(validateMenu({ ...sample, fusoHorario: 'America/Manaus' }).menu.timeZone, 'America/Manaus');
  assert.match(validateMenu({ ...sample, fusoHorario: 'Brasil/Limeira' }).errors[0], /^"fusoHorario": fuso desconhecido/);
});

test('erro de sintaxe no JSON vira mensagem com linha e coluna', () => {
  const text = '{\n  "nome": "Lanchonete",\n  "slogan": "x",\n}';
  let error;
  try {
    JSON.parse(text);
  } catch (e) {
    error = e;
  }
  const message = describeJsonError(text, error);
  assert.match(message, /^O arquivo cardapio\.json tem um erro de digitação perto da linha 4, coluna 1\./);
  assert.match(describeJsonError(text, new SyntaxError('JSON Parse error: Expected \'}\'')), /erro de digitação\. Confira/);
  assert.match(describeJsonError('{}', new SyntaxError('x in JSON at position 5 (line 2 column 3)')), /linha 2, coluna 3/);
});

test('preços: número ou texto no padrão brasileiro', () => {
  assert.equal(parsePrice(24.9), 2490);
  assert.equal(parsePrice('24,90'), 2490);
  assert.equal(parsePrice('R$ 1.299,90'), 129990);
  assert.equal(parsePrice('5'), 500);
  assert.ok(Number.isNaN(parsePrice(24.999)));
  assert.ok(Number.isNaN(parsePrice('vinte')));
  assert.ok(Number.isNaN(parsePrice(null)));
});

test('totais com adicionais e taxa de entrega', () => {
  let cart = [];
  cart = addToCart(cart, { itemId: 'x-burguer', qty: 2, addons: ['Adicional de bacon'], note: 'sem cebola' });
  cart = addToCart(cart, { itemId: 'refrigerante-lata', qty: 1, addons: [], note: '' });
  cart = addToCart(cart, { itemId: 'refrigerante-lata', qty: 2, addons: [], note: '' });
  assert.equal(cart.length, 2, 'linhas iguais se somam');
  const summary = cartSummary(menu, cart, 'entrega');
  assert.equal(summary.lines[0].unit, 2490 + 400);
  assert.equal(summary.lines[0].total, 2 * 2890);
  assert.equal(summary.subtotal, 5780 + 1800);
  assert.equal(summary.deliveryFee, 500);
  assert.equal(summary.total, 8080);
  assert.equal(summary.count, 5);
  const pickup = cartSummary(menu, cart, 'retirada');
  assert.equal(pickup.deliveryFee, 0);
  assert.equal(pickup.total, 7580);
  assert.equal(cartSummary(menu, [], 'entrega').total, 0, 'carrinho vazio não cobra entrega');
});

test('pedido mínimo vale para entrega', () => {
  const cart = [{ itemId: 'refrigerante-lata', qty: 2, addons: [], note: '' }];
  assert.equal(cartSummary(menu, cart, 'entrega').missingForMinimum, 800);
  const errors = validateOrder(menu, cart, customer);
  assert.deepEqual(errors.map((e) => e.message), [money('O pedido mínimo para entrega é R$ 20,00 (faltam R$ 8,00).')]);
  assert.deepEqual(validateOrder(menu, cart, { ...customer, mode: 'retirada', address: '' }), []);
  const enough = [{ itemId: 'x-burguer', qty: 1, addons: [], note: '' }];
  assert.deepEqual(validateOrder(menu, enough, customer), []);
});

test('validação do pedido: nome, endereço, pagamento e troco', () => {
  const cart = [{ itemId: 'x-bacon', qty: 1, addons: [], note: '' }];
  const fields = (c) => validateOrder(menu, cart, c).map((e) => e.field);
  assert.deepEqual(fields({ ...customer, name: ' ', address: '', payment: '' }), ['nome', 'endereco', 'pagamento']);
  assert.deepEqual(fields({ ...customer, payment: 'Dinheiro', change: '20' }), ['troco']);
  assert.deepEqual(fields({ ...customer, payment: 'Dinheiro', change: 'muito' }), ['troco']);
  assert.deepEqual(fields({ ...customer, payment: 'Dinheiro', change: '50,00' }), []);
  assert.deepEqual(fields({ ...customer, payment: 'Dinheiro', change: '' }), []);
  assert.deepEqual(validateOrder(menu, [], customer).map((e) => e.message), ['Seu carrinho está vazio.']);
});

test('mensagem do pedido para o WhatsApp', () => {
  const cart = [
    { itemId: 'x-burguer', qty: 2, addons: ['Adicional de bacon'], note: 'sem cebola' },
    { itemId: 'refrigerante-lata', qty: 1, addons: [], note: '' },
  ];
  const message = buildOrderMessage(menu, cart, { ...customer, payment: 'Dinheiro', change: '100' });
  assert.equal(message, ([
    'Olá, *Lanchonete Exemplo*! Quero fazer um pedido:',
    '',
    '*2x X-Burguer* — R$ 57,80',
    '   + Adicional de bacon (R$ 4,00)',
    '   Obs.: sem cebola',
    '*1x Refrigerante lata (350 ml)* — R$ 6,00',
    '',
    'Subtotal: R$ 63,80',
    'Taxa de entrega: R$ 5,00',
    '*Total: R$ 68,80*',
    '',
    '*Entrega:* Rua das Flores, 45 – Jardim Exemplo',
    'Complemento: casa 2',
    '*Pagamento:* Dinheiro (troco para R$ 100,00)',
    '*Nome:* Maria Exemplo',
  ].join('\n')));
  const pickup = buildOrderMessage(menu, cart, { ...customer, mode: 'retirada', payment: 'Pix' });
  assert.match(pickup, /\*Retirada no local\*/);
  assert.ok(!pickup.includes('Taxa de entrega'));
  assert.match(pickup, /\*Total: R\$ 63,80\*/);
  assert.ok(!message.includes('\u00a0'), 'sem espaço não separável na mensagem');
  const link = whatsappLink(menu.whatsapp, 'Olá! 1x X-Burguer & batata');
  assert.equal(link, 'https://wa.me/5519900000000?text=Ol%C3%A1!%201x%20X-Burguer%20%26%20batata');
});

test('carrinho salvo é conferido com o cardápio atual', () => {
  const saved = [
    { itemId: 'x-burguer', qty: 2, addons: ['Adicional de bacon', 'Inexistente'], note: '  sem   cebola ' },
    { itemId: 'aneis-de-cebola', qty: 1, addons: [] },
    { itemId: 'nao-existe', qty: 1 },
    { itemId: 'brownie', qty: 0 },
    'lixo',
  ];
  assert.deepEqual(reconcileCart(menu, saved), [{ itemId: 'x-burguer', qty: 2, addons: ['Adicional de bacon'], note: 'sem cebola' }]);
  assert.deepEqual(reconcileCart(menu, null), []);
});

test('horários: aberto, fechado, depois da meia-noite e dias fechados', () => {
  const s = menu.schedule;
  const at = (weekday, hhmm) => ({ weekday, minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) });
  assert.equal(statusText(openingStatus(s, at(5, '19:00'))).text, 'Aberto agora · fecha às 2h');
  assert.equal(statusText(openingStatus(s, at(6, '01:30'))).text, 'Aberto agora · fecha às 2h', 'sexta que passa da meia-noite');
  assert.equal(statusText(openingStatus(s, at(6, '02:00'))).text, 'Fechado — abre às 11h');
  assert.equal(statusText(openingStatus(s, at(6, '12:00'))).text, 'Aberto agora · fecha às 14h');
  assert.equal(statusText(openingStatus(s, at(6, '15:00'))).text, 'Fechado — abre às 18h');
  assert.equal(statusText(openingStatus(s, at(0, '01:00'))).text, 'Aberto agora · fecha às 2h', 'sábado que passa da meia-noite');
  assert.equal(statusText(openingStatus(s, at(0, '10:00'))).text, 'Fechado — abre às 18h');
  assert.equal(statusText(openingStatus(s, at(0, '23:45'))).text, 'Fechado — abre terça às 18h', 'segunda fechada, abre na terça');
  assert.equal(statusText(openingStatus(s, at(1, '20:00'))).text, 'Fechado — abre amanhã às 18h', 'segunda fechada');
  assert.equal(statusText(openingStatus(s, at(4, '23:29'))).text, 'Aberto agora · fecha às 23h30');
  assert.equal(statusText(openingStatus(s, at(4, '23:30'))).text, 'Fechado — abre amanhã às 18h');
  const closedAllWeek = [[], [], [], [], [], [], []];
  assert.equal(statusText(openingStatus(closedAllWeek, at(3, '12:00'))).text, 'Fechado');
  const midnight = [[{ open: 1080, close: 0 }], [], [], [], [], [], []];
  assert.equal(statusText(openingStatus(midnight, at(0, '23:59'))).text, 'Aberto agora · fecha à meia-noite');
  assert.equal(statusText(openingStatus(midnight, at(1, '00:00'))).text, 'Fechado — abre domingo às 18h');
});

test('"agora" no fuso de São Paulo (injetado)', () => {
  assert.deepEqual(zonedNow(new Date('2026-10-10T02:30:00Z')), { weekday: 5, minutes: 23 * 60 + 30 });
  assert.deepEqual(zonedNow(new Date('2026-10-10T03:15:00Z')), { weekday: 6, minutes: 15 });
  assert.deepEqual(zonedNow(new Date('2026-10-10T03:15:00Z'), 'America/Manaus'), { weekday: 5, minutes: 23 * 60 + 15 });
  const status = openingStatus(menu.schedule, zonedNow(new Date('2026-10-10T04:30:00Z')));
  assert.equal(statusText(status).text, 'Aberto agora · fecha às 2h', 'sábado 1h30 em São Paulo');
});

test('textos de horário', () => {
  assert.equal(atTime(18 * 60), 'às 18h');
  assert.equal(atTime(60), 'à 1h');
  assert.equal(atTime(720), 'ao meio-dia');
  assert.equal(atTime(1440), 'à meia-noite');
  assert.equal(atTime(23 * 60 + 30), 'às 23h30');
  assert.deepEqual(hoursTable(menu.schedule)[6], { day: 'sábado', text: '11:00 às 14:00 e 18:00 às 02:00' });
  assert.deepEqual(hoursTable(menu.schedule)[1], { day: 'segunda', text: 'Fechado' });
  assert.deepEqual(parseDayHours('18h às 23h30'), { intervals: [{ open: 1080, close: 1410 }] });
});

test('utilitários de busca, cor e dinheiro', () => {
  const acai = menu.categories[3].items[0];
  assert.ok(matchesSearch(acai, 'ACAI'));
  assert.ok(matchesSearch(acai, 'granola'));
  assert.ok(!matchesSearch(acai, 'pizza'));
  assert.equal(readableTextColor('#c2410c'), '#ffffff');
  assert.equal(readableTextColor('#facc15'), '#111111');
  assert.equal(formatMoney(129990), `R$${NBSP}1.299,90`);
});
