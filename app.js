'use strict';

const STORAGE_KEY = 'famille-taghlet-v1';
const LEGACY_STORAGE_KEY = 'budget-ammouna-v1';
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const CATEGORIES = [
  'Logement',
  'Alimentation',
  'Transport',
  'Santé',
  'Loisirs',
  'Abonnements',
  'Assurance',
  'Crédit',
  'Éducation',
  'Enfants',
  'Animaux',
  'Autre'
];
const CURRENCIES = {
  TND: { symbol: 'DT', digits: 3 },
  EUR: { symbol: '€', digits: 2 },
  MAD: { symbol: 'DH', digits: 2 },
  USD: { symbol: '$', digits: 2 },
  CHF: { symbol: 'CHF', digits: 2 },
  GBP: { symbol: '£', digits: 2 }
};
const ICONS = {
  edit: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
  trash: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>'
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const pad = value => String(value).padStart(2, '0');

const today = new Date();
let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
let state = loadState();
const editing = { income: null, fixed: null, variable: null };

function defaultState() {
  return { settings: { currency: 'TND' }, months: {} };
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function parseAmount(value) {
  const cleaned = String(value === null || value === undefined ? '' : value)
    .replace(/\s/g, '')
    .replace(',', '.');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : NaN;
}

function normalizeEntries(list, withCategory, withDate) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const entry = {
        id: item.id ? String(item.id) : newId(),
        label: String(item.label || '').slice(0, 80),
        amount: Math.max(0, parseAmount(item.amount) || 0)
      };
      if (withCategory) entry.category = item.category ? String(item.category) : 'Autre';
      if (withDate) {
        const date = String(item.date || '');
        entry.date = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
      }
      return entry;
    });
}

function normalizeState(raw) {
  const clean = defaultState();
  if (!raw || typeof raw !== 'object') return clean;

  if (raw.settings && typeof raw.settings.currency === 'string') {
    clean.settings.currency = raw.settings.currency;
  }

  if (raw.months && typeof raw.months === 'object') {
    for (const [key, value] of Object.entries(raw.months)) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key) || !value || typeof value !== 'object') continue;
      clean.months[key] = {
        income: normalizeEntries(value.income, false, false),
        fixed: normalizeEntries(value.fixed, true, false),
        variable: normalizeEntries(value.variable, true, true)
      };
    }
  }

  return clean;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : defaultState();
  } catch (error) {
    return defaultState();
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    toast('Sauvegarde impossible dans ce navigateur.', 'error');
  }
}

const sum = items => items.reduce((total, item) => total + (Number(item.amount) || 0), 0);
const keyFor = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const currentKey = () => keyFor(cursor);

function readMonth(key) {
  return state.months[key] || { income: [], fixed: [], variable: [] };
}

function getMonth(key) {
  if (!state.months[key]) {
    state.months[key] = { income: [], fixed: [], variable: [] };
  }
  return state.months[key];
}

function fmt(value) {
  const meta = CURRENCIES[state.settings.currency] || CURRENCIES.TND;
  const number = Number(value) || 0;
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: meta.digits
  }).format(number);
  return formatted + '\u202f' + meta.symbol;
}

function plural(count, singular, pluralForm) {
  return count + ' ' + (count > 1 ? pluralForm || singular + 's' : singular);
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

function isoDefault() {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  if (year === today.getFullYear() && month === today.getMonth()) {
    return `${year}-${pad(month + 1)}-${pad(today.getDate())}`;
  }
  return `${year}-${pad(month + 1)}-01`;
}

function hueFor(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 360;
  }
  return hash;
}

function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return iso || '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function cumulThrough(year, monthIndex) {
  let total = 0;
  for (let index = 0; index <= monthIndex; index += 1) {
    const data = state.months[`${year}-${pad(index + 1)}`];
    if (!data) continue;
    total += sum(data.income) - sum(data.fixed) - sum(data.variable);
  }
  return total;
}

function globalCumul() {
  return Object.keys(state.months).sort().reduce((total, key) => {
    const data = state.months[key];
    return total + sum(data.income) - sum(data.fixed) - sum(data.variable);
  }, 0);
}

/* ---------- Rendu ---------- */

