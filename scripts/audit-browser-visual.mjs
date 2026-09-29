import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chromePath = process.env.CHROME_PATH;
const password = process.env.V1_ADMIN_PASSWORD;
const cookieFile = process.env.V1_AUDIT_COOKIE_FILE;
const orderId = process.env.V1_AUDIT_ORDER_ID;
if (!chromePath || (!password && !cookieFile) || !orderId) throw new Error('Set the local Chrome path, an audit password or cookie file, and smoke order ID.');

const outputDirectory = join(tmpdir(), 'carpinteria-visual-audit-2026-09-29');
await mkdir(outputDirectory, { recursive: true });
const profileDirectory = await mkdtemp(join(tmpdir(), 'carpinteria-visual-chrome-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--disable-background-mode', '--disable-crash-reporter',
  '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--hide-scrollbars',
  '--remote-debugging-port=0', `--user-data-dir=${profileDirectory}`,
], { windowsHide: true, stdio: 'ignore' });

let browserSocket;
let pageSocket;
let logoutCookie = '';
let nextId = 0;
const pending = new Map();
const connect = (socket) => new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const command = (socket, method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
  pending.set(id, (message) => { clearTimeout(timer); message.error ? reject(new Error(message.error.message)) : resolve(message.result); });
  socket.send(JSON.stringify({ id, method, params }));
});
const listen = (socket) => socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) { const finish = pending.get(message.id); pending.delete(message.id); finish(message); }
});
const waitFor = async (predicate, description) => {
  for (let i = 0; i < 60; i += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${description}`);
};
const evaluate = async (expression, awaitPromise = false) => {
  const result = await command(pageSocket, 'Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const capture = async (name, viewport) => {
  const metrics = await evaluate(`({width: innerWidth, height: innerHeight, scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), page: document.querySelector('.breadcrumb strong')?.innerText.trim() ?? document.querySelector('.login-page h1')?.innerText.trim() ?? 'Seguimiento', horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1})`);
  const shot = await command(pageSocket, 'Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(join(outputDirectory, `${name}-${viewport.width}x${viewport.height}.png`), Buffer.from(shot.data, 'base64'));
  return { name, viewport: `${metrics.width}x${metrics.height}`, page: metrics.page, scrollWidth: metrics.scrollWidth, horizontalOverflow: metrics.horizontalOverflow };
};
const navigate = async (url, description) => {
  await command(pageSocket, 'Page.navigate', { url });
  await waitFor(() => evaluate(`document.readyState === 'complete' && !!document.body.innerText`), description);
};
const clickNav = async (label) => {
  const clicked = await evaluate(`(() => { const item = [...document.querySelectorAll('.side-nav button')].find((button) => button.innerText.includes(${JSON.stringify(label)})); if (!item) return false; item.click(); return true; })()`);
  if (!clicked) throw new Error(`Navigation item not found: ${label}`);
  await waitFor(() => evaluate(`document.querySelector('.breadcrumb strong')?.innerText.trim() === ${JSON.stringify(label)} && !document.querySelector('.loading-state')`), label);
};

try {
  let cookies;
  if (cookieFile) {
    const storedHeaders = JSON.parse(await readFile(cookieFile, 'utf8'));
    cookies = String(storedHeaders.Cookie ?? '').split(/;\s*/).filter(Boolean).map((pair) => {
      const separator = pair.indexOf('=');
      if (separator < 1) throw new Error('The audit cookie file has an invalid Cookie header.');
      return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: 'http://127.0.0.1:8081', path: '/', httpOnly: true, sameSite: 'Strict' };
    });
    if (!cookies.length) throw new Error('The audit cookie file has no cookies.');
  } else {
    const login = await fetch('http://127.0.0.1:8080/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@local.test', password }),
    });
    if (!login.ok) throw new Error(`Local audit login failed with status ${login.status}.`);
    cookies = login.headers.getSetCookie().map((header) => {
      const pair = header.split(';', 1)[0];
      const separator = pair.indexOf('=');
      return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: 'http://127.0.0.1:8081', path: '/', httpOnly: true, sameSite: 'Strict' };
    });
  }
  logoutCookie = cookies.map(({ name, value }) => `${name}=${value}`).join('; ');

  const portPath = join(profileDirectory, 'DevToolsActivePort');
  let debuggingPort;
  for (let i = 0; i < 80; i += 1) {
    try { debuggingPort = Number((await readFile(portPath, 'utf8')).split(/\r?\n/)[0]); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  if (!debuggingPort) throw new Error('Chrome did not open its local debugging port.');
  const browserInfo = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`).then((response) => response.json());
  browserSocket = new WebSocket(browserInfo.webSocketDebuggerUrl);
  await connect(browserSocket); listen(browserSocket);
  const { targetId } = await command(browserSocket, 'Target.createTarget', { url: 'about:blank' });
  const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then((response) => response.json());
  const page = targets.find((target) => target.id === targetId);
  if (!page) throw new Error('Chrome did not create the audit tab.');
  pageSocket = new WebSocket(page.webSocketDebuggerUrl);
  await connect(pageSocket); listen(pageSocket);
  await command(pageSocket, 'Page.enable');
  await command(pageSocket, 'Runtime.enable');
  await command(pageSocket, 'Network.enable');

  const results = [];
  const viewports = [
    { width: 1366, height: 768, mobile: false },
    { width: 768, height: 1024, mobile: true },
    { width: 390, height: 844, mobile: true },
  ];
  for (const viewport of viewports) {
    await command(pageSocket, 'Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
    await navigate('http://127.0.0.1:8081/', 'login screen');
    await waitFor(() => evaluate(`!!document.querySelector('.login-page')`), 'login screen');
    results.push(await capture('login', viewport));
  }

  await command(pageSocket, 'Network.setCookies', { cookies });
  for (const viewport of viewports) {
    await command(pageSocket, 'Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
    await navigate('http://127.0.0.1:8081/', 'workspace dashboard');
    await waitFor(() => evaluate(`!!document.querySelector('.workspace')`), 'authenticated workspace');
    results.push(await capture('dashboard', viewport));
    for (const [name, label] of [['inventory', 'Inventario'], ['orders', 'Pedidos'], ['production-cut', 'Producción']]) {
      await clickNav(label);
      if (name === 'production-cut') await waitFor(() => evaluate(`!!document.querySelector('.cut-card h2')`), 'cutting plan panel');
      results.push(await capture(name, viewport));
    }
  }

  await command(pageSocket, 'Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const order = await evaluate(`fetch('/api/orders/${orderId}').then(async (response) => { if (!response.ok) throw new Error('Audit order could not be read'); return (await response.json()).trackingToken; })`, true);
  if (!order) throw new Error('The V1 smoke order has no tracking token.');
  await navigate(`http://127.0.0.1:8081/seguimiento/${order}`, 'public tracking page');
  await waitFor(() => evaluate(`!!document.querySelector('.tracking-content')`), 'public tracking content');
  results.push(await capture('tracking', { width: 390, height: 844 }));
  process.stdout.write(JSON.stringify({ screenshots: outputDirectory, results }, null, 2));
} finally {
  if (logoutCookie) await fetch('http://127.0.0.1:8080/api/auth/logout', { method: 'POST', headers: { cookie: logoutCookie } }).catch(() => undefined);
  pageSocket?.close();
  browserSocket?.close();
  chrome.kill();
  if (chrome.exitCode === null) await new Promise((resolve) => chrome.once('exit', resolve));
  await rm(profileDirectory, { recursive: true, force: true });
}
