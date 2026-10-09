// Cardápio digital: validação do cardapio.json, horários, carrinho e mensagem do pedido.
// Módulo puro (sem DOM). Valores em centavos inteiros.

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';
const DAY_KEYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const DAY_ALIASES = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
export const DAY_LABELS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const NBSP = '\u00a0';

const fold = (text) => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/* ---------- Dinheiro ---------- */

export function formatMoney(cents) {
  const abs = Math.abs(Math.round(cents));
  const reais = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cents < 0 ? '-' : ''}R$${NBSP}${reais},${String(abs % 100).padStart(2, '0')}`;
}

/** Preço do JSON em centavos: aceita 24.9, "24,90", "24.90" ou "R$ 24,90". NaN se inválido. */
export function parsePrice(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return NaN;
    const cents = Math.round(value * 100);
    return Math.abs(value * 100 - cents) < 1e-6 ? cents : NaN;
  }
  if (typeof value !== 'string') return NaN;
  const text = value.replace(/R\$/i, '').replace(/\s/g, '');
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(text);
  if (!match) return NaN;
  return Number(match[1].replace(/\./g, '')) * 100 + Number((match[2] || '0').padEnd(2, '0'));
}

/* ---------- Horários ---------- */

/** "18:00", "18h", "18h30" → minutos desde 0h. "24:00" só vale como fechamento. */
export function parseTime(text) {
  const match = /^(\d{1,2})(?::(\d{2})|h(\d{2})?)?$/i.exec(String(text).trim());
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? match[3] ?? 0);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return NaN;
  return hours * 60 + minutes;
}

/** Horário de um dia: "18:00-23:00", "11:00-14:00, 18:00-02:00" ou "fechado". */
export function parseDayHours(value) {
  if (value === undefined || value === null) return { intervals: [] };
  if (typeof value !== 'string') return { error: 'use um texto, como "18:00-23:00" ou "fechado"' };
  const text = value.trim();
  if (text === '' || /^fechad[oa]$/.test(fold(text))) return { intervals: [] };
  const intervals = [];
  for (const piece of text.split(/[,;]/)) {
    const match = /^(.+?)(?:\s*[-–—]\s*|\s+(?:às|as|a|até)\s+)(.+)$/i.exec(piece.trim());
    const open = match ? parseTime(match[1]) : NaN;
    const close = match ? parseTime(match[2]) : NaN;
    if (Number.isNaN(open) || Number.isNaN(close) || open === 1440) {
      return { error: `não entendi "${piece.trim()}". Use "18:00-23:00", vários horários separados por vírgula ou "fechado"` };
    }
    if (open === close) return { error: `abertura e fechamento iguais em "${piece.trim()}"` };
    intervals.push({ open, close });
  }
  return { intervals };
}

function dayIndex(key) {
  const k = fold(key).replace(/[-\s]?feira$/, '');
  const index = DAY_KEYS.indexOf(k);
  return index !== -1 ? index : DAY_ALIASES[k] ?? -1;
}

/** Dia da semana (0 = domingo) e minutos desde 0h no fuso indicado. */
export function zonedNow(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { weekday, minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

/**
 * Situação agora. schedule: lista de 7 dias (0 = domingo) com { open, close } em minutos;
 * close < open quer dizer que fecha depois da meia-noite.
 */
export function openingStatus(schedule, { weekday, minutes }) {
  const yesterday = schedule[(weekday + 6) % 7];
  for (const interval of yesterday) {
    if (interval.close < interval.open && minutes < interval.close) return { open: true, closesAt: interval.close };
  }
  for (const interval of schedule[weekday]) {
    const overnight = interval.close < interval.open;
    if (minutes >= interval.open && (overnight || minutes < interval.close)) return { open: true, closesAt: interval.close };
  }
  for (let ahead = 0; ahead <= 7; ahead += 1) {
    const day = (weekday + ahead) % 7;
    const opens = schedule[day].map((i) => i.open).filter((open) => ahead > 0 || open > minutes).sort((a, b) => a - b);
    if (opens.length > 0) return { open: false, opensAt: { daysAhead: ahead, weekday: day, minutes: opens[0] } };
  }
  return { open: false, opensAt: null };
}

/** "às 18h", "à 1h", "à meia-noite", "ao meio-dia", "às 23h30". */
export function atTime(minutes) {
  if (minutes === 0 || minutes === 1440) return 'à meia-noite';
  if (minutes === 720) return 'ao meio-dia';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours <= 1 ? 'à' : 'às'} ${hours}h${rest ? String(rest).padStart(2, '0') : ''}`;
}

