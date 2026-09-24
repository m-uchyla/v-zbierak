const { UNITS, TIERS, DEFAULT_DURATION_FACTOR, calculatePlan } = globalThis.VZbierakCalculator;

const STORAGE_KEY = 'v-zbierak-v2';
const LEGACY_STORAGE_KEY = 'v-zbierak-233-v1';
const numberFormat = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });

function defaultWorld() {
  return {
    name: 'Świat 233',
    speed: '1.25',
    durationFactor: DEFAULT_DURATION_FACTOR.toFixed(6),
    initialSeconds: '1800',
    exponent: '0.45',
    carryFactor: '1',
    availableUnits: Object.fromEntries(UNITS.map(unit => [unit.id, true])),
    lootFactors: Object.fromEntries(TIERS.map(tier => [tier.id, String(tier.lootFactor)])),
  };
}

function defaultState() {
  return {
    counts: Object.fromEntries(UNITS.map(unit => [unit.id, ''])),
    selectedUnits: Object.fromEntries(UNITS.map(unit => [unit.id, true])),
    tiers: TIERS.map(tier => ({ id: tier.id, active: true })),
    world: defaultWorld(),
  };
}

function copyString(target, source, key, maxLength = 24) {
  if (typeof source?.[key] === 'string' && source[key].length <= maxLength) target[key] = source[key];
}

function loadState() {
  const state = defaultState();
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    const saved = JSON.parse(current || localStorage.getItem(LEGACY_STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return state;
    const legacy = !current;

    for (const unit of UNITS) {
      copyString(state.counts, saved.counts, unit.id, 12);
      if (!legacy && typeof saved.selectedUnits?.[unit.id] === 'boolean') state.selectedUnits[unit.id] = saved.selectedUnits[unit.id];
      if (!legacy && typeof saved.world?.availableUnits?.[unit.id] === 'boolean') state.world.availableUnits[unit.id] = saved.world.availableUnits[unit.id];
    }
    for (const tier of state.tiers) {
      const savedTier = saved.tiers?.find(item => item.id === tier.id);
      if (typeof savedTier?.active === 'boolean') tier.active = savedTier.active;
      if (legacy) copyString(state.world.lootFactors, { [tier.id]: savedTier?.lootFactor }, tier.id);
      else copyString(state.world.lootFactors, saved.world?.lootFactors, tier.id);
    }

    if (legacy) {
      if (saved.archersEnabled === false) {
        state.world.availableUnits.archer = false;
        state.world.availableUnits.marcher = false;
      }
      for (const key of ['carryFactor', 'durationFactor', 'initialSeconds', 'exponent']) copyString(state.world, saved, key);
    } else {
      copyString(state.world, saved.world, 'name', 40);
      for (const key of ['speed', 'carryFactor', 'durationFactor', 'initialSeconds', 'exponent']) copyString(state.world, saved.world, key);
    }
  } catch { /* Kalkulator działa także bez pamięci lokalnej. */ }
  return state;
}

const state = loadState();
const unitList = document.querySelector('#unit-list');
const resultList = document.querySelector('#result-list');
const message = document.querySelector('#form-message');
const unitDialog = document.querySelector('#unit-dialog');
const unitForm = document.querySelector('#unit-form');
const unitOptions = document.querySelector('#unit-options');
const dialog = document.querySelector('#world-dialog');
const worldForm = document.querySelector('#world-form');
const worldError = document.querySelector('#world-error');

function numeric(value, label, { allowBlank = false, integer = false, min = -Infinity, max = Infinity } = {}) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (raw === '' && allowBlank) return 0;
  if (!raw) throw new RangeError(`Uzupełnij: ${label}.`);
  const number = Number(raw);
  if (!Number.isFinite(number) || (integer && !Number.isSafeInteger(number)) || number < min || number > max) {
    throw new RangeError(`Nieprawidłowa wartość: ${label}.`);
  }
  return number;
}

