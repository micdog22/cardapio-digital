import {
  addToCart,
  buildOrderMessage,
  cartSummary,
  describeJsonError,
  formatMoney,
  hoursTable,
  isCash,
  matchesSearch,
  openingStatus,
  readableTextColor,
  reconcileCart,
  statusText,
  validateMenu,
  validateOrder,
  whatsappLink,
  zonedNow,
} from './cardapio.js';

const STORAGE_KEY = `cardapio-digital:${location.pathname}`;
const FIELD_IDS = { nome: 'cliente-nome', endereco: 'cliente-endereco', pagamento: 'cliente-pagamento', troco: 'cliente-troco' };
const $ = (id) => document.getElementById(id);

let menu = null;
let cart = [];
let dialogItem = null;
let dialogQty = 1;
let toastTimer = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function toast(message) {
  const box = $('toast');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.hidden = true;
  }, 2500);
}

/* ---------- Carregamento ---------- */

function showError(summary, problems) {
  $('carregando').hidden = true;
  $('erro').hidden = false;
  $('erro-resumo').textContent = summary;
  $('erro-lista').replaceChildren(...problems.map((problem) => el('li', '', problem)));
}

async function load() {
  let text;
  try {
    const response = await fetch('./cardapio.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(String(response.status));
    text = await response.text();
  } catch {
    showError('Não consegui baixar o arquivo cardapio.json. Confira se ele está na mesma pasta do index.html.', []);
    return;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    showError(describeJsonError(text, error), []);
    return;
  }
  const result = validateMenu(data);
  if (!result.ok) {
    const count = result.errors.length;
    showError(count === 1 ? 'Encontrei 1 problema no cardapio.json:' : `Encontrei ${count} problemas no cardapio.json:`, result.errors);
    return;
  }
  menu = result.menu;
  applyTheme();
  renderHeader();
  renderMenu();
  restoreState();
  renderCart();
  updateStatus();
  setInterval(updateStatus, 60_000);
}

function applyTheme() {
  const root = document.documentElement.style;
  root.setProperty('--brand', menu.themeColor);
  root.setProperty('--brand-text', readableTextColor(menu.themeColor));
  document.querySelector('meta[name="theme-color"]').setAttribute('content', menu.themeColor);
  document.title = `${menu.name} — cardápio e pedidos pelo WhatsApp`;
}

function renderHeader() {
  $('nome-negocio').textContent = menu.name;
  $('slogan').textContent = menu.slogan;
  const info = [];
  if (menu.address) info.push(`Endereço: ${menu.address}`);
  info.push(menu.deliveryFee > 0 ? `Entrega: ${formatMoney(menu.deliveryFee)}` : 'Entrega grátis');
  if (menu.minimumOrder > 0) info.push(`Pedido mínimo para entrega: ${formatMoney(menu.minimumOrder)}`);
  $('info').replaceChildren(...info.map((line) => el('li', '', line)));
  $('horarios').replaceChildren(...hoursTable(menu.schedule).map((row) => {
    const tr = el('tr');
    tr.append(el('td', '', row.day), el('td', '', row.text));
    return tr;
  }));
  $('horarios-box').hidden = false;
  $('cliente-pagamento').replaceChildren(
    el('option', '', 'Escolha…'),
    ...menu.payments.map((payment) => el('option', '', payment)),
  );
  $('cliente-pagamento').options[0].value = '';
  $('retirada-info').textContent = menu.address ? `Retire o pedido em: ${menu.address}.` : 'Combine a retirada pelo WhatsApp.';
}

function updateStatus() {
  const now = zonedNow(new Date(), menu.timeZone);
  const status = openingStatus(menu.schedule, now);
  const text = statusText(status);
  const badge = $('status');
  badge.textContent = text.text;
  badge.className = `status-badge ${status.open ? 'is-open' : 'is-closed'}`;
  badge.hidden = false;
  [...$('horarios').children].forEach((row, day) => row.classList.toggle('today', day === now.weekday));
  const notice = $('aviso-fechado');
  notice.hidden = status.open;
  notice.textContent = status.open
    ? ''
    : `Estamos fechados agora${text.detail ? ` (${text.detail})` : ''}. Você pode enviar o pedido mesmo assim: ele será respondido quando abrirmos.`;
}

/* ---------- Cardápio ---------- */

function itemCard(item) {
  const card = el('article', `item-card${item.available ? '' : ' unavailable'}`);
  card.dataset.itemId = item.id;
  const info = el('div', 'item-info');
  info.append(el('h3', '', item.name));
  if (item.description) info.append(el('p', 'item-desc', item.description));
  const bottom = el('div', 'item-bottom');
  const left = el('div');
  left.append(el('span', 'price', formatMoney(item.price)));
  if (!item.available) left.append(document.createTextNode(' '), el('span', 'tag', 'Indisponível'));
  const button = el('button', 'add-btn', item.available ? 'Adicionar' : 'Esgotado');
  button.type = 'button';
  button.disabled = !item.available;
  button.setAttribute('aria-label', item.available ? `Adicionar ${item.name}` : `${item.name} está indisponível`);
  bottom.append(left, button);
  info.append(bottom);
  card.append(info);
  if (item.image) {
    const img = el('img', 'item-thumb');
    img.src = item.image;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => img.remove());
    card.append(img);
  }
  if (item.available) card.addEventListener('click', () => openItem(item));
  return card;
}