/** Texto do selo: "Aberto agora · fecha às 23h" ou "Fechado — abre às 18h". */
export function statusText(status) {
  if (status.open) return { label: 'Aberto agora', detail: `fecha ${atTime(status.closesAt)}`, text: `Aberto agora · fecha ${atTime(status.closesAt)}` };
  if (!status.opensAt) return { label: 'Fechado', detail: '', text: 'Fechado' };
  const { daysAhead, weekday, minutes } = status.opensAt;
  let when = atTime(minutes);
  if (daysAhead === 1) when = `amanhã ${when}`;
  else if (daysAhead > 1) when = `${DAY_LABELS[weekday]} ${when}`;
  return { label: 'Fechado', detail: `abre ${when}`, text: `Fechado — abre ${when}` };
}

const hhmm = (minutes) => `${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Lista de horários para exibir: [{ day: 'sexta', text: '18:00 às 02:00' }]. */
export function hoursTable(schedule) {
  return schedule.map((intervals, day) => ({
    day: DAY_LABELS[day],
    text: intervals.length === 0 ? 'Fechado' : intervals.map((i) => `${hhmm(i.open)} às ${hhmm(i.close)}`).join(' e '),
  }));
}

/* ---------- Validação do cardapio.json ---------- */

/** Mensagem amigável para erro de sintaxe no JSON, com linha e coluna quando der. */
export function describeJsonError(text, error) {
  const message = String(error?.message ?? error ?? '');
  let line = null;
  let column = null;
  const lineCol = /line (\d+) column (\d+)/i.exec(message);
  const position = /position (\d+)/i.exec(message);
  if (lineCol) {
    line = Number(lineCol[1]);
    column = Number(lineCol[2]);
  } else if (position) {
    const before = String(text).slice(0, Number(position[1]));
    line = before.split('\n').length;
    column = before.length - before.lastIndexOf('\n');
  }
  const where = line ? ` perto da linha ${line}, coluna ${column}` : '';
  return `O arquivo cardapio.json tem um erro de digitação${where}. Confira vírgulas sobrando no fim de listas, aspas retas (") em volta dos textos e se todas as chaves { } e colchetes [ ] foram fechados.`;
}

const slug = (text) => fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';

/**
 * Confere o cardápio e devolve { ok, errors, menu } com valores normalizados (preços em centavos).
 * As mensagens dizem qual campo está errado e como corrigir.
 */