function createUnitIcon(id) {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  icon.classList.add('unit-icon');
  icon.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(namespace, 'use');
  use.setAttribute('href', `#unit-icon-${id}`);
  icon.append(use);
  return icon;
}

function renderUnitInputs() {
  unitList.replaceChildren();
  const visibleUnits = UNITS.filter(item => state.world.availableUnits[item.id] && state.selectedUnits[item.id]);
  if (visibleUnits.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'unit-empty';
    empty.textContent = 'Nie wybrano jednostek. Użyj przycisku „Wybierz jednostki”.';
    unitList.append(empty);
  }
  for (const unit of visibleUnits) {
    const row = document.createElement('div');
    row.className = 'unit-row';

    const badge = document.createElement('span');
    badge.className = `unit-badge unit-badge--${unit.id}`;
    badge.setAttribute('aria-hidden', 'true');
    badge.append(createUnitIcon(unit.id));

    const label = document.createElement('label');
    label.className = 'unit-name';
    label.htmlFor = `unit-count-${unit.id}`;
    const name = document.createElement('strong');
    name.textContent = unit.name;
    const carry = document.createElement('small');
    carry.textContent = `Ładowność: ${unit.carry}`;
    label.append(name, carry);

    const input = document.createElement('input');
    input.className = 'unit-input';
    input.id = label.htmlFor;
    input.type = 'number';
    input.min = '0';
    input.max = '1000000000';
    input.step = '1';
    input.inputMode = 'numeric';
    input.placeholder = '0';
    input.dataset.countUnit = unit.id;
    input.value = state.counts[unit.id];
    input.setAttribute('aria-label', `Liczba jednostek: ${unit.name}`);

    row.append(badge, label, input);
    unitList.append(row);
  }
}

function renderUnitOptions() {
  unitOptions.replaceChildren();
  for (const unit of UNITS.filter(item => state.world.availableUnits[item.id])) {
    const option = document.createElement('label');
    option.className = 'unit-option';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.dataset.unitOption = unit.id;
    check.checked = state.selectedUnits[unit.id];
    const details = document.createElement('span');
    details.className = 'unit-option-details';
    const name = document.createElement('strong');
    name.textContent = unit.name;
    const carry = document.createElement('small');
    carry.textContent = `Ładowność: ${unit.carry}`;
    details.append(name, carry);
    option.append(check, details);
    unitOptions.append(option);
  }
}

function updateWorldBadge() {
  document.querySelector('#world-label').textContent = state.world.name;
  document.querySelector('#world-speed-label').textContent = `Prędkość ${state.world.speed.replace('.', ',')}×`;
}

function readPlan() {
  const counts = Object.fromEntries(UNITS.map(unit => [unit.id,
    state.selectedUnits[unit.id] && state.world.availableUnits[unit.id]
      ? numeric(state.counts[unit.id], unit.name, { allowBlank: true, integer: true, min: 0, max: 1_000_000_000 })
      : 0,
  ]));
  return calculatePlan({
    counts,
    selectedUnits: state.selectedUnits,
    availableUnits: state.world.availableUnits,
    tiers: state.tiers.map(tier => ({ id: tier.id, active: tier.active, lootFactor: numeric(state.world.lootFactors[tier.id], `mnożnik łupu poziomu ${tier.id}`, { min: 0.001, max: 10 }) })),
    carryFactor: numeric(state.world.carryFactor, 'mnożnik ładowności', { min: 0.01, max: 100 }),
    durationFactor: numeric(state.world.durationFactor, 'współczynnik czasu', { min: 0.01, max: 100 }),
    initialSeconds: numeric(state.world.initialSeconds, 'początkowy czas', { min: 0, max: 86400 }),
    exponent: numeric(state.world.exponent, 'wykładnik czasu', { min: 0.01, max: 2 }),
  });
}

function formatDuration(seconds) {
  if (!seconds) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [days && `${days} d`, hours && `${hours} h`, minutes && `${minutes} min`, rest && `${rest} s`].filter(Boolean).join(' ') || '0 s';
}

