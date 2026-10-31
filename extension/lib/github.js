// Sube archivos a un repositorio de GitHub en un único commit (API de Git).
// El token se guarda solo en el almacenamiento local de la extensión.

const API = 'https://api.github.com';

async function gh(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* sin cuerpo */ }
    if (res.status === 409 && /empty/i.test(detail)) {
      throw new Error('El repositorio de GitHub está vacío. Primero hay que subir el código de la liga (la web y la GitHub Action); después ya se pueden publicar resultados.');
    }
    const hint = res.status === 401 ? ' (token no válido o caducado)'
      : res.status === 403 || res.status === 404 ? ' (revisa el usuario, el repositorio y que el token tenga permiso "Contents: Read and write" en ese repo)'
      : res.status === 409 ? ' (alguien ha cambiado el repositorio a la vez; vuelve a pulsar Publicar)'
      : '';
    throw new Error(`GitHub ${res.status}${hint}${detail && !hint ? `: ${detail}` : ''}`);
  }
  return res.json();
}

/**
 * @param {{owner:string, repo:string, branch:string, token:string}} target
 * @param {Record<string,string>} files  ruta → contenido de texto
 * @returns {Promise<{changed:boolean, commit?:string}>}
 */
export async function commitFiles(target, files, message) {
  const { owner, repo, branch, token } = target;
  const base = `/repos/${owner}/${repo}`;
  const ref = await gh(token, 'GET', `${base}/git/ref/heads/${encodeURIComponent(branch)}`);
  const parent = await gh(token, 'GET', `${base}/git/commits/${ref.object.sha}`);
  const tree = await gh(token, 'POST', `${base}/git/trees`, {
    base_tree: parent.tree.sha,
    tree: Object.entries(files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })),
  });
  if (tree.sha === parent.tree.sha) return { changed: false };
  const commit = await gh(token, 'POST', `${base}/git/commits`, { message, tree: tree.sha, parents: [parent.sha] });
  await gh(token, 'PATCH', `${base}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });
  return { changed: true, commit: commit.html_url };
}