function renderAll() {
  renderHeader();
  renderKpis();
  renderOverview();
  renderIncome();
  renderFixed();
  renderVariable();
  renderCopyHint();
  renderCumulative();
}

function renderHeader() {
  $('#month-label').textContent = monthLabel(currentKey());
  document.title = `FAMILLE TAGHLET — ${monthLabel(currentKey())}`;
}

function renderKpis() {
  const data = readMonth(currentKey());
  const income = sum(data.income);
  const fixed = sum(data.fixed);
  const variable = sum(data.variable);
  const balance = income - fixed - variable;

  $('#kpi-income').textContent = fmt(income);
  $('#kpi-fixed').textContent = fmt(fixed);
  $('#kpi-variable').textContent = fmt(variable);

  const balanceElement = $('#kpi-balance');
  balanceElement.textContent = fmt(balance);
  balanceElement.classList.toggle('negative', balance < 0);

  $('#kpi-income-sub').textContent = data.income.length === 0 ? 'Aucune source' : plural(data.income.length, 'source');
  $('#kpi-fixed-sub').textContent = data.fixed.length === 0 ? 'Aucune charge fixe' : plural(data.fixed.length, 'charge fixe', 'charges fixes');
  $('#kpi-variable-sub').textContent = data.variable.length === 0 ? 'Aucune charge variable' : plural(data.variable.length, 'charge variable', 'charges variables');
  $('#kpi-balance-sub').textContent = 'Cumul depuis janvier : ' + fmt(cumulThrough(cursor.getFullYear(), cursor.getMonth()));
}

function renderOverview() {
  const data = readMonth(currentKey());
  const income = sum(data.income);
  const fixed = sum(data.fixed);
  const variable = sum(data.variable);
  const charges = fixed + variable;
  const rest = income - charges;

  const base = Math.max(income, charges, 1);
  const fixedDeg = (fixed / base) * 360;
  const variableDeg = (variable / base) * 360;

  const donut = $('#donut');
  if (income === 0 && charges === 0) {
    donut.style.background = 'conic-gradient(#fee2e2, #fee2e2)';
  } else {
    const variableEnd = fixedDeg + variableDeg;
    donut.style.background = 'conic-gradient(from -90deg, ' +
      'var(--fixed) 0deg, var(--fixed) ' + fixedDeg + 'deg, ' +
      'var(--variable) ' + fixedDeg + 'deg, var(--variable) ' + variableEnd + 'deg, ' +
      'var(--rest) ' + variableEnd + 'deg, var(--rest) 360deg)';
  }

  let percent = 0;
  if (income > 0) {
    percent = (charges / income) * 100;
  } else if (charges > 0) {
    percent = 100;
  }

  $('#donut-pct').textContent = income > 0 ? Math.round(percent) + ' %' : (charges > 0 ? '—' : '0 %');
  $('#progress-pct').textContent = income > 0 ? Math.round(percent) + ' %' : '—';

  const fill = $('#progress-fill');
  fill.style.width = Math.max(0, Math.min(100, percent)) + '%';
  fill.classList.remove('warn', 'over');
  if (income > 0 && percent > 100) {
    fill.classList.add('over');
  } else if (percent > 80) {
    fill.classList.add('warn');
  }

  $('#legend-fixed').textContent = fmt(fixed);
  $('#legend-variable').textContent = fmt(variable);
  const restElement = $('#legend-rest');
  restElement.textContent = fmt(rest);
  restElement.classList.toggle('neg', rest < 0);

  $('#total-charges').textContent = fmt(charges);
  $('#mini-cumul').textContent = fmt(cumulThrough(cursor.getFullYear(), cursor.getMonth()));

  const hint = $('#budget-hint');
  if (income <= 0 && charges <= 0) {
    hint.textContent = 'Renseignez vos revenus et vos charges pour activer le suivi du budget.';
  } else if (income <= 0) {
    hint.textContent = 'Ajoutez au moins un revenu pour calculer votre budget.';
  } else if (rest < 0) {
    hint.textContent = 'Attention : vos charges dépassent vos revenus de ' + fmt(-rest) + '.';
  } else {
    hint.textContent = 'Il vous reste ' + fmt(rest) + ' après avoir payé vos charges.';
  }
}

