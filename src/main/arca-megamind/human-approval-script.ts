export function buildHumanApprovalScript(origin: string, path: string, body?: unknown): string {
  // Auth is read and used inside the pinned guest; only selected public fields leave it.
  return `(async () => {
    if (location.origin !== ${JSON.stringify(origin)}) return null;
    let auth; try { auth = JSON.parse(localStorage.getItem('pocketbase_auth') || 'null'); } catch { return null; }
    if (!auth?.token) return null;
    const response = await fetch(${JSON.stringify(path)}, {
      method: ${JSON.stringify(body === undefined ? 'GET' : 'POST')}, redirect: 'error',
      headers: { Authorization: auth.token, 'Content-Type': 'application/json' },
      ${body === undefined ? '' : `body: ${JSON.stringify(JSON.stringify(body))},`}
      signal: AbortSignal.timeout(15000)
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('Megamind request failed');
    const data = await response.json();
    return ${body === undefined ? 'Array.isArray(data.items) ? data.items.map(item => ({id: item.id, summary: item.summary, relevant: item.owner === (auth.record?.id ?? auth.model?.id)})) : []' : "'ok'"};
  })()`
}