function renderResults(plan) {
  resultList.replaceChildren();
  document.querySelector('#total-carry').textContent = numberFormat.format(plan.totalCarry);
  for (const resource of ['wood', 'clay', 'iron']) document.getElementById(`total-${resource}`).textContent = numberFormat.format(plan.totalResources[resource]);
  for (const tier of plan.results) {
    const card = document.createElement('article');
    card.className = `result-card${tier.active ? '' : ' inactive'}`;
    const pills = UNITS.filter(unit => tier.counts[unit.id] > 0).map(unit => `<span class="unit-pill">${unit.short} × ${numberFormat.format(tier.counts[unit.id])}</span>`).join('');
    card.innerHTML = `<div class="result-top"><div class="result-overline"><span>POZIOM 0${tier.id}</span><label class="card-tier-toggle"><input type="checkbox" data-tier="${tier.id}" aria-label="Włącz poziom: ${tier.name}" ${tier.active ? 'checked' : ''}><span>${tier.active ? 'WŁĄCZONY' : 'WYŁĄCZONY'}</span></label></div><h3>${tier.name}</h3><div class="result-loot-title">Szacowany łup</div><div class="resource-breakdown"><div><span>Drewno</span><strong>${numberFormat.format(tier.resources.wood)}</strong></div><div><span>Glina</span><strong>${numberFormat.format(tier.resources.clay)}</strong></div><div><span>Żelazo</span><strong>${numberFormat.format(tier.resources.iron)}</strong></div></div><div class="result-line"><span>Przewidywany czas</span><strong>${formatDuration(tier.seconds)}</strong></div></div><div class="result-bottom"><div class="result-bottom-title">JEDNOSTKI DO WYSŁANIA</div>${pills ? `<div class="unit-pills">${pills}</div>` : `<p class="empty-message">${tier.active ? 'Dodaj jednostki lub włącz mniej poziomów.' : 'Ten poziom jest pominięty.'}</p>`}</div>`;
    resultList.append(card);
  }
  if (plan.totalUnits > 0 && plan.activeCount > plan.totalUnits) message.textContent = 'Masz mniej jednostek niż wolnych poziomów. Część wypraw pozostanie pusta.';
  else message.textContent = plan.activeCount === 0 ? 'Włącz co najmniej jeden wolny poziom.' : '';
}

function update() {
  try {
    renderResults(readPlan());
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : 'Sprawdź wprowadzone dane.';
    for (const id of ['total-carry', 'total-wood', 'total-clay', 'total-iron']) document.getElementById(id).textContent = '—';
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Pamięć lokalna jest opcjonalna. */ }
}

function formInput(name) { return worldForm.elements.namedItem(name); }

function renderWorldForm(profile) {
  formInput('worldName').value = profile.name;
  formInput('worldSpeed').value = profile.speed;
  formInput('durationFactor').value = profile.durationFactor;
  formInput('initialSeconds').value = profile.initialSeconds;
  formInput('exponent').value = profile.exponent;
  formInput('carryFactor').value = profile.carryFactor;
  worldError.textContent = '';

  const unitContainer = document.querySelector('#modal-unit-list');
  unitContainer.replaceChildren();
  for (const unit of UNITS) {
    const label = document.createElement('label');
    label.className = 'modal-unit-option';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.name = `available-${unit.id}`;
    check.checked = profile.availableUnits[unit.id];
    const text = document.createElement('span');
    text.textContent = unit.name;
    label.append(check, text);
    unitContainer.append(label);
  }

  const lootContainer = document.querySelector('#modal-loot-list');
  lootContainer.replaceChildren();
  for (const tier of TIERS) {
    const label = document.createElement('label');
    label.className = 'modal-loot-field';
    const text = document.createElement('span');
    text.textContent = tier.name;
    const input = document.createElement('input');
    input.className = 'loot-input';
    input.type = 'number';
    input.name = `loot-${tier.id}`;
    input.min = '0.001';
    input.max = '10';
    input.step = '0.001';
    input.inputMode = 'decimal';
    input.value = profile.lootFactors[tier.id];
    label.append(text, input);
    lootContainer.append(label);
  }
}