function buildEntryRow(type, item, showDate) {
  const row = document.createElement('div');
  row.className = 'entry';
  row.dataset.id = item.id;

  const main = document.createElement('div');
  main.className = 'entry-main';

  const label = document.createElement('span');
  label.className = 'entry-label';
  label.textContent = item.label || 'Sans libellé';
  main.appendChild(label);

  if (item.category) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = item.category;
    chip.style.setProperty('--h', hueFor(item.category));
    main.appendChild(chip);
  }

  if (showDate && item.date) {
    const date = document.createElement('span');
    date.className = 'entry-date';
    date.textContent = formatDate(item.date);
    main.appendChild(date);
  }

  const side = document.createElement('div');
  side.className = 'entry-side';

  const amount = document.createElement('span');
  amount.className = 'entry-amount ' + (type === 'income' ? 'income' : 'expense');
  amount.textContent = (type === 'income' ? '+ ' : '− ') + fmt(item.amount);
  side.appendChild(amount);

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'icon-btn';
  editButton.dataset.action = 'edit';
  editButton.setAttribute('aria-label', 'Modifier ' + (item.label || 'l’élément'));
  editButton.title = 'Modifier';
  editButton.innerHTML = ICONS.edit;
  side.appendChild(editButton);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'icon-btn danger';
  deleteButton.dataset.action = 'delete';
  deleteButton.setAttribute('aria-label', 'Supprimer ' + (item.label || 'l’élément'));
  deleteButton.title = 'Supprimer';
  deleteButton.innerHTML = ICONS.trash;
  side.appendChild(deleteButton);

  row.append(main, side);
  return row;
}

function renderEntryList(type, items, showDate) {
  const list = $(`#${type}-list`);
  list.textContent = '';
  items.forEach(item => list.appendChild(buildEntryRow(type, item, showDate)));
  $(`#${type}-empty`).classList.toggle('hidden', items.length > 0);
}

function renderIncome() {
  const data = readMonth(currentKey());
  renderEntryList('income', data.income, false);
  $('#income-total').textContent = fmt(sum(data.income));
}

function renderFixed() {
  const data = readMonth(currentKey());
  renderEntryList('fixed', data.fixed, false);
  $('#fixed-total').textContent = fmt(sum(data.fixed));
}

function renderVariable() {
  const data = readMonth(currentKey());
  renderEntryList('variable', data.variable, true);
  $('#variable-total').textContent = fmt(sum(data.variable));
}

function previousFixedSource() {
  const current = readMonth(currentKey());
  if (current.fixed.length > 0) return null;
  const previousKey = keyFor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const previous = state.months[previousKey];
  if (!previous || previous.fixed.length === 0) return null;
  return { key: previousKey, items: previous.fixed };
}

function renderCopyHint() {
  const box = $('#fixed-copy');
  const source = previousFixedSource();
  if (!source) {
    box.classList.add('hidden');
    return;
  }
  $('#fixed-copy-text').textContent = 'Charges fixes de ' + monthLabel(source.key) + ' disponibles (' + source.items.length + ').';
  box.classList.remove('hidden');
}

