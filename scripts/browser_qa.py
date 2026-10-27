#!/usr/bin/env python3
"""Isolated Chromium extension QA. Needs Python Playwright and Chromium; no real user profile.
All HTTP(S) requests are blocked. Fixtures are synthetic, never a user's private code.
"""
import hashlib
import json
import os
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / 'extension'
ARTIFACTS = ROOT / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
EXTENSION_ID = ''.join(chr(ord('a') + int(c, 16)) for c in hashlib.sha256(str(EXTENSION).encode()).hexdigest()[:32])
BASE = f'chrome-extension://{EXTENSION_ID}'
checks = []
errors = []

def passed(label):
    checks.append(label)
    print('PASS:', label, flush=True)

with sync_playwright() as playwright, tempfile.TemporaryDirectory(prefix='backstory-qa-') as profile:
    context = playwright.chromium.launch_persistent_context(
        profile, executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True,
        ignore_default_args=['--disable-extensions'],
        args=['--no-sandbox', f'--disable-extensions-except={EXTENSION}', f'--load-extension={EXTENSION}'],
        viewport={'width': 1440, 'height': 1000}, accept_downloads=True,
    )
    context.route('http://**/*', lambda route: route.abort())
    context.route('https://**/*', lambda route: route.abort())
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/app.html')
    expect(page.get_by_role('heading', name='Good work deserves a backstory.')).to_be_visible()
    page.screenshot(path=ARTIFACTS / 'empty.png', full_page=True)
    assert page.evaluate('() => typeof navigator.locks.request') == 'function'
    passed('Unpacked MV3 extension loads with real chrome.storage and Web Locks')
    page.get_by_role('button', name='+ New evidence card').click()
    page.locator('#title').fill('Fixing a checkout race — QA fixture')
    page.locator('#url').fill('https://github.com/example/fixture/pull/42?token=drop-this#discussion')
    page.locator('#snippet').fill('<script>window.injected = true</script>\nconst claim = `real code`;')
    for field, text in {
        'problem': 'Two requests could reserve the last item.',
        'approach': 'Used an atomic database update; rejected a client-only lock.',
        'failure': 'The first in-memory lock failed across workers.',
        'contribution': 'I implemented the conditional update and concurrency test.',
        'evidence': 'Synthetic QA note: test fixture verifies only this UI, not a real project claim.',
    }.items(): page.locator('#' + field).fill(text)
    page.get_by_role('button', name='Save evidence card', exact=True).click()
    expect(page.get_by_role('heading', name='The details are here.')).to_be_visible()
    expect(page.locator('#app-status')).to_contain_text('Saved on this device')
    assert page.evaluate('() => window.injected') is None
    assert page.locator('.source-link').get_attribute('href') == 'https://github.com/example/fixture/pull/42#discussion'
    expect(page.locator('.practice-list li')).to_have_count(7)
    page.locator('summary').click()
    expect(page.locator('pre')).to_contain_text('<script>')
    page.screenshot(path=ARTIFACTS / 'saved-card.png', full_page=True)
    passed('Save full card, strip query, safely render code, presence checks and seven deterministic prompts')
    page.reload()
    expect(page.get_by_role('heading', name='Fixing a checkout race — QA fixture')).to_be_visible()
    passed('Card persists across page reload')
    page.get_by_role('button', name='Edit this card').click()
    page.locator('#problem').fill('Changed but not saved')
    page.once('dialog', lambda dialog: dialog.dismiss())
    page.get_by_role('button', name='Cancel', exact=True).click()
    expect(page.locator('#problem')).to_have_value('Changed but not saved')
    page.once('dialog', lambda dialog: dialog.accept())
    page.get_by_role('button', name='Cancel', exact=True).click()
    expect(page.locator('.story-section').first).to_contain_text('Two requests')
    passed('Cancel/dismiss preserve unsaved input; confirmed cancel restores saved content')
    page.get_by_role('button', name='Edit this card').click()
    page.locator('#evidence').fill('')
    page.get_by_role('button', name='Save evidence card', exact=True).click()
    expect(page.get_by_role('heading', name='1 detail to revisit.')).to_be_visible()
    page.locator('#filter').select_option('complete')
    expect(page.locator('#card-list')).to_contain_text('No cards match')
    page.locator('#filter').select_option('gaps')
    expect(page.locator('.list-card')).to_have_count(1)
    page.locator('#search').fill('not-a-match')
    expect(page.locator('#card-list')).to_contain_text('No cards match')
    page.locator('#search').fill('atomic')
    expect(page.locator('.list-card')).to_have_count(1)
    page.locator('#search').fill('')
    passed('Edit, missing-evidence flag, filtering, and search across note text')
    for name, extension in [('Export JSON', 'json'), ('Export Markdown', 'md')]:
        with page.expect_download() as info: page.get_by_role('button', name=name, exact=True).click()
        downloaded = info.value
        downloaded.save_as(ARTIFACTS / ('export.' + extension))
        assert downloaded.failure() is None
    exported = json.loads((ARTIFACTS / 'export.json').read_text())
    assert len(exported['cards']) == 1
    assert exported['cards'][0]['revision'] == 2
    assert '<script>' in exported['cards'][0]['snippet']
    assert 'Practice questions' in (ARTIFACTS / 'export.md').read_text()
    passed('Real browser JSON and Markdown downloads with saved revisions')
    page.get_by_role('button', name='How your data is handled').click()
    expect(page.locator('#privacy-dialog')).to_be_visible()
    page.keyboard.press('Escape')
    expect(page.locator('#privacy-dialog')).not_to_be_visible()
    passed('Privacy dialog keyboard dismissal')
    # Concurrent real extension pages must not overwrite a stale edit.
    second = context.new_page()
    second.on('pageerror', lambda error: errors.append(str(error)))
    second.goto(BASE + '/app.html')
    second.get_by_role('button', name='Edit this card').click()
    page.get_by_role('button', name='Edit this card').click()
    page.locator('#problem').fill('Saved in the first window')
    page.get_by_role('button', name='Save evidence card', exact=True).click()
    expect(page.locator('#app-status')).to_contain_text('Saved on this device')
    second.locator('#problem').fill('Stale second-window text')
    second.get_by_role('button', name='Save evidence card', exact=True).click()
    expect(second.locator('#app-status')).to_contain_text('changed in another window')
    expect(second.locator('#problem')).to_have_value('Stale second-window text')
    second.once('dialog', lambda dialog: dialog.accept())
    second.close(run_before_unload=True)
    passed('Real cross-window optimistic conflict protects saved and unsaved versions')
    # Seed an explicit synthetic capture through the real repository; no network or scraping.
    capture_id = page.evaluate("""async () => {
      const {createRepository} = await import('./core/storage.js');
      return (await createRepository(chrome.storage.local).saveCapture({title:'Synthetic selected code',url:'https://github.com/example/fixture/blob/main/test.js#L1',snippet:'test(true)',truncated:true})).id;
    }""")
    page.goto(BASE + '/app.html#capture=' + capture_id)
    expect(page.locator('#snippet')).to_have_value('test(true)')
    expect(page.locator('#app-status')).to_contain_text('was shortened')
    page.get_by_role('button', name='Cancel', exact=True).click()
    expect(page.locator('#capture-list')).to_contain_text('Synthetic selected code')
    page.locator('#capture-list button').click()
    page.once('dialog', lambda dialog: dialog.accept())
    page.get_by_role('button', name='Discard capture').click()
    expect(page.locator('#captures-section')).to_be_hidden()
    passed('Recover/cancel/discard unfinished captures, with explicit truncation warning')
    page.locator('.list-card').click()
    page.set_viewport_size({'width': 650, 'height': 900})
    assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=ARTIFACTS / 'narrow.png', full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    passed('Narrow responsive layout has no horizontal overflow')
    page.once('dialog', lambda dialog: dialog.dismiss())
    page.get_by_role('button', name='Delete', exact=True).click()
    expect(page.locator('.list-card')).to_have_count(1)
    page.once('dialog', lambda dialog: dialog.accept())
    page.get_by_role('button', name='Delete', exact=True).click()
    expect(page.get_by_role('heading', name='Good work deserves a backstory.')).to_be_visible()
    expect(page.get_by_role('button', name='Export JSON')).to_be_disabled()
    page.reload()
    expect(page.locator('.list-card')).to_have_count(0)
    passed('Delete cancel/confirm and persistent empty state')
    popup = context.new_page()
    popup.goto(BASE + '/popup.html')
    popup.get_by_role('button', name='Capture this GitHub page').click()
    expect(popup.locator('#popup-status')).to_contain_text('Open a repository page')
    expect(popup.locator('#capture')).to_be_enabled()
    popup.screenshot(path=ARTIFACTS / 'popup.png', full_page=True)
    passed('Popup rejects unsupported current page and recovers its button state')
    assert not errors, errors
    passed('No uncaught page errors across browser flows')
    version = context.browser.version
    context.close()

report = {'browser': version, 'checks': checks, 'uncaughtErrors': errors,
          'limitations': ['Toolbar activeTab grant on real github.com not exercised; capture API orchestration and DOM selection tested with fixtures.', 'No external network, user profile, secrets, AI calls, or Chrome Web Store installation used.']}
(ARTIFACTS / 'qa-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