function readWorldForm() {
  const name = formInput('worldName').value.trim();
  if (!name || name.length > 40) throw new RangeError('Wpisz nazwę świata (maksymalnie 40 znaków).');
  const speed = numeric(formInput('worldSpeed').value, 'prędkość gry', { min: 0.01, max: 100 });
  const durationFactor = numeric(formInput('durationFactor').value, 'współczynnik czasu', { min: 0.01, max: 100 });
  const initialSeconds = numeric(formInput('initialSeconds').value, 'początkowy czas', { min: 0, max: 86400 });
  const exponent = numeric(formInput('exponent').value, 'wykładnik czasu', { min: 0.01, max: 2 });
  const carryFactor = numeric(formInput('carryFactor').value, 'mnożnik ładowności', { min: 0.01, max: 100 });
  const availableUnits = Object.fromEntries(UNITS.map(unit => [unit.id, formInput(`available-${unit.id}`).checked]));
  const lootFactors = Object.fromEntries(TIERS.map(tier => [tier.id, String(numeric(formInput(`loot-${tier.id}`).value, `mnożnik łupu poziomu ${tier.id}`, { min: 0.001, max: 10 }))]));
  return { name, speed: String(speed), durationFactor: String(durationFactor), initialSeconds: String(initialSeconds), exponent: String(exponent), carryFactor: String(carryFactor), availableUnits, lootFactors };
}

unitList.addEventListener('input', event => {
  const id = event.target?.dataset?.countUnit;
  if (id) { state.counts[id] = event.target.value; update(); }
});
resultList.addEventListener('change', event => {
  const id = Number(event.target?.dataset?.tier);
  if (id) { state.tiers.find(tier => tier.id === id).active = event.target.checked; update(); }
});
document.querySelector('#open-unit-selection').addEventListener('click', () => {
  renderUnitOptions();
  unitDialog.showModal();
});
for (const id of ['close-unit-selection', 'cancel-unit-selection']) document.getElementById(id).addEventListener('click', () => unitDialog.close());
document.querySelector('#select-all-unit-options').addEventListener('click', () => {
  for (const check of unitOptions.querySelectorAll('input[type="checkbox"]')) check.checked = true;
});
unitForm.addEventListener('submit', event => {
  event.preventDefault();
  for (const check of unitOptions.querySelectorAll('[data-unit-option]')) state.selectedUnits[check.dataset.unitOption] = check.checked;
  renderUnitInputs();
  update();
  unitDialog.close();
});
document.querySelector('#reset-button').addEventListener('click', () => {
  for (const unit of UNITS) state.counts[unit.id] = '';
  renderUnitInputs();
  update();
});

document.querySelector('#open-world-settings').addEventListener('click', () => {
  renderWorldForm(state.world);
  dialog.querySelector('.dialog-scroll').scrollTop = 0;
  dialog.showModal();
});
for (const id of ['close-world-settings', 'cancel-world-settings']) document.getElementById(id).addEventListener('click', () => dialog.close());
document.querySelector('#restore-world-233').addEventListener('click', () => renderWorldForm(defaultWorld()));
formInput('worldSpeed').addEventListener('input', event => {
  const speed = Number(event.target.value);
  if (Number.isFinite(speed) && speed > 0) formInput('durationFactor').value = (speed ** -0.55).toFixed(6);
});
worldForm.addEventListener('submit', event => {
  event.preventDefault();
  try {
    state.world = readWorldForm();
    updateWorldBadge();
    renderUnitInputs();
    update();
    dialog.close();
  } catch (error) {
    worldError.textContent = error instanceof Error ? error.message : 'Sprawdź ustawienia świata.';
  }
});

renderUnitInputs();
updateWorldBadge();
update();