function renderCumulative() {
  const year = cursor.getFullYear();
  const body = $('#cumul-body');
  body.textContent = '';

  let cumulative = 0;
  let totalIncome = 0;
  let totalFixed = 0;
  let totalVariable = 0;

  for (let index = 0; index < 12; index += 1) {
    const key = `${year}-${pad(index + 1)}`;
    const data = state.months[key];
    const income = data ? sum(data.income) : 0;
    const fixed = data ? sum(data.fixed) : 0;
    const variable = data ? sum(data.variable) : 0;
    const charges = fixed + variable;
    const balance = income - charges;

    cumulative += balance;
    totalIncome += income;
    totalFixed += fixed;
    totalVariable += variable;

    const row = document.createElement('tr');
    row.dataset.month = key;
    row.tabIndex = 0;
    row.title = 'Afficher ' + MONTHS[index] + ' ' + year;
    row.setAttribute('aria-label', 'Afficher ' + MONTHS[index] + ' ' + year);
    if (!data) row.classList.add('is-empty');
    if (key === currentKey()) row.classList.add('is-active');

    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.textContent = MONTHS[index];
    row.appendChild(heading);

    const cells = data
      ? [fmt(income), fmt(fixed), fmt(variable), fmt(charges), fmt(balance), fmt(cumulative)]
      : ['—', '—', '—', '—', '—', fmt(cumulative)];

    cells.forEach((text, cellIndex) => {
      const cell = document.createElement('td');
      cell.textContent = text;
      if (data && cellIndex === 4) {
        if (balance < 0) cell.classList.add('neg');
        else if (balance > 0) cell.classList.add('pos');
      }
      if (data && cellIndex === 5 && cumulative < 0) cell.classList.add('neg');
      row.appendChild(cell);
    });

    body.appendChild(row);
  }

  $('#cumul-year').textContent = year;
  $('#year-income').textContent = fmt(totalIncome);
  $('#year-fixed').textContent = fmt(totalFixed);
  $('#year-variable').textContent = fmt(totalVariable);
  $('#year-charges').textContent = fmt(totalFixed + totalVariable);

  const yearBalance = totalIncome - totalFixed - totalVariable;
  const soldeCell = $('#year-solde');
  soldeCell.textContent = fmt(yearBalance);
  soldeCell.classList.toggle('neg', yearBalance < 0);
  soldeCell.classList.toggle('pos', yearBalance > 0);

  const cumulCell = $('#year-cumul');
  cumulCell.textContent = fmt(cumulative);
  cumulCell.classList.toggle('neg', cumulative < 0);

  $('#global-cumul').textContent = fmt(globalCumul());
}

/* ---------- Actions ---------- */

function syncCurrencySelect() {
  const select = $('#currency');
  if (!CURRENCIES[state.settings.currency]) {
    state.settings.currency = 'TND';
  }
  select.value = state.settings.currency;
}

function setCategory(select, value) {
  if (value && !Array.from(select.options).some(option => option.value === value)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  select.value = value || '';
}

function resetForm(type) {
  const form = $(`#${type}-form`);
  if (form) form.reset();
  editing[type] = null;
  const submit = $(`#${type}-submit`);
  if (submit) submit.textContent = 'Ajouter';
  const cancel = document.querySelector(`[data-cancel="${type}"]`);
  if (cancel) cancel.classList.add('hidden');
  if (type === 'variable') $('#variable-date').value = isoDefault();
}

function resetAllForms() {
  ['income', 'fixed', 'variable'].forEach(resetForm);
}

function cancelEdit(type) {
  if (!editing[type]) return;
  resetForm(type);
}

function startEdit(type, id) {
  const data = readMonth(currentKey());
  const item = data[type].find(entry => entry.id === id);
  if (!item) return;

  editing[type] = id;
  $(`#${type}-label`).value = item.label;
  $(`#${type}-amount`).value = item.amount;
  if (type !== 'income') setCategory($(`#${type}-category`), item.category || 'Autre');
  if (type === 'variable') $('#variable-date').value = item.date || isoDefault();
  $(`#${type}-submit`).textContent = 'Enregistrer';
  $(`[data-cancel="${type}"]`).classList.remove('hidden');

  const form = $(`#${type}-form`);
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $(`#${type}-label`).focus({ preventScroll: true });
}

function handleSubmit(type, event) {
  event.preventDefault();

  const labelInput = $(`#${type}-label`);
  const amountInput = $(`#${type}-amount`);
  const label = labelInput.value.trim();
  const amount = Math.round(parseAmount(amountInput.value) * 1000) / 1000;

  if (!label) {
    toast('Ajoutez un libellé.', 'error');
    labelInput.focus();
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    toast('Saisissez un montant supérieur à zéro.', 'error');
    amountInput.focus();
    return;
  }

  const payload = { label, amount };

  if (type !== 'income') {
    const category = $(`#${type}-category`).value;
    if (!category) {
      toast('Choisissez une catégorie.', 'error');
      $(`#${type}-category`).focus();
      return;
    }
    payload.category = category;
  }

  if (type === 'variable') {
    payload.date = $('#variable-date').value || isoDefault();
  }

  const data = getMonth(currentKey());

  if (editing[type]) {
    const item = data[type].find(entry => entry.id === editing[type]);
    if (item) Object.assign(item, payload);
    toast('Modification enregistrée.');
  } else {
    data[type].push(Object.assign({ id: newId() }, payload));
    toast(type === 'income' ? 'Revenu ajouté.' : 'Charge ajoutée.');
  }

  save();
  resetForm(type);
  renderAll();
}

function removeEntry(type, id) {
  const data = state.months[currentKey()];
  if (!data) return;
  const item = data[type].find(entry => entry.id === id);
  if (!item) return;
  if (!confirm('Supprimer « ' + (item.label || 'cet élément') + ' » ?')) return;

  data[type] = data[type].filter(entry => entry.id !== id);
  if (editing[type] === id) resetForm(type);
  save();
  renderAll();
  toast('Élément supprimé.');
}

function copyPreviousFixed() {
  const source = previousFixedSource();
  if (!source) return;
  const data = getMonth(currentKey());
  source.items.forEach(item => {
    data.fixed.push({
      id: newId(),
      label: item.label,
      amount: item.amount,
      category: item.category || 'Autre'
    });
  });
  save();
  renderAll();
  toast('Charges fixes reprises depuis ' + monthLabel(source.key) + '.');
}

function shiftMonth(offset) {
  cursor = new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1);
  resetAllForms();
  renderAll();
}

