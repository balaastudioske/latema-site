const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const pagePaths = ['/', '/routes', '/parcels', '/track', '/about', '/gallery', '/contact'];
const pageNames = ['home', 'routes', 'parcels', 'track', 'about', 'gallery', 'contact'];
const routeGroups = [
  {name:'Nairobi West & South-West',corridor:'Kikuyu · Kabiria · Kawangware',ids:['kikuyu','kabiria','kawangware']},
  {name:'Nairobi North & Thika Road',corridor:'Gachie · Thika Road · Juja',ids:['gachie','thika']},
  {name:'Nairobi – Nakuru',corridor:'Mai Mahiu · Naivasha · Gilgil · Nakuru',ids:['nakuru']}
];
let config, currentSlide = 0, touchStart = null;

async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try {
    const [routeData, galleryData] = await Promise.all(['/routes.json', '/gallery.json'].map(path => fetch(path).then(response => {
      if (!response.ok) throw new Error(`Could not load ${path}`);
      return response.json();
    })));
    config = routeData;
    window.galleryItems = galleryData;
  } catch (error) {
    console.error(error);
    return;
  }
  initNavigation();
  renderRoutes();
  renderGallery(window.galleryItems || []);
  initConceptForms();
}

function initNavigation() {
  $('#year').textContent = new Date().getFullYear();
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-page]');
    if (link) {
      event.preventDefault();
      $('.main-nav').classList.remove('open');
      $('#menu-button').setAttribute('aria-expanded', 'false');
      $('#menu-button').setAttribute('aria-label', 'Open navigation');
      setPage(link.dataset.page);
      return;
    }
    const topic = event.target.closest('[data-contact-topic]');
    if (topic) {
      event.preventDefault();
      const message = `Hello Latema, I have a ${topic.dataset.contactTopic.toLowerCase()} enquiry.`;
      window.open(`https://wa.me/254791624048?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    }
  });
  $('#menu-button').addEventListener('click', () => {
    const open = $('.main-nav').classList.toggle('open');
    $('#menu-button').setAttribute('aria-expanded', String(open));
    $('#menu-button').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  });
  const deck = $('#home');
  deck.addEventListener('touchstart', event => {
    if (event.target.closest('a,button,input,select,textarea,dialog,.gallery-rail,.hero-art')) return;
    touchStart = {x:event.changedTouches[0].clientX, y:event.changedTouches[0].clientY};
  }, {passive:true});
  deck.addEventListener('touchend', event => {
    if (!touchStart) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) setSlide(currentSlide + (dx < 0 ? 1 : -1));
    touchStart = null;
  }, {passive:true});
  document.addEventListener('keydown', event => {
    if ($('#gallery-lightbox').open) return;
    if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    if (event.key === 'ArrowRight') setSlide(currentSlide + 1);
    if (event.key === 'ArrowLeft') setSlide(currentSlide - 1);
  });
  window.addEventListener('popstate', () => setSlide(pagePaths.indexOf(location.pathname.replace(/\/$/, '') || '/') || 0, false));
  const page = pagePaths.indexOf(location.pathname.replace(/\/$/, '') || '/');
  setSlide(page < 0 ? 0 : page, false);
}

function setPage(name) {
  const index = pageNames.indexOf(name);
  if (index >= 0) setSlide(index);
}
function setSlide(index, push = true) {
  currentSlide = Math.max(0, Math.min($$('.public-slide').length - 1, index));
  $('#home').style.transform = `translateX(-${currentSlide * 100}vw)`;
  $$('.main-nav [data-page]').forEach(link => {
    const active = link.dataset.page === pageNames[currentSlide];
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $$('.public-slide').forEach((slide, i) => {
    slide.setAttribute('aria-hidden', String(i !== currentSlide));
    slide.inert = i !== currentSlide;
  });
  if (push && location.pathname !== pagePaths[currentSlide]) history.pushState({page:pageNames[currentSlide]}, '', pagePaths[currentSlide]);
}

function renderRoutes() {
  const routes = config.routes;
  const stages = [...new Set(routes.flatMap(route => route.stages))];
  const options = stages.map(stage => `<option value="${escapeHtml(stage)}">${escapeHtml(stage)}</option>`).join('');
  $('#route-from').insertAdjacentHTML('beforeend', options);
  $('#route-to').insertAdjacentHTML('beforeend', options);
  $('#parcel-dropoff-select').insertAdjacentHTML('beforeend', options);
  $('#parcel-destination-select').insertAdjacentHTML('beforeend', routeGroups.map(group => {
    const groupStages = [...new Set(group.ids.flatMap(id => routes.find(route => route.id === id)?.stages || []))];
    return `<optgroup label="${escapeHtml(group.name)}">${groupStages.map(stage => `<option value="${escapeHtml(stage)}">${escapeHtml(stage)}</option>`).join('')}</optgroup>`;
  }).join(''));
  $('#route-grid').innerHTML = routeGroups.map((group, index) => {
    const branches = group.ids.map(id => routes.find(route => route.id === id)).filter(Boolean);
    return `<article class="corridor-card"><div class="route-card-top"><span class="route-icon" aria-hidden="true">${['⌖','↗','✦'][index]}</span><span class="route-stage-count">${branches.length} service lines</span></div><h3>${escapeHtml(group.name)}</h3><p>${escapeHtml(group.corridor)}</p><div class="branch-list">${branches.map(route => `<details class="route-line"><summary><b>${escapeHtml(route.name)}</b><span>View stages +</span></summary><p>${escapeHtml(route.corridor)}</p><div class="stage-list route-stage-list">${route.stages.map((stage, i) => `<button type="button" class="stage-chip" data-stage-select="${escapeHtml(stage)}"><span>${i+1}</span>${escapeHtml(stage)}</button>`).join('')}</div></details>`).join('')}</div></article>`;
  }).join('');
  $('#route-finder').addEventListener('submit', findRoute);
  $('#route-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-stage-select]');
    if (!button) return;
    const route = routes.find(item => item.stages.includes(button.dataset.stageSelect));
    if (!route) return;
    if (!$('#route-from').value || $('#route-from').value === button.dataset.stageSelect) $('#route-from').value = route.stages[0];
    $('#route-to').value = button.dataset.stageSelect;
    findRoute();
  });
  $$('#route-from, #route-to').forEach(select => select.addEventListener('change', () => {
    if ($('#route-from').value && $('#route-to').value) findRoute();
  }));
}

function findRoute(event) {
  event?.preventDefault();
  const from = $('#route-from').value, to = $('#route-to').value, output = $('#route-search-results');
  if (!from || !to || from === to) { output.innerHTML = '<span>Choose two different stages to explore the shared route information.</span>'; return; }
  const matches = config.routes.filter(route => route.stages.includes(from) && route.stages.includes(to));
  output.innerHTML = matches.length ? matches.map(route => `<article class="route-match"><span class="route-match-icon">↗</span><div><b>${escapeHtml(route.name)}</b><small>${escapeHtml(from)} → ${escapeHtml(to)}</small><span>Both locations appear on this supplied service line.</span></div><a href="/routes" data-page="routes">View stages</a></article>`).join('') : '<span>No shared service line contains both selected stages in this concept.</span>';
}

function renderGallery(items) {
  renderHeroSlideshow(items);
  const rail = $('#gallery-rail');
  rail.innerHTML = items.map((item, index) => `<button class="gallery-photo" type="button" data-gallery-index="${index}" aria-label="Open photo: ${escapeHtml(item.caption)}"><img src="${item.src}" alt="${escapeHtml(item.alt)}" loading="${index < 3 ? 'eager' : 'lazy'}" decoding="async"><span>${escapeHtml(item.caption)}</span></button>`).join('');
  $('#gallery-count').textContent = `${items.length} photos · swipe or use arrows`;
  rail.addEventListener('click', event => {
    const photo = event.target.closest('[data-gallery-index]');
    if (photo) openGalleryPhoto(items, Number(photo.dataset.galleryIndex));
  });
  $$('.gallery-arrow').forEach(button => button.addEventListener('click', () => {
    rail.scrollBy({left: Number(button.dataset.galleryStep) * Math.max(rail.clientWidth * .78, 260), behavior:'smooth'});
  }));
  const dialog = $('#gallery-lightbox');
  $('#gallery-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && dialog.open) dialog.close(); });
}

function renderHeroSlideshow(items) {
  const image = $('#hero-photo');
  const caption = $('#hero-slide-caption');
  const count = $('#hero-slide-count');
  const toggle = $('#hero-slide-toggle');
  const frame = $('#hero-slideshow');
  if (!items.length || !image || !frame) return;

  let index = 0;
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer;
  const show = next => {
    index = (next + items.length) % items.length;
    image.classList.add('is-changing');
    image.addEventListener('load', () => image.classList.remove('is-changing'), {once:true});
    image.src = items[index].src;
    image.alt = items[index].alt;
    caption.textContent = items[index].caption;
    count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
  };
  const stop = () => { clearInterval(timer); timer = undefined; };
  const start = () => {
    stop();
    if (paused || items.length < 2) return;
    timer = setInterval(() => show(index + 1), 5200);
  };
  const setPaused = value => {
    paused = value;
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
    toggle.textContent = paused ? '▶' : 'Ⅱ';
    start();
  };

  show(0);
  setPaused(paused);
  $('#hero-slide-previous').addEventListener('click', () => { show(index - 1); start(); });
  $('#hero-slide-next').addEventListener('click', () => { show(index + 1); start(); });
  toggle.addEventListener('click', () => setPaused(!paused));
  frame.addEventListener('mouseenter', stop);
  frame.addEventListener('mouseleave', start);
  frame.addEventListener('focusin', stop);
  frame.addEventListener('focusout', start);
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  frame.addEventListener('touchstart', event => { frame.dataset.swipeX = event.changedTouches[0].clientX; }, {passive:true});
  frame.addEventListener('touchend', event => {
    const startX = Number(frame.dataset.swipeX);
    const dx = event.changedTouches[0].clientX - startX;
    if (startX && Math.abs(dx) > 40) { show(index + (dx < 0 ? 1 : -1)); start(); }
  }, {passive:true});
  start();
}

function openGalleryPhoto(items, index) {
  const item = items[index];
  $('#gallery-large-image').src = item.src;
  $('#gallery-large-image').alt = item.alt;
  $('#gallery-caption').textContent = item.caption;
  $('#gallery-lightbox').showModal();
  $('#gallery-close').focus();
}

function initConceptForms() {
  $('#parcel-enquiry-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const message = [
      'Hello Latema, I would like to ask about parcel services.',
      `Sender: ${data.senderName} (${data.senderPhone})`,
      `Recipient: ${data.recipientName} (${data.recipientPhone})`,
      `Parcel: ${data.description} · ${data.sizeWeight}`,
      `Destination: ${data.destination}`,
      `Preferred drop-off: ${data.dropoff}`
    ].join('\n');
    $('#parcel-enquiry-message').textContent = 'This concept does not store your details. WhatsApp opens a draft for you to review before sending.';
    window.open(`https://wa.me/254791624048?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  });
}

init();
