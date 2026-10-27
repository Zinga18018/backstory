import { captureActiveTab } from './capture.js';
import { createRepository } from './core/storage.js';

const status = document.querySelector('#popup-status');
const capture = document.querySelector('#capture');
const open = document.querySelector('#open-workspace');
const repository = createRepository(chrome.storage.local);

async function openWorkspace(hash = '') {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`app.html${hash}`) });
  window.close();
}

open.addEventListener('click', () => openWorkspace().catch(error => { status.textContent = error.message; }));
capture.addEventListener('click', async () => {
  capture.disabled = true;
  open.disabled = true;
  status.textContent = 'Reading only the current link and selected text…';
  try {
    const context = await captureActiveTab(chrome);
    const draft = await repository.saveCapture(context);
    status.textContent = 'Capture saved locally. Opening your notes…';
    await openWorkspace(`#capture=${encodeURIComponent(draft.id)}`);
  } catch (error) {
    status.textContent = error.message || 'Capture could not finish. Please reopen the popup and try again.';
    capture.disabled = false;
    open.disabled = false;
  }
});
