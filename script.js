/* ==========================================================
   Sweet Honey — script.js (shared by every page)

   Element ids this file expects:
   - product.html : #filter-bar, #product-list
   - order.html   : #orderForm, #customerName, #contact,
                    #items, #total, #note
   - admin.html   : #ordersTable tbody

   Each page only runs its own part: the code checks which
   elements exist, so one file works everywhere.
   ========================================================== */

const CONFIG = {
  productsUrl: 'products.json',
  orderEndpoint:
    'https://script.google.com/macros/s/AKfycbxHHdDMWgsbEdyaOC9QEd_pQvoKRvismZl5SYfKqMzBLHONDN64QZ8PmQ-r34nMKEjocA/exec',
  // Published sheet, CSV output (the pubhtml link cannot be parsed as CSV)
  sheetCsvUrl:
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vSSaq0_R7B61mAbQw6O3DUB_1ylXWguQUC3mEPGPG0cUqxQbpJhQ0VJhw2IS1CNVOSTdaf9NWm5zS0I/pub?gid=0&single=true&output=csv'
};

// Labels for the mood filter buttons (keys match "mood" in products.json)
const MOOD_LABELS = {
  all: 'ทั้งหมด',
  small: 'ขวดเล็ก',
  large: 'ขวดใหญ่',
  'squeeze tube': 'หลอดบีบ'
};

/* ---------- Helpers ---------- */

function normalizeMood(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function formatPrice(price) {
  if (price === null || price === undefined || price === '') return 'สอบถามราคา';
  const n = Number(price);
  return Number.isFinite(n) ? n.toLocaleString('th-TH') + ' บาท' : String(price);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ==========================================================
   1) product.html — product cards + mood filter
   ========================================================== */

async function initProducts() {
  const list = document.getElementById('product-list');
  const bar = document.getElementById('filter-bar');
  if (!list) return;

  let products;
  try {
    const res = await fetch(CONFIG.productsUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    products = await res.json();
  } catch (error) {
    console.error(error);
    list.textContent = 'ไม่สามารถโหลดรายการสินค้าได้ กรุณาลองใหม่อีกครั้ง';
    return;
  }

  function renderProducts(mood) {
    list.replaceChildren();
    const shown = products.filter(
      (p) => mood === 'all' || normalizeMood(p.mood) === mood
    );

    shown.forEach((p) => {
      const card = el('article', 'product-card');
      card.dataset.mood = p.mood;

      const imageWrap = el('div', 'product-card__image');
      const img = document.createElement('img');
      img.src = p.image;
      img.alt = p.name;
      img.loading = 'lazy';
      imageWrap.appendChild(img);

      const body = el('div', 'product-card__body');
      body.appendChild(el('h3', 'product-card__name', p.name));
      body.appendChild(el('p', 'product-card__size', p.size));

      const footer = el('div', 'product-card__footer');
      footer.appendChild(el('span', 'price', formatPrice(p.price)));

      const itemName = (p.name + ' ' + p.size).trim();
      const priceParam = p.price === null || p.price === undefined ? '' : p.price;
      const order = el('a', 'btn btn--accent', 'สั่งซื้อ');
      order.href =
        'order.html?item=' + encodeURIComponent(itemName) +
        '&price=' + encodeURIComponent(priceParam);
      footer.appendChild(order);

      body.appendChild(footer);
      card.append(imageWrap, body);
      list.appendChild(card);
    });

    if (!shown.length) {
      list.textContent = 'ยังไม่มีสินค้าในหมวดนี้';
    }
  }

  // Build filter buttons: "all" + each mood found in the data
  const moods = ['all'];
  products.forEach((p) => {
    const m = normalizeMood(p.mood);
    if (m && !moods.includes(m)) moods.push(m);
  });

  // Auto-filter from ?mood=xxx
  const requested = normalizeMood(new URLSearchParams(location.search).get('mood'));
  let current = moods.includes(requested) ? requested : 'all';

  function setActive() {
    if (!bar) return;
    bar.querySelectorAll('button').forEach((btn) => {
      const active = btn.dataset.mood === current;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  if (bar) {
    bar.replaceChildren();
    moods.forEach((m) => {
      const btn = el('button', 'btn', MOOD_LABELS[m] || m);
      btn.type = 'button';
      btn.dataset.mood = m;
      btn.addEventListener('click', () => {
        current = m;
        renderProducts(current);
        setActive();
        const url = new URL(location.href);
        if (m === 'all') url.searchParams.delete('mood');
        else url.searchParams.set('mood', m);
        history.replaceState(null, '', url);
      });
      bar.appendChild(btn);
    });
  }

  renderProducts(current);
  setActive();
}

/* ==========================================================
   2) order.html — autofill from URL + submit order
   ========================================================== */

function initOrder() {
  const form = document.getElementById('orderForm');
  if (!form) return;

  const params = new URLSearchParams(location.search);
  const itemsField = document.getElementById('items');
  const totalField = document.getElementById('total');

  // Autofill BOTH fields as soon as the page loads
  if (itemsField) itemsField.value = params.get('item') || '';
  if (totalField) totalField.value = params.get('price') || '';

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const value = (id) => {
      const node = document.getElementById(id);
      return node ? node.value.trim() : '';
    };

    const payload = {
      customerName: value('customerName'),
      contact: value('contact'),
      items: value('items'),
      total: value('total'),
      note: value('note')
    };

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    // No custom headers, no mode: 'no-cors' (keeps it a simple request for Apps Script)
    fetch(CONFIG.orderEndpoint, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
      .then(() => {
        alert('ส่งคำสั่งซื้อเรียบร้อยแล้ว ขอบคุณที่สั่งซื้อ');
        form.reset();
      })
      .catch((error) => {
        console.error(error);
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      })
      .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
      });
  });
}

/* ==========================================================
   3) admin.html — orders table from the published sheet
   ========================================================== */

// Minimal CSV parser: quoted fields, "" escapes, commas and newlines inside quotes
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

async function initAdmin() {
  const tbody = document.querySelector('#ordersTable tbody');
  if (!tbody) return;

  const COLUMNS = 6; // datetime, customer, contact, items, total, note

  function message(text) {
    tbody.replaceChildren();
    const tr = document.createElement('tr');
    const td = el('td', '', text);
    td.colSpan = COLUMNS;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  message('กำลังโหลดข้อมูล...');

  try {
    const res = await fetch(CONFIG.sheetCsvUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = parseCSV(await res.text());

    // First row is the header; new orders are appended at the bottom,
    // so reversing puts the latest order first.
    const data = rows.slice(1).reverse();

    if (!data.length) {
      message('ยังไม่มีรายการสั่งซื้อ');
      return;
    }

    tbody.replaceChildren();
    data.forEach((r) => {
      const tr = document.createElement('tr');
      for (let i = 0; i < COLUMNS; i++) {
        tr.appendChild(el('td', '', (r[i] || '').trim()));
      }
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error(error);
    message('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
  }
}

/* ---------- Start ---------- */

document.addEventListener('DOMContentLoaded', () => {
  initProducts();
  initOrder();
  initAdmin();
});