export function validateMenu(data) {
  const errors = [];
  if (!isPlainObject(data)) {
    return { ok: false, errors: ['O arquivo precisa começar com { e terminar com }, como no exemplo do README.'], menu: null };
  }
  const text = (key) => (typeof data[key] === 'string' ? clean(data[key]) : '');

  const name = text('nome');
  if (!name) errors.push('"nome": informe o nome do negócio, como "Lanchonete Exemplo".');

  const whatsapp = String(data.whatsapp ?? '').replace(/[\s()+.-]/g, '');
  if (!/^55\d{10,11}$/.test(whatsapp)) {
    errors.push('"whatsapp": use o número com 55 + DDD + número, só com dígitos, como "5519900000000".');
  }

  const money = (key, label) => {
    if (data[key] === undefined || data[key] === null || data[key] === '') return 0;
    const cents = parsePrice(data[key]);
    if (Number.isNaN(cents) || cents < 0) {
      errors.push(`"${key}": use um número, como 5.00 (ou 0 para ${label}).`);
      return 0;
    }
    return cents;
  };
  const deliveryFee = money('taxaEntrega', 'entrega grátis');
  const minimumOrder = money('pedidoMinimo', 'não ter pedido mínimo');

  let payments = [];
  if (!Array.isArray(data.pagamentos) || data.pagamentos.length === 0 || !data.pagamentos.every((p) => typeof p === 'string' && clean(p))) {
    errors.push('"pagamentos": liste as formas de pagamento entre colchetes, como ["Pix", "Dinheiro", "Cartão de crédito"].');
  } else {
    payments = data.pagamentos.map(clean);
  }

  let themeColor = '#c2410c';
  if (data.corTema !== undefined) {
    if (typeof data.corTema === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(data.corTema.trim())) {
      const hex = data.corTema.trim().slice(1);
      themeColor = `#${hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex}`.toLowerCase();
    } else {
      errors.push('"corTema": use uma cor no formato "#c2410c".');
    }
  }

  let timeZone = DEFAULT_TIME_ZONE;
  if (data.fusoHorario !== undefined) {
    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: String(data.fusoHorario) });
      timeZone = String(data.fusoHorario);
    } catch {
      errors.push(`"fusoHorario": fuso desconhecido "${data.fusoHorario}". Use, por exemplo, "America/Sao_Paulo" ou "America/Manaus".`);
    }
  }

  const schedule = [[], [], [], [], [], [], []];
  if (!isPlainObject(data.horarios)) {
    errors.push('"horarios": informe os horários de cada dia, como { "segunda": "18:00-23:00", "terca": "fechado" }.');
  } else {
    const seenDays = new Set();
    for (const [key, value] of Object.entries(data.horarios)) {
      const day = dayIndex(key);
      if (day === -1) {
        errors.push(`"horarios": dia desconhecido "${key}". Use domingo, segunda, terca, quarta, quinta, sexta ou sabado.`);
        continue;
      }
      if (seenDays.has(day)) {
        errors.push(`"horarios": ${DAY_LABELS[day]} aparece mais de uma vez ("${key}"). Deixe só uma linha por dia.`);
        continue;
      }
      seenDays.add(day);
      const parsed = parseDayHours(value);
      if (parsed.error) errors.push(`"horarios" → ${key}: ${parsed.error}.`);
      else schedule[day] = parsed.intervals;
    }
  }

  const categories = [];
  const usedIds = new Set();
  if (!Array.isArray(data.categorias) || data.categorias.length === 0) {
    errors.push('"categorias": inclua pelo menos uma categoria com itens.');
  } else {
    data.categorias.forEach((category, ci) => {
      const categoryName = isPlainObject(category) ? clean(category.nome) : '';
      const where = `Categoria ${ci + 1}${categoryName ? ` ("${categoryName}")` : ''}`;
      if (!isPlainObject(category)) {
        errors.push(`${where}: cada categoria precisa ser um objeto com "nome" e "itens".`);
        return;
      }
      if (!clean(category.nome)) errors.push(`${where}: falta o "nome" da categoria.`);
      if (!Array.isArray(category.itens) || category.itens.length === 0) {
        errors.push(`${where}: "itens" precisa ser uma lista com pelo menos um item.`);
        return;
      }
      const items = [];
      category.itens.forEach((item, ii) => {
        const label = isPlainObject(item) && clean(item.nome) ? `Item "${clean(item.nome)}"` : `Item ${ii + 1} da categoria ${ci + 1}${categoryName ? ` ("${categoryName}")` : ''}`;
        if (!isPlainObject(item)) {
          errors.push(`${label}: cada item precisa ser um objeto com "nome" e "preco".`);
          return;
        }
        if (!clean(item.nome)) errors.push(`${label}: falta o "nome".`);
        const price = parsePrice(item.preco);
        if (Number.isNaN(price) || price <= 0) errors.push(`${label}: "preco" precisa ser um número maior que zero, como 24.90.`);
        if (item.disponivel !== undefined && typeof item.disponivel !== 'boolean') {
          errors.push(`${label}: "disponivel" deve ser true ou false (sem aspas).`);
        }
        if (item.imagem !== undefined && typeof item.imagem !== 'string') errors.push(`${label}: "imagem" deve ser um texto, como "img/x-burguer.jpg".`);
        let id = item.id === undefined ? '' : clean(item.id);
        if (item.id !== undefined && !id) errors.push(`${label}: o "id" não pode ficar vazio.`);
        if (id && usedIds.has(id)) errors.push(`${label}: o "id" "${id}" já foi usado em outro item.`);
        if (!id) {
          const base = slug(item.nome);
          id = base;
          for (let n = 2; usedIds.has(id); n += 1) id = `${base}-${n}`;
        }
        usedIds.add(id);

        const addons = [];
        if (item.adicionais !== undefined) {
          if (!Array.isArray(item.adicionais)) errors.push(`${label}: "adicionais" precisa ser uma lista, como [{ "nome": "Bacon", "preco": 4.00 }].`);
          else {
            item.adicionais.forEach((addon, ai) => {
              const addonPrice = isPlainObject(addon) ? parsePrice(addon.preco) : NaN;
              if (!isPlainObject(addon) || !clean(addon.nome)) errors.push(`${label}, adicional ${ai + 1}: falta o "nome".`);
              else if (Number.isNaN(addonPrice) || addonPrice < 0) errors.push(`${label}, adicional "${clean(addon.nome)}": "preco" precisa ser um número, como 4.00.`);
              else addons.push({ name: clean(addon.nome), price: addonPrice });
            });
          }
        }
        items.push({
          id,
          name: clean(item.nome),
          description: typeof item.descricao === 'string' ? clean(item.descricao) : '',
          price,
          image: typeof item.imagem === 'string' ? item.imagem.trim() : '',
          addons,
          available: item.disponivel !== false,
        });
      });
      categories.push({ name: clean(category.nome), items });
    });
  }

  if (errors.length > 0) return { ok: false, errors, menu: null };
  return {
    ok: true,
    errors: [],
    menu: {
      name,
      slogan: text('slogan'),
      whatsapp,
      address: text('endereco'),
      timeZone,
      deliveryFee,
      minimumOrder,
      payments,
      themeColor,
      schedule,
      categories,
    },
  };
}

