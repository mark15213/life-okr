const DEFAULT_SERVER = 'https://hustle-beta-i.vercel.app';

function serverURL(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new Error('请使用 HTTPS 看板地址（本机可用 http://localhost）');
  }
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('请输入看板根地址');
  return url.origin;
}

// This is a finite application API, not a general network proxy. Auth cookies and
// backend credentials stay in the main process and never enter renderer snapshots.
function validateRequest(input) {
  if (!input || typeof input.path !== 'string' || input.path.length > 2048) throw new Error('无效请求');
  const url = new URL(input.path, 'https://desktop.invalid');
  if (url.origin !== 'https://desktop.invalid' || !input.path.startsWith('/api/') || url.hash || input.path.includes('\\')) throw new Error('不允许的接口地址');
  const method = input.method || 'GET';
  const routes = {
    '/api/auth/session': ['GET'], '/api/auth/unlock': ['POST'],
    '/api/records': ['GET'], '/api/records/today': ['GET'], '/api/records/categories': ['GET'],
    '/api/records/cigarette': ['POST'], '/api/records/exercise': ['POST'],
    '/api/records/focus': ['POST'], '/api/records/task': ['POST'], '/api/records/backfill': ['POST'],
    '/api/tokens': ['GET'], '/api/vault': ['GET', 'POST', 'DELETE'],
    '/api/ticktick/tasks': ['GET', 'POST'], '/api/ticktick/sync': ['POST'],
  };
  const allowed = routes[url.pathname] || (/^\/api\/ticktick\/tasks\/[a-zA-Z0-9_-]+\/(complete|wont-do)$/.test(url.pathname) ? ['POST'] : []);
  if (!allowed.includes(method)) throw new Error('不允许的接口操作');
  if (input.body !== undefined && (typeof input.body !== 'string' || Buffer.byteLength(input.body) > 100000)) throw new Error('请求内容过大或无效');
  if (method === 'GET' && input.body) throw new Error('读取接口不接受请求体');
  if (input.body) JSON.parse(input.body);
  return { path: url.pathname + url.search, method, body: input.body };
}

module.exports = { DEFAULT_SERVER, serverURL, validateRequest };
