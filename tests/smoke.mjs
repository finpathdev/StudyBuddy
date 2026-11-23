/**
 * Smoke tests for StudyBuddy. Serves the repo and drives the real page
 * in headless Chrome. No network calls to tracking services are expected.
 *
 *   npm install
 *   npm test
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    let path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!path || path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('missing');
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const failures = [];
function check(name, ok, detail) {
  if (ok) console.log('  ok  ' + name);
  else { console.error(' FAIL ' + name + (detail ? ' — ' + detail : '')); failures.push(name + (detail ? ': ' + detail : '')); }
}

const routes = ['#/', '#/courses', '#/focus', '#/plan', '#/stats', '#/review', '#/tutor', '#/tests', '#/settings', '#/frq', '#/mistakes', '#/search', '#/course/ap-bio', '#/study/ap-bio/u1/guide', '#/study/ap-bio/u1/cards', '#/study/ap-bio/u1/quiz', '#/study/ap-bio/u1/learn', '#/study/ap-bio/u1/match'];

async function open(width, height) {
  const page = await browser.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('request', req => requests.push(req.url()));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  return { page, errors, requests };
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

const desk = await open(1280, 800);
await desk.page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(400);
const boot = await desk.page.evaluate(() => ({
  booted: !!window.__SB_BOOTED,
  h1: document.querySelector('h1')?.innerText || '',
  focus: [...document.querySelectorAll('#nav a')].some(a => a.textContent.includes('Focus')),
  progress: [...document.querySelectorAll('#nav a')].some(a => a.textContent.includes('Progress')),
  tabs: document.querySelectorAll('#tabbar a').length
}));
check('boots', boot.booted && /today|row/i.test(boot.h1), JSON.stringify(boot));
check('focus and progress are in the nav', boot.focus && boot.progress, JSON.stringify(boot));
check('phone bar has five destinations', boot.tabs === 5, String(boot.tabs));
check('no page errors on first paint', desk.errors.length === 0, desk.errors.join(' | '));
check('does not call the visitor counter', !desk.requests.some(u => /counterapi|formspree|anthropic/i.test(u)), desk.requests.filter(u => !u.startsWith(base.slice(0, 20)) && !u.includes('fonts.')).slice(0, 8).join(' '));

const welcome = await desk.page.evaluate(() => {
  const text = document.getElementById('view').innerText;
  const fab = document.getElementById('installfab');
  const theme = document.getElementById('themeBtn');
  const foot = document.querySelector('.rail-foot');
  const box = el => el ? el.getBoundingClientRect() : null;
  const hit = (a, b) => a && b && !(a.bottom <= b.top + 1 || a.top >= b.bottom - 1 || a.right <= b.left + 1 || a.left >= b.right - 1);
  const fabBox = box(fab);
  return {
    owl: !!document.querySelector('#view .mascot'),
    zeros: /PER ACTIVE DAY|Nothing scheduled/.test(text),
    inRail: !!(fab && fab.closest('#rail')),
    fixed: fab ? getComputedStyle(fab).position : '',
    coversTheme: hit(fabBox, box(theme)),
    coversFoot: hit(fabBox, box(foot))
  };
});
check('empty desk is an invitation, not a wall of zeros', welcome.owl && !welcome.zeros, JSON.stringify(welcome));
check('install prompt sits in the sidebar without covering Night or the footer', welcome.inRail && welcome.fixed !== 'fixed' && !welcome.coversTheme && !welcome.coversFoot, JSON.stringify(welcome));

for (const hash of routes) {
  const before = desk.errors.length;
  await desk.page.evaluate(h => { location.hash = h; }, hash);
  await wait(120);
  const info = await desk.page.evaluate(() => {
    const view = document.getElementById('view');
    return {
      len: (view?.innerText || '').length,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      h1: view?.querySelector('h1')?.innerText?.slice(0, 60) || ''
    };
  });
  check('route ' + hash, info.len > 40 && !info.overflow && desk.errors.length === before, JSON.stringify(info) + ' errors=' + desk.errors.slice(before).join(' | '));
}

await desk.page.evaluate(() => { location.hash = '#/study/ap-bio/u1/learn'; });
await wait(150);
const learn = await desk.page.evaluate(() => ({
  options: document.querySelectorAll('#lnopts .opt, #lnwrap .opt').length,
  card: !!document.querySelector('.fcard')
}));
check('learn mode is not the flashcard screen', learn.options >= 2 && !learn.card, JSON.stringify(learn));

const flows = await desk.page.evaluate(async () => {
  const out = {};
  const notes = [
    'Mitochondria — organelle that produces ATP for the cell',
    'Osmosis — movement of water across a membrane from high to low',
    'Ribosome — structure that builds proteins from amino acids',
    'Nucleus — organelle that stores the genetic material of the cell',
    'Enzyme — protein that speeds up a chemical reaction'
  ].join('\n');
  location.hash = '#/tutor';
  await new Promise(r => setTimeout(r, 50));
  const mat = document.getElementById('mat');
  if (!mat) return { made: false, missing: true };
  mat.value = notes;
  await genDeck();
  out.made = document.getElementById('genout')?.innerText?.includes('flashcards') || false;
  document.getElementById('dname').value = '<img src=x onerror="window.__xss=1"> Bio';
  quizGenerated();
  out.quiz = !!document.querySelector('#opts .opt');
  answer(0);
  out.feedback = !!document.getElementById('feedback')?.innerText;
  saveDeck();
  out.xss = !!window.__xss || !!document.querySelector('#view img');
  out.nameShown = document.body.innerText.includes('Bio');
  out.nameRaw = document.getElementById('view').innerHTML.includes('<img');
  return out;
});
check('notes become a quiz', flows.made && flows.quiz && flows.feedback, JSON.stringify(flows));
check('deck name is escaped', flows.nameShown && !flows.xss && !flows.nameRaw, JSON.stringify(flows));

const memory = await desk.page.evaluate(() => {
  localStorage.clear();
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  localStorage.setItem('sb.progress', JSON.stringify({ 'ap-bio/u1': { best: 91, last: 80, tries: 4, when: '2024-03-01' } }));
  localStorage.setItem('sb.leitner', JSON.stringify({ 'card:ap-psych/u1/0': { box: 1, due: '2020-01-01', seen: 2, last: '2020-01-01' } }));
  localStorage.setItem('sb.streak', JSON.stringify({ last: y, n: 6 }));
  localStorage.setItem('sb.custom', JSON.stringify([{ id: 'kept', name: 'Kept deck', cards: [['Term', 'Means this thing exactly']], quiz: [] }]));
  return { y, mastery: null };
});
await desk.page.reload({ waitUntil: 'domcontentloaded' });
await wait(300);
const old = await desk.page.evaluate(async () => {
  location.hash = '#/review';
  await new Promise(r => setTimeout(r, 60));
  const due = document.querySelector('h1')?.innerText || '';
  const streakBefore = streakCount();
  startReview();
  markCard(true);
  const box = JSON.parse(localStorage.getItem('sb.leitner') || '{}');
  const keys = Object.keys(box);
  return {
    streakBefore,
    streak: streakCount(),
    mastery: mastery('ap-bio', 'u1'),
    due,
    keys,
    graded: box['card:ap-psych/u1/0'] || null,
    kept: JSON.parse(localStorage.getItem('sb.custom') || '[]').some(d => d.name === 'Kept deck')
  };
});
check('old streak and mastery still load', old.streakBefore === 6 && old.streak === 7 && old.mastery === 91 && old.kept, JSON.stringify(old));
check('due review updates the real card', /due today/i.test(old.due) && old.graded && old.graded.box === 2 && !old.keys.some(k => k.includes('null')), JSON.stringify(old));

const grown = await desk.page.evaluate(() => {
  const m = JSON.parse(localStorage.getItem('sb.leitner'));
  m['card:ap-psych/u1/0'] = { box: 3, iv: 7, ease: 2.3, due: '2020-01-01', seen: 4, last: '2020-01-01' };
  localStorage.setItem('sb.leitner', JSON.stringify(m));
  location.hash = '#/review';
  startReview();
  markCard(true);
  return JSON.parse(localStorage.getItem('sb.leitner'))['card:ap-psych/u1/0'];
});
check('a mastered card waits longer than a week', grown && grown.box === 3 && grown.iv >= 16, JSON.stringify(grown));

const plan = await desk.page.evaluate(async () => {
  location.hash = '#/plan';
  await new Promise(r => setTimeout(r, 60));
  document.getElementById('taskTitle').value = '<img src=x onerror="window.__xss=1"> Chapter 4';
  document.getElementById('taskDue').value = '2020-01-02';
  document.getElementById('taskCourse').value = 'ap-bio';
  addTask({ preventDefault() {} });
  const html = document.getElementById('view').innerHTML;
  const text = document.getElementById('view').innerText;
  return {
    xss: !!window.__xss || html.includes('<img'),
    shown: text.includes('Chapter 4') && /overdue/i.test(text),
    saved: JSON.parse(localStorage.getItem('sb.tasks') || '[]').length === 1
  };
});
check('task is saved, escaped, and marked overdue', plan.saved && plan.shown && !plan.xss, JSON.stringify(plan));

const lamp = await desk.page.evaluate(async () => {
  location.hash = '#/focus';
  await new Promise(r => setTimeout(r, 40));
  focusSetLen(15);
  focusStart('work');
  const s = JSON.parse(localStorage.getItem('sb.focus.session'));
  focusPause();
  const paused = JSON.parse(localStorage.getItem('sb.focus.session'));
  return { total: s.total, running: s.running, paused: paused.running === false && paused.left > 1000, onPage: document.querySelector('h1')?.innerText || '' };
});
check('focus timer starts, pauses, and stays put', lamp.total === 15 * 60000 && lamp.running && lamp.paused && /one thing/i.test(lamp.onPage), JSON.stringify(lamp));

await desk.page.reload({ waitUntil: 'domcontentloaded' });
await wait(200);
const kept = await desk.page.evaluate(async () => {
  const s = JSON.parse(localStorage.getItem('sb.focus.session') || 'null');
  const tasks = JSON.parse(localStorage.getItem('sb.tasks') || '[]');
  location.hash = '#/stats';
  await new Promise(r => setTimeout(r, 40));
  const text = document.getElementById('view').innerText;
  const data = collectData();
  return {
    session: !!(s && s.running === false),
    task: tasks[0] && tasks[0].title.includes('Chapter 4'),
    progress: /progress/i.test(document.querySelector('h1')?.innerText || ''),
    backup: !!(data && data.data['sb.tasks'] && data.data['sb.progress'] && data.data['sb.leitner'] && data.data['sb.focus.session'])
  };
});
check('timer, task, and backup survive a reload', kept.session && kept.task && kept.progress && kept.backup, JSON.stringify(kept));

const restored = await desk.page.evaluate(async () => {
  location.hash = '#/settings';
  await new Promise(r => setTimeout(r, 60));
  const file = new File([JSON.stringify({
    app: 'StudyBuddy', version: 2, exported: '2024-06-01T00:00:00.000Z',
    data: {
      'sb.progress': { 'ap-chem/u1': { best: 70, last: 70, tries: 1, when: '2024-06-01' } },
      'sb.streak': { last: '2024-06-01', n: 2 }
    }
  })], 'old.json', { type: 'application/json' });
  const reload = location.reload.bind(location);
  location.reload = () => { location.__reloaded = true; };
  restoreBackup(file, 'merge');
  return new Promise(resolve => {
    setTimeout(() => {
      const p = JSON.parse(localStorage.getItem('sb.progress') || '{}');
      const tasks = JSON.parse(localStorage.getItem('sb.tasks') || '[]');
      resolve({
        chem: p['ap-chem/u1'] && p['ap-chem/u1'].best,
        bio: p['ap-bio/u1'] && p['ap-bio/u1'].best,
        task: tasks.length,
        reloaded: !!location.__reloaded
      });
      location.reload = reload;
    }, 200);
  });
});
check('an old backup merges and keeps newer data', restored.chem === 70 && restored.bio === 91 && restored.task === 1, JSON.stringify(restored));

await desk.page.evaluate(() => { if (document.documentElement.dataset.theme !== 'night') toggleTheme(); });
await wait(80);
const night = await desk.page.evaluate(() => document.documentElement.dataset.theme);
check('night mode applies', night === 'night', night);

const phone = await open(390, 844);
await phone.page.goto(base, { waitUntil: 'domcontentloaded' });
await wait(300);
const phoneInstall = await phone.page.evaluate(() => {
  const bar = document.getElementById('installphone');
  const tabs = document.getElementById('tabbar');
  if (!bar || !tabs) return { missing: true };
  const b = bar.getBoundingClientRect();
  const t = tabs.getBoundingClientRect();
  const view = document.getElementById('view').getBoundingClientRect();
  return {
    above: b.bottom <= t.top + 1,
    gap: Math.round(t.top - b.bottom),
    coversTabs: b.bottom > t.top + 1,
    inSidebar: !!bar.closest('#rail')
  };
});
check('phone install bar sits above the tab bar', phoneInstall.above && !phoneInstall.coversTabs && phoneInstall.gap >= 0 && phoneInstall.gap < 24, JSON.stringify(phoneInstall));
for (const hash of ['#/', '#/focus', '#/plan', '#/courses', '#/study/ap-bio/u1/cards']) {
  await phone.page.evaluate(h => { location.hash = h; }, hash);
  await wait(100);
  const info = await phone.page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    menu: !!document.querySelector('.menu-btn'),
    tabs: getComputedStyle(document.getElementById('tabbar')).display,
    h1: document.querySelector('h1')?.innerText?.slice(0, 40) || ''
  }));
  check('phone ' + hash, !info.overflow && info.menu && info.tabs === 'flex', JSON.stringify(info));
}
check('phone has no console errors', phone.errors.length === 0, phone.errors.join(' | '));

const sw = await readFile(join(root, 'sw.js'), 'utf8');
check('service worker cache bumped', sw.includes("studybuddy-v83"));

await browser.close();
server.close();
if (failures.length) {
  console.error('\n' + failures.length + ' failed');
  process.exit(1);
}
console.log('\nall checks passed');