/* ---------- Carrinho ---------- */

export function findItem(menu, id) {
  for (const category of menu.categories) {
    const item = category.items.find((candidate) => candidate.id === id);
    if (item) return item;
  }
  return null;
}

/** Mesma combinação de item, adicionais e observação vira uma linha só. */
export function lineKey(line) {
  return `${line.itemId}|${[...line.addons].sort().join(',')}|${clean(line.note)}`;
}

/** Remove do carrinho salvo o que não existe mais ou está indisponível. Preços vêm sempre do cardápio. */
export function reconcileCart(menu, saved) {
  if (!Array.isArray(saved)) return [];
  const lines = [];
  for (const raw of saved) {
    if (!isPlainObject(raw)) continue;
    const item = findItem(menu, String(raw.itemId));
    const qty = Math.floor(Number(raw.qty));
    if (!item || !item.available || !(qty >= 1)) continue;
    const addons = Array.isArray(raw.addons) ? raw.addons.filter((name) => item.addons.some((a) => a.name === name)) : [];
    lines.push({ itemId: item.id, qty: Math.min(qty, 99), addons: [...new Set(addons)], note: clean(raw.note).slice(0, 140) });
  }
  return lines;
}

export function addToCart(cart, line) {
  const key = lineKey(line);
  const existing = cart.find((candidate) => lineKey(candidate) === key);
  if (existing) return cart.map((candidate) => (candidate === existing ? { ...candidate, qty: Math.min(99, candidate.qty + line.qty) } : candidate));
  return [...cart, { ...line, note: clean(line.note) }];
}

/** Detalhes e totais. mode: 'entrega' | 'retirada'. O pedido mínimo vale para entrega. */
export function cartSummary(menu, cart, mode = 'entrega') {
  const lines = [];
  for (const line of cart) {
    const item = findItem(menu, line.itemId);
    if (!item) continue;
    const addons = line.addons.map((name) => item.addons.find((a) => a.name === name)).filter(Boolean);
    const unit = item.price + addons.reduce((sum, addon) => sum + addon.price, 0);
    lines.push({ line, item, addons, unit, total: unit * line.qty });
  }
  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  const deliveryFee = mode === 'entrega' && lines.length > 0 ? menu.deliveryFee : 0;
  const missing = mode === 'entrega' ? Math.max(0, menu.minimumOrder - subtotal) : 0;
  return {
    lines,
    count: lines.reduce((sum, l) => sum + l.line.qty, 0),
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    missingForMinimum: missing,
  };
}