function renderMenu() {
  const nav = $('categorias-nav');
  const sections = $('secoes');
  menu.categories.forEach((category, index) => {
    const id = `categoria-${index + 1}`;
    const link = el('a', '', category.name);
    link.href = `#${id}`;
    const li = el('li');
    li.append(link);
    nav.append(li);
    const section = el('section', 'category');
    section.id = id;
    section.append(el('h2', '', category.name));
    const list = el('ul', 'items');
    for (const item of category.items) {
      const entry = el('li');
      entry.append(itemCard(item));
      list.append(entry);
    }
    section.append(list);
    sections.append(section);
  });
  $('carregando').hidden = true;
  $('cardapio').hidden = false;
}

$('busca').addEventListener('input', (event) => {
  const query = event.target.value;
  let visible = 0;
  for (const section of $('secoes').children) {
    let inSection = 0;
    for (const entry of section.querySelectorAll('.items > li')) {
      const item = menu.categories.flatMap((c) => c.items).find((i) => i.id === entry.firstElementChild.dataset.itemId);
      const show = matchesSearch(item, query);
      entry.hidden = !show;
      if (show) inSection += 1;
    }
    section.hidden = inSection === 0;
    visible += inSection;
  }
  const empty = $('sem-resultados');
  empty.hidden = visible > 0;
  empty.textContent = visible > 0 ? '' : `Nenhum item encontrado para “${query.trim()}”.`;
});

/* ---------- Diálogo do item ---------- */

function selectedAddons() {
  return [...$('item-adicionais-lista').querySelectorAll('input:checked')].map((input) => input.value);
}

function updateDialogTotal() {
  const addons = selectedAddons().map((name) => dialogItem.addons.find((a) => a.name === name));
  const unit = dialogItem.price + addons.reduce((sum, a) => sum + a.price, 0);
  $('item-qtd').textContent = String(dialogQty);
  $('qtd-menos').disabled = dialogQty <= 1;
  $('item-adicionar').textContent = `Adicionar · ${formatMoney(unit * dialogQty)}`;
}

function openItem(item) {
  dialogItem = item;
  dialogQty = 1;
  $('item-titulo').textContent = item.name;
  $('item-descricao').textContent = item.description;
  $('item-preco').textContent = formatMoney(item.price);
  const image = $('item-imagem');
  image.hidden = !item.image;
  if (item.image) image.src = item.image;
  else image.removeAttribute('src');
  const list = $('item-adicionais-lista');
  list.replaceChildren(...item.addons.map((addon) => {
    const label = el('label');
    const input = el('input');
    input.type = 'checkbox';
    input.value = addon.name;
    label.append(input, document.createTextNode(addon.name), el('span', 'addon-price', `+ ${formatMoney(addon.price)}`));
    return label;
  }));
  $('item-adicionais').hidden = item.addons.length === 0;
  $('item-obs').value = '';
  updateDialogTotal();
  $('item-dialog').showModal();
}

$('item-imagem').addEventListener('error', (event) => {
  event.target.hidden = true;
});
$('item-adicionais-lista').addEventListener('change', updateDialogTotal);
$('qtd-menos').addEventListener('click', () => {
  dialogQty = Math.max(1, dialogQty - 1);
  updateDialogTotal();
});
$('qtd-mais').addEventListener('click', () => {
  dialogQty = Math.min(99, dialogQty + 1);
  updateDialogTotal();
});
$('item-form').addEventListener('submit', (event) => {
  event.preventDefault();
  cart = addToCart(cart, { itemId: dialogItem.id, qty: dialogQty, addons: selectedAddons(), note: $('item-obs').value });
  $('item-dialog').close();
  $('enviado').hidden = true;
  renderCart();
  toast(`${dialogQty}x ${dialogItem.name} no carrinho.`);
});

/* ---------- Carrinho ---------- */

function readCustomer() {
  return {
    name: $('cliente-nome').value,
    mode: document.querySelector('input[name="modo"]:checked').value,
    address: $('cliente-endereco').value,
    complement: $('cliente-complemento').value,
    payment: $('cliente-pagamento').value,
    change: $('cliente-troco').value,
  };
}

function saveState() {
  try {
    const { name, mode, address, complement, payment } = readCustomer();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart, customer: { name, mode, address, complement, payment } }));
  } catch {
    // Sem armazenamento local: o carrinho só não fica salvo.
  }
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return;
    cart = reconcileCart(menu, saved.cart);
    const c = saved.customer || {};
    if (typeof c.name === 'string') $('cliente-nome').value = c.name;
    if (typeof c.address === 'string') $('cliente-endereco').value = c.address;
    if (typeof c.complement === 'string') $('cliente-complemento').value = c.complement;
    if (menu.payments.includes(c.payment)) $('cliente-pagamento').value = c.payment;
    if (c.mode === 'retirada') document.querySelector('input[name="modo"][value="retirada"]').checked = true;
  } catch {
    // Dados salvos ilegíveis: começa com o carrinho vazio.
  }
}

