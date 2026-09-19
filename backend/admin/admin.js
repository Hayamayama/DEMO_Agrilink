const $ = (id) => document.getElementById(id);
const message = $('message');
function say(text, error = false) { message.textContent = text; message.className = error ? 'error' : ''; }
async function api(path, init = {}) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json', ...(init.headers || {}) }, ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error?.message || 'Request failed.');
  return data;
}
function showDashboard(show) { $('login').hidden = show; $('dashboard').hidden = !show; }
function safe(text) { const d = document.createElement('span'); d.textContent = text ?? ''; return d.innerHTML; }
async function load() {
  const [session, catalog, members] = await Promise.all([api('/api/admin/session'), api('/api/admin/catalog'), api('/api/admin/users')]);
  const setting = Object.fromEntries(catalog.settings.map((s) => [s.key, s.value]));
  $('maintenance').checked = setting.maintenance_mode === true;
  $('welcome').value = setting.welcome_message || '';
  $('users').innerHTML = `<table><thead><tr><th>Name</th><th>Village / region</th><th>Language</th><th>Joined</th><th>Status</th></tr></thead><tbody>${members.users.map((u) => `<tr><td>${safe(u.displayName)}</td><td>${safe(u.village)}<br><small>${safe(u.regionName)}</small></td><td>${safe(u.language)}</td><td>${new Date(u.createdAt).toLocaleDateString()}</td><td><button class="${u.status === 'active' ? 'warning' : ''}" data-id="${u.id}" data-status="${u.status === 'active' ? 'suspended' : 'active'}">${u.status === 'active' ? 'Suspend' : 'Restore'}</button></td></tr>`).join('')}</tbody></table>`;
  $('users').querySelectorAll('button[data-id]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm(`${button.dataset.status === 'suspended' ? 'Suspend' : 'Restore'} this account?`)) return;
    try { await api(`/api/admin/users/${button.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.status }) }); await load(); say('Member updated.'); } catch (err) { say(err.message, true); }
  }));
  showDashboard(true); say(`Signed in as ${session.user.displayName}.`);
}
$('loginButton').addEventListener('click', async () => { try { await api('/api/auth/login', { method:'POST', body:JSON.stringify({ phone:$('phone').value, pin:$('pin').value }) }); await load(); } catch (err) { say(err.message, true); } });
$('refresh').addEventListener('click', () => load().catch((err) => say(err.message, true)));
$('logout').addEventListener('click', async () => { await api('/api/auth/logout', { method:'POST', body:'{}' }); showDashboard(false); say('Signed out.'); });
$('saveSettings').addEventListener('click', async () => { try { await Promise.all([api('/api/admin/settings/maintenance_mode',{method:'PUT',body:JSON.stringify({value:$('maintenance').checked})}),api('/api/admin/settings/welcome_message',{method:'PUT',body:JSON.stringify({value:$('welcome').value})})]); say('Settings saved.'); } catch (err) { say(err.message, true); } });
api('/api/admin/session').then(() => load()).catch(() => showDashboard(false));
