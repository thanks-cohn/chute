"""Real-decoder ordinary-MP4 lifecycle regression, with optional real idle soak.

HTTP transport simulates enrollment only. Installed transport is restricted to
disposable Windows GitHub Actions runners by the existing InstalledWorker guard.
Short runs are not long-duration or owner-hardware certification.
"""
from __future__ import annotations

import argparse
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from chute.server import ChuteServer
from chute.store import Store
from chute.explorer import Explorer, RootGrant, Session
from chute.explorer.api import ExplorerAPI
from PIL import Image
from playwright.sync_api import sync_playwright, expect


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


base = module('base', 'scripts/verify-development1-browser.py')
paired = module('paired', 'scripts/verify-p0-endurance.py')


def until(page, fn, seconds=10):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if fn():
            return
        page.wait_for_timeout(50)
    raise AssertionError('Playback condition did not settle within ' + str(seconds) + 's')


def make_assets(root):
    movie = root / 'clip-a.mp4'
    subprocess.run([
        shutil.which('ffmpeg'), '-v', 'error', '-f', 'lavfi', '-i',
        'testsrc2=size=1280x720:rate=24:duration=10', '-f', 'lavfi', '-i',
        'sine=frequency=440:duration=10', '-vf', 'noise=alls=20:allf=t+u',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-b:v',
        '24M', '-minrate', '24M', '-maxrate', '24M', '-bufsize', '24M',
        '-x264-params', 'nal-hrd=cbr:force-cfr=1', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', str(movie),
    ], check=True)
    assert 28_000_000 <= movie.stat().st_size <= 34_000_000, movie.stat().st_size
    shutil.copyfile(movie, root / 'clip-b.mp4')
    for i in range(4):
        Image.new('RGB', (400, 240), (i * 50, 80, 160)).save(root / f'image-{i}.png')
    child = root / 'child'
    child.mkdir()
    (child / 'document.txt').write_text('small document')
    return movie.stat().st_size


class ProcessMemory(ctypes.Structure):
    _fields_ = [('cb', ctypes.c_ulong), ('faults', ctypes.c_ulong)] + [
        (name, ctypes.c_size_t) for name in ('peak_rss', 'rss', 'peak_pool_paged',
        'pool_paged', 'peak_pool_nonpaged', 'pool_nonpaged', 'pagefile', 'peak_pagefile', 'private')]


def process_memory(pid):
    if os.name != 'nt':
        try:
            values = Path(f'/proc/{pid}/statm').read_text().split()
            return {'rss_bytes': int(values[1]) * os.sysconf('SC_PAGE_SIZE')}
        except (OSError, ValueError, IndexError):
            return {}
    from ctypes import wintypes as W
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
    kernel.OpenProcess.restype = W.HANDLE
    kernel.CloseHandle.argtypes = [W.HANDLE]
    process = kernel.OpenProcess(0x1000, False, pid)
    if not process:
        return {}
    try:
        value = ProcessMemory()
        value.cb = ctypes.sizeof(value)
        psapi = ctypes.WinDLL('psapi', use_last_error=True)
        psapi.GetProcessMemoryInfo.argtypes = [W.HANDLE, ctypes.c_void_p, W.DWORD]
        if psapi.GetProcessMemoryInfo(process, ctypes.byref(value), value.cb):
            return {'rss_bytes': value.rss, 'private_bytes': value.private}
        return {}
    finally:
        kernel.CloseHandle(process)