function navigateFromCumulative(event) {
  const row = event.target.closest('tr[data-month]');
  if (!row) return;
  const parts = row.dataset.month.split('-').map(Number);
  cursor = new Date(parts[0], parts[1] - 1, 1);
  resetAllForms();
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'famille-taghlet-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast('Sauvegarde exportée.');
}

async function importData(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !parsed.months || typeof parsed.months !== 'object') {
      throw new Error('Format inattendu');
    }
    if (!confirm('Remplacer les données actuelles par ce fichier ?')) {
      input.value = '';
      return;
    }
    state = normalizeState(parsed);
    save();
    syncCurrencySelect();
    resetAllForms();
    renderAll();
    toast('Données importées.');
  } catch (error) {
    toast('Import impossible : fichier invalide.', 'error');
  } finally {
    input.value = '';
  }
}

function resetData() {
  if (!confirm('Effacer toutes les données enregistrées ? Cette action est définitive.')) return;
  const currency = state.settings.currency;
  state = defaultState();
  state.settings.currency = currency;
  save();
  resetAllForms();
  renderAll();
  toast('Toutes les données ont été effacées.');
}

let toastTimer = null;

function toast(message, kind) {
  const element = $('#toast');
  if (!element) return;
  const suffix = kind === 'error' ? ' error' : '';
  element.textContent = message;
  element.className = 'toast show' + suffix;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.className = 'toast' + suffix;
  }, 2800);
}

/* ---------- Initialisation ---------- */

function attachEvents() {
  $('#prev-month').addEventListener('click', () => shiftMonth(-1));
  $('#next-month').addEventListener('click', () => shiftMonth(1));
  $('#month-label').addEventListener('click', () => {
    cursor = new Date(today.getFullYear(), today.getMonth(), 1);
    resetAllForms();
    renderAll();
  });

  ['income', 'fixed', 'variable'].forEach(type => {
    $(`#${type}-form`).addEventListener('submit', event => handleSubmit(type, event));

    const cancel = document.querySelector(`[data-cancel="${type}"]`);
    if (cancel) cancel.addEventListener('click', () => cancelEdit(type));

    $(`#${type}-list`).addEventListener('click', event => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const row = button.closest('.entry');
      if (!row) return;
      if (button.dataset.action === 'edit') startEdit(type, row.dataset.id);
      if (button.dataset.action === 'delete') removeEntry(type, row.dataset.id);
    });
  });

  $('#fixed-copy-btn').addEventListener('click', copyPreviousFixed);

  $('#currency').addEventListener('change', event => {
    state.settings.currency = event.target.value;
    save();
    renderAll();
    toast('Devise mise à jour.');
  });

  $('#btn-export').addEventListener('click', exportData);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', importData);
  $('#reset-data').addEventListener('click', resetData);

  $('#cumul-body').addEventListener('click', navigateFromCumulative);
  $('#cumul-body').addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigateFromCumulative(event);
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      ['income', 'fixed', 'variable'].forEach(cancelEdit);
    }
  });
}

function init() {
  $$('select[data-categories]').forEach(select => {
    CATEGORIES.forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      select.appendChild(option);
    });
  });

  syncCurrencySelect();
  attachEvents();
  resetAllForms();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