function changeQty(index, delta) {
  cart = cart.map((line, i) => (i === index ? { ...line, qty: Math.min(99, line.qty + delta) } : line)).filter((line) => line.qty > 0);
  renderCart();
}

function renderCart() {
  $('enviado').hidden = true;
  const customer = readCustomer();
  const summary = cartSummary(menu, cart, customer.mode);
  const list = $('linhas');
  list.replaceChildren(...summary.lines.map(({ line, item, addons, total }, index) => {
    const li = el('li');
    const top = el('div', 'line-top');
    top.append(el('span', '', `${line.qty}x ${item.name}`), el('span', '', formatMoney(total)));
    li.append(top);
    if (addons.length > 0) li.append(el('p', 'line-extra', `+ ${addons.map((a) => a.name).join(', ')}`));
    if (line.note) li.append(el('p', 'line-extra', `Obs.: ${line.note}`));
    const actions = el('div', 'line-actions');
    const stepper = el('div', 'stepper');
    stepper.setAttribute('role', 'group');
    stepper.setAttribute('aria-label', `Quantidade de ${item.name}`);
    const minus = el('button', '', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', `Diminuir ${item.name}`);
    minus.addEventListener('click', () => changeQty(index, -1));
    const plus = el('button', '', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', `Aumentar ${item.name}`);
    plus.addEventListener('click', () => changeQty(index, 1));
    stepper.append(minus, el('output', '', String(line.qty)), plus);
    const remove = el('button', 'link-btn', 'Remover');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remover ${item.name}`);
    remove.addEventListener('click', () => changeQty(index, -line.qty));
    actions.append(stepper, remove);
    li.append(actions);
    return li;
  }));
  $('carrinho-vazio').hidden = summary.lines.length > 0;

  const delivery = customer.mode === 'entrega';
  $('campos-entrega').hidden = !delivery;
  $('retirada-info').hidden = delivery;
  $('campo-troco').hidden = !isCash(customer.payment);
  $('linha-entrega').hidden = !delivery;
  $('total-subtotal').textContent = formatMoney(summary.subtotal);
  $('total-entrega').textContent = menu.deliveryFee > 0 ? formatMoney(menu.deliveryFee) : 'grátis';
  $('total-geral').textContent = formatMoney(summary.total);
  const minimum = $('minimo-info');
  minimum.hidden = !(delivery && summary.lines.length > 0 && summary.missingForMinimum > 0);
  minimum.textContent = minimum.hidden
    ? ''
    : `Faltam ${formatMoney(summary.missingForMinimum)} para o pedido mínimo de entrega (${formatMoney(menu.minimumOrder)}).`;

  const fab = $('abrir-carrinho');
  fab.hidden = summary.count === 0;
  $('fab-resumo').textContent = `${summary.count} ${summary.count === 1 ? 'item' : 'itens'} · ${formatMoney(summary.subtotal)}`;
  saveState();
}

$('pedido-form').addEventListener('input', () => {
  $('pedido-erros').replaceChildren();
  renderCart();
});
$('pedido-form').addEventListener('change', renderCart);

$('pedido-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const customer = readCustomer();
  const errors = validateOrder(menu, cart, customer);
  for (const id of Object.values(FIELD_IDS)) $(id).removeAttribute('aria-invalid');
  if (errors.length > 0) {
    const list = el('ul');
    list.append(...errors.map((error) => el('li', '', error.message)));
    $('pedido-erros').replaceChildren(list);
    for (const error of errors) if (FIELD_IDS[error.field]) $(FIELD_IDS[error.field]).setAttribute('aria-invalid', 'true');
    const first = errors.find((error) => FIELD_IDS[error.field]);
    if (first) $(FIELD_IDS[first.field]).focus();
    return;
  }
  $('pedido-erros').replaceChildren();
  const url = whatsappLink(menu.whatsapp, buildOrderMessage(menu, cart, customer));
  const opened = window.open(url, '_blank');
  if (opened) opened.opener = null;
  else window.location.href = url;
  const sent = $('enviado');
  sent.hidden = false;
  sent.textContent = 'Pronto! O WhatsApp foi aberto com o seu pedido. Confira a mensagem e toque em enviar.';
});

$('limpar').addEventListener('click', () => {
  cart = [];
  $('enviado').hidden = true;
  $('pedido-erros').replaceChildren();
  renderCart();
  toast('Carrinho limpo.');
});

$('abrir-carrinho').addEventListener('click', () => {
  $('enviado').hidden = true;
  updateStatus();
  $('carrinho').showModal();
});

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close(); // clique fora do conteúdo
  });
}
for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => button.closest('dialog').close());
}

load();
