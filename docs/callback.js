'use strict';
(() => {
  const q = new URLSearchParams(location.search);
  const code = q.get('code'); const state = q.get('state'); const error = q.get('error');
  // Clear URL immediately; all output goes through textContent, never HTML.
  history.replaceState(null, '', location.pathname);
  const message = document.getElementById('message'); const button = document.getElementById('open');
  if (error) { message.textContent = 'Connexion annulée ou refusée. Recommence depuis Obsidian.'; return; }
  if (!code || !state || code.length > 4096 || !/^[A-Za-z0-9_-]{43}$/.test(state)) { message.textContent = 'Commence la connexion depuis les paramètres de GSync Personal dans Obsidian.'; return; }
  const url = 'obsidian://gsync-personal-auth?' + new URLSearchParams({code,state}).toString();
  button.href=url; button.hidden=false; button.textContent='Revenir à Obsidian';
  message.textContent='Connexion Google terminée. Clique ci-dessous pour revenir au coffre ouvert.';
})();
