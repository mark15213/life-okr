import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SWRConfig, useSWRConfig } from 'swr';
import Home from '../../app/page';
import Analytics from '../../app/analytics/page';
import type { DesktopBridge } from '../../lib/useDesktopFocus';
import './styles.css';

const bridge = window.hustle as DesktopBridge;
const networkEvent = 'hustle-network-error';
const browserFetch = window.fetch.bind(window);

// Keep existing UI fetch calls and response semantics. No request can escape the
// main-process allowlist, and mutations are never queued or replayed offline.
window.fetch = async (input, init) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!raw.startsWith('/api/')) return browserFetch(input, init);
  if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const method = init?.method || (input instanceof Request ? input.method : 'GET');
  const body = init?.body === undefined ? (input instanceof Request && method !== 'GET' ? await input.text() : undefined) : String(init.body);
  try {
    const result = await bridge.request({ path: raw, method, body });
    if (result.status >= 400) {
      const message = result.status === 401 ? '请先在看板输入解锁码，再进行记录。' : `服务返回 ${result.status}，本次操作未成功，请重试。`;
      window.dispatchEvent(new CustomEvent(networkEvent, { detail: message }));
    }
    return new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    window.dispatchEvent(new CustomEvent(networkEvent, { detail: '暂时无法连接看板服务。恢复网络后点击刷新；本地番茄仍可使用。' }));
    throw error;
  }
};

function Dashboard() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/');
  const [error, setError] = useState('');
  const { mutate } = useSWRConfig();
  const refresh = () => { setError(''); void mutate(() => true); };
  useEffect(() => {
    const change = () => { setRoute(location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    const failure = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener('hashchange', change);
    window.addEventListener(networkEvent, failure);
    const unrefresh = bridge.onRefresh(() => { window.dispatchEvent(new Event('hustle-auth-changed')); void mutate(() => true); });
    return () => { window.removeEventListener('hashchange', change); window.removeEventListener(networkEvent, failure); unrefresh(); };
  }, [mutate]);
  // A failed request shows one quiet line and takes itself away; the page already refreshes on focus.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 8000);
    return () => clearTimeout(timer);
  }, [error]);
  return <>
    {error && <div className="desktop-network" role="status"><span>{error}</span><button onClick={refresh}>重试</button></div>}
    {route === '/analytics' ? <Analytics /> : <Home />}
  </>;
}

createRoot(document.getElementById('root')!).render(
  <SWRConfig value={{ shouldRetryOnError: false, revalidateOnFocus: true }}><Dashboard /></SWRConfig>
);