export const isCash = (payment) => fold(payment).includes('dinheiro');

/** Lê o "troco para quanto" em centavos; vazio = sem troco (null). */
export function parseChange(text) {
  if (clean(text) === '') return null;
  const value = parsePrice(clean(text));
  return Number.isNaN(value) ? NaN : value;
}

/** Problemas que impedem o envio: [{ field, message }]. */
export function validateOrder(menu, cart, customer) {
  const errors = [];
  const summary = cartSummary(menu, cart, customer.mode);
  if (summary.lines.length === 0) errors.push({ field: 'carrinho', message: 'Seu carrinho está vazio.' });
  if (!clean(customer.name)) errors.push({ field: 'nome', message: 'Informe seu nome.' });
  if (customer.mode === 'entrega' && !clean(customer.address)) errors.push({ field: 'endereco', message: 'Informe o endereço de entrega.' });
  if (!menu.payments.includes(customer.payment)) errors.push({ field: 'pagamento', message: 'Escolha a forma de pagamento.' });
  if (summary.lines.length > 0 && summary.missingForMinimum > 0) {
    errors.push({
      field: 'carrinho',
      message: `O pedido mínimo para entrega é ${formatMoney(menu.minimumOrder)} (faltam ${formatMoney(summary.missingForMinimum)}).`,
    });
  }
  if (isCash(customer.payment)) {
    const change = parseChange(customer.change);
    if (Number.isNaN(change)) errors.push({ field: 'troco', message: 'Valor de troco inválido. Exemplo: 100,00' });
    else if (change !== null && change < summary.total) {
      errors.push({ field: 'troco', message: `O troco precisa ser para um valor maior que o total (${formatMoney(summary.total)}).` });
    }
  }
  return errors;
}

/** Mensagem do pedido para o WhatsApp (com *negrito*). */
export function buildOrderMessage(menu, cart, customer) {
  const summary = cartSummary(menu, cart, customer.mode);
  const out = [`Olá, *${menu.name}*! Quero fazer um pedido:`, ''];
  for (const { line, item, addons, total } of summary.lines) {
    out.push(`*${line.qty}x ${item.name}* — ${formatMoney(total)}`);
    for (const addon of addons) out.push(`   + ${addon.name} (${formatMoney(addon.price)})`);
    if (line.note) out.push(`   Obs.: ${line.note}`);
  }
  out.push('', `Subtotal: ${formatMoney(summary.subtotal)}`);
  if (customer.mode === 'entrega') {
    out.push(`Taxa de entrega: ${summary.deliveryFee > 0 ? formatMoney(summary.deliveryFee) : 'grátis'}`);
  }
  out.push(`*Total: ${formatMoney(summary.total)}*`, '');
  if (customer.mode === 'entrega') {
    out.push(`*Entrega:* ${clean(customer.address)}`);
    if (clean(customer.complement)) out.push(`Complemento: ${clean(customer.complement)}`);
  } else {
    out.push('*Retirada no local*');
  }
  let payment = `*Pagamento:* ${customer.payment}`;
  if (isCash(customer.payment)) {
    const change = parseChange(customer.change);
    payment += change ? ` (troco para ${formatMoney(change)})` : ' (sem troco)';
  }
  out.push(payment, `*Nome:* ${clean(customer.name)}`);
  return out.join('\n').replace(/\u00a0/g, ' '); // espaço comum: a mensagem pode ser copiada para outros sistemas
}

export function whatsappLink(number, message) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Cor de texto (preto ou branco) com mais contraste sobre a cor do tema. */
export function readableTextColor(hex) {
  const channel = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#111111' : '#ffffff';
}

/** Busca sem acento e sem diferenciar maiúsculas. */
export function matchesSearch(item, query) {
  const q = fold(query);
  return !q || fold(`${item.name} ${item.description}`).includes(q);
}