def exercise(context, page, entry, report, args):
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(entry + '/shelf.html')
    page.get_by_role('tab', name='File Explorer', exact=True).click()
    expect(page.locator('.ex-row')).to_have_count(7)
    if args.transport == 'installed':
        diagnostic = page.evaluate('()=>chrome.runtime.sendMessage({type:"chute-diagnostics"})')
        assert diagnostic and 'recovery' in diagnostic, 'Actual MV3 background did not respond'

    def command(name, values=None):
        return paired.command(page, name, values)

    def preview(name):
        paired.preview(page, name)

    def media_ready():
        node = page.locator('.ex-pinned-body video')
        expect(node).to_be_visible()
        until(page, lambda: node.evaluate('n=>n.readyState>=1'))
        return node

    def cleaned():
        status = command('performance_get')
        return (command('media_diagnostics')['active_leases'] == 0 and
                status['metrics'].get('media', {}).get('active', 0) == 0)

    def stop():
        page.locator('.ex-pinned-body video').evaluate('n=>window.__closedMedia=n')
        page.get_by_role('button', name='Stop playback', exact=True).click()
        until(page, cleaned, 3)
        assert page.evaluate('()=>{const n=window.__closedMedia;return n.paused&&!n.hasAttribute("src")&&n.readyState===0&&!n.isConnected}')
        page.evaluate('()=>{window.__closedMedia=null}')

    cdp = context.browser.new_browser_cdp_session()
    heap = context.new_cdp_session(page)
    started = time.monotonic()

    def sample(label):
        performance = command('performance_get')
        processes = cdp.send('SystemInfo.getProcessInfo')['processInfo']
        totals = {}
        for process in processes:
            for name, value in process_memory(process['id']).items():
                totals[name] = totals.get(name, 0) + value
        row = {'label': label, 'seconds': round(time.monotonic() - started, 3),
               'worker': performance['resources'], 'media_lane': performance['metrics'].get('media', {}),
               'active_leases': command('media_diagnostics')['active_leases'],
               'browser_cdp_process_memory_sum': totals, 'browser_cdp_process_count': len(processes),
               'shelf_js_heap': heap.send('Runtime.getHeapUsage')}
        report['samples'].append(row)
        (args.output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
        return row

    attempts = []

    def fail_once(route):
        if route.request.post_data_json.get('command') == 'preview' and not attempts:
            attempts.append(True)
            route.fulfill(status=429, json={'state': 'failed', 'error': {
                'code': 'BUSY', 'message': 'Simulated metadata BUSY'}})
        else:
            route.fallback()

    page.route('**/api/explorer/v1/command', fail_once)
    preview('clip-a.mp4')
    expect(page.locator('.ex-pinned-body')).to_contain_text('Simulated metadata BUSY')
    preview('clip-a.mp4')
    media = media_ready()
    report['checks'].append('Same-file retry after simulated metadata BUSY')
    # A metadata-only preload is valid while paused: never time out a healthy selection.
    page.wait_for_timeout(10500)
    expect(media).to_be_visible()
    media.evaluate('n=>n.play()')
    until(page, lambda: media.evaluate('n=>n.currentTime>0.3&&!n.paused'))
    media.evaluate('n=>n.pause()')
    assert media.evaluate('n=>n.paused')
    media.evaluate('n=>{n.currentTime=5}')
    until(page, lambda: media.evaluate('n=>!n.seeking&&n.currentTime>=5'))
    media.evaluate('n=>n.play()')
    preview('image-0.png')
    for i in range(4):
        if i:
            page.get_by_role('button', name='Next file', exact=True).click()
        expect(page.locator('.ex-preview-body img')).to_have_js_property('naturalWidth', 400)
    page.get_by_role('button', name='Close preview', exact=True).click()
    before = media.evaluate('n=>n.currentTime')
    page.locator('.ex-row', has=page.locator('.ex-name', has_text='child')).dblclick()
    expect(page.locator('.ex-name')).to_have_text(['document.txt'])
    page.get_by_role('button', name='Parent folder', exact=True).click()
    expect(page.locator('.ex-row')).to_have_count(7)
    until(page, lambda: media.evaluate('n=>n.currentTime') > before)
    media.evaluate('n=>{n.currentTime=n.duration-0.5}')
    until(page, lambda: media.evaluate('n=>n.ended'))
    media.evaluate('n=>n.play()')
    until(page, lambda: media.evaluate('n=>!n.ended&&n.currentTime>0.1&&n.currentTime<3'))
    stop()
    report['checks'].append('30 MB MP4 play, pause, seek, finish, replay; four images and directory browsing during playback')

    # Real failed media GET must release its ticket before diagnostics settle.
    page.route('**/api/explorer/v1/media/*', lambda route: route.abort('failed'))
    preview('clip-a.mp4')
    expect(page.locator('.ex-pinned-player')).to_have_attribute('data-playback-state', 'failed')
    until(page, cleaned, 3)
    page.unroute('**/api/explorer/v1/media/*')
    preview('clip-a.mp4')
    media_ready().evaluate('n=>n.play()')
    stop()
    report['checks'].append('Media GET failure cleans up; selecting the same MP4 retries successfully')

    held = []

    def hold_preview(route):
        if route.request.post_data_json.get('command') == 'preview':
            held.append(route)
        else:
            route.fallback()

    page.route('**/api/explorer/v1/command', hold_preview)
    preview('clip-a.mp4')
    expect(page.locator('.ex-pinned-body')).to_contain_text('Loading media timed out', timeout=12000)
    until(page, cleaned, 3)
    for route in held:
        route.abort()
    page.unroute('**/api/explorer/v1/command', hold_preview)
    preview('clip-a.mp4')
    media_ready()
    stop()
    report['checks'].append('Hung metadata request times out, cancels and permits same-file retry')

    held_sources = []

    def hold_source(route):
        if route.request.post_data_json.get('command') == 'media_source':
            held_sources.append((route, route.fetch()))
        else:
            route.fallback()

    page.route('**/api/explorer/v1/command', hold_source)
    preview('clip-a.mp4')
    until(page, lambda: bool(held_sources))
    page.get_by_role('button', name='Stop playback', exact=True).click()
    for route, response in held_sources:
        route.fulfill(response=response)
    page.unroute('**/api/explorer/v1/command', hold_source)
    until(page, cleaned, 3)
    assert page.locator('.ex-pinned-body video').count() == 0
    report['checks'].append('Ticket arriving after explicit Stop is released without creating a player')

    sample('before_cycles')
    for cycle in range(args.cycles):
        preview('clip-a.mp4' if cycle % 2 == 0 else 'clip-b.mp4')
        node = media_ready()
        node.evaluate('n=>n.play()')
        until(page, lambda: node.evaluate('n=>n.currentTime>0.1'))
        # Replace a live player, then explicitly close the replacement.
        preview('clip-b.mp4' if cycle % 2 == 0 else 'clip-a.mp4')
        media_ready()
        assert command('media_diagnostics')['active_leases'] == 1
        stop()
        page.get_by_role('tab', name='History', exact=True).click()
        page.get_by_role('tab', name='File Explorer', exact=True).click()
        assert page.locator('.ex-pinned-body video').count() == 0
        expect(page.locator('.ex-row')).to_have_count(7)
        sample('closed_cycle_' + str(cycle + 1))
    report['checks'].append(f'{args.cycles} play/switch/close/navigate/return cycles: no orphaned media slots or tickets')

    # Test the small popup's actual local folder UI, not an injected player.
    popup = context.new_page()
    popup.on('pageerror', lambda error: errors.append(str(error)))
    popup.goto(entry + '/popup.html')
    popup.locator('#popup-local-toggle').click()
    popup.get_by_role('button', name='▶ clip-a.mp4', exact=True).click()
    popup_media = popup.locator('.chutey-lightbox-player video')
    until(popup, lambda: popup_media.evaluate('n=>n.readyState>=1'))
    popup_media.evaluate('n=>n.play()')
    until(popup, lambda: popup_media.evaluate('n=>n.currentTime>0.1'))
    popup.keyboard.press('Escape')
    until(page, cleaned, 3)
    popup.get_by_role('button', name='▶ clip-a.mp4', exact=True).click()
    until(popup, lambda: popup.locator('.chutey-lightbox-player video').evaluate('n=>n.readyState>=1'))
    popup.close()
    until(page, cleaned, 3)
    report['checks'].append('Popup local MP4 playback, explicit Escape closure, same-file reopen and page close release resources')

    sample('idle_start')
    idle_start = time.monotonic()
    while time.monotonic() - idle_start < args.idle_seconds:
        page.wait_for_timeout(max(0, min(10000, (args.idle_seconds - (time.monotonic() - idle_start)) * 1000)))
        assert cleaned(), 'Closed media resources returned while Explorer was idle'
        sample('idle')
    report['idle_wall_seconds'] = round(time.monotonic() - idle_start, 3)
    preview('clip-a.mp4')
    media = media_ready()
    media.evaluate('n=>n.play()')
    until(page, lambda: media.evaluate('n=>n.currentTime>0.1'))
    stop()
    page.locator('.ex-row', has=page.locator('.ex-name', has_text='child')).dblclick()
    expect(page.locator('.ex-name')).to_have_text(['document.txt'])
    page.get_by_role('button', name='Parent folder', exact=True).click()
    expect(page.locator('.ex-row')).to_have_count(7)
    sample('replayed_and_browsed_after_idle')
    assert not errors, errors
    report['page_errors'] = errors
    report['checks'].append(f'Closed-player Explorer idle for {report["idle_wall_seconds"]} real seconds with 10-second control sampling; no media tickets or active stream slots; playback and browsing work afterward')
    report['duration_seconds'] = round(time.monotonic() - started, 3)
    report['memory_scope'] = ('Worker is a separate packaged process only for installed transport. Browser memory sums CDP-visible processes; RSS can double count shared pages. Windows private bytes are separately reported. No forced garbage collection or working-set trimming.')
    report['result'] = 'PASS'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path('/tmp/chutey-playback-starter'))
    parser.add_argument('--transport', choices=['http', 'installed'], default='http')
    parser.add_argument('--installer', default='dist/windows/Chute-Windows.exe')
    parser.add_argument('--cycles', type=int, default=12)
    parser.add_argument('--idle-seconds', type=int, default=30)
    args = parser.parse_args()
    assert 1 <= args.cycles <= 1000 and 0 <= args.idle_seconds <= 86400
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {'result': 'RUNNING', 'transport': args.transport, 'checks': [], 'samples': [],
              'scope': 'Real decoder; HTTP fixture simulates Chrome enrollment, not owner Windows acceptance'}
    with tempfile.TemporaryDirectory(prefix='chutey-playback-starter-') as temp:
        root = Path(temp)
        approved = root / 'approved'
        approved.mkdir()
        report['mp4_bytes'] = make_assets(approved)
        installed = paired.InstalledWorker(root, args.installer) if args.transport == 'installed' else None
        server = worker = engine = context = browser = page = None
        try:
            if installed:
                installed.prepare()
            else:
                engine = Explorer([RootGrant(approved)])
                session = Session(base.f.ORIGIN)
                server = ChuteServer(('127.0.0.1', 17891), Store(root / 'store'))
                server.RequestHandlerClass = base.BrowserOriginFixture
                server.explorer_api = ExplorerAPI(engine, session)
                worker = threading.Thread(target=server.serve_forever, daemon=True)
                worker.start()
            with sync_playwright() as p:
                chrome = os.environ.get('CHUTE_TEST_BROWSER') or shutil.which('chromium') or shutil.which('chrome') or r'C:\Program Files\Google\Chrome\Application\chrome.exe'
                flags = ['--no-sandbox']
                if installed:
                    context = p.chromium.launch_persistent_context(str(root / 'profile'), executable_path=chrome,
                        headless=True, ignore_default_args=['--disable-extensions'],
                        args=flags + ['--enable-unsafe-extension-debugging'])
                    registered = context.browser.new_browser_cdp_session().send('Extensions.loadUnpacked', {'path': str(ROOT / 'extension')})
                    entry = 'chrome-extension://' + registered['id']
                    report['installed_pair'] = installed.start(entry, approved)
                    report['scope'] = 'Actual packaged Windows worker, Chrome extension, native messaging; disposable preapproved synthetic folder, not owner machine or picker acceptance'
                else:
                    browser = p.chromium.launch(executable_path=chrome, headless=True, args=flags)
                    context = browser.new_context(viewport={'width': 850, 'height': 800})
                    context.add_init_script(base.f.INIT + '\nwindow.__nativeSessionToken=' + json.dumps(session.token) + ';')
                    entry = 'http://127.0.0.1:17891'
                report['browser'] = context.browser.version
                page = context.new_page()
                try:
                    exercise(context, page, entry, report, args)
                except Exception as error:
                    report['result'] = 'FAIL'
                    report['error'] = str(error)
                    page.screenshot(path=str(args.output / 'failure.png'))
                    raise
                finally:
                    (args.output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
                    print(json.dumps({'result': report['result'], 'checks': report['checks'], 'samples': len(report['samples'])}, indent=2), flush=True)
                    context.close()
                    if browser:
                        browser.close()
        finally:
            if installed:
                installed.close()
            if server:
                server.shutdown()
                server.server_close()
                worker.join()
                engine.close()


if __name__ == '__main__':
    main()
