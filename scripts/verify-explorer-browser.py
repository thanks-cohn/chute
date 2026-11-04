"""Real installed Chromium extension, production API and overlay geometry oracle."""
from __future__ import annotations

import io
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chute.explorer import Explorer, RootGrant, Session
from chute.explorer.api import ExplorerAPI
from chute.server import ChuteServer, ChuteHandler
from chute.store import Store
from PIL import Image
from playwright.sync_api import sync_playwright, expect


class FixtureHandler(ChuteHandler):
    def do_GET(self):
        name = self.path.split("?", 1)[0].lstrip("/")
        asset = ROOT / "extension" / name
        if name and ".." not in name and asset.is_file() and asset.resolve().is_relative_to(ROOT / "extension"):
            data = asset.read_bytes()
            import mimetypes
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()


def main():
    fixture_mode = "--fixture" in sys.argv
    paths = [arg for arg in sys.argv[1:] if arg != "--fixture"]
    out = Path(paths[0]) if paths else Path("/tmp/chutey-explorer-browser")
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="chutey-browser-") as temp:
        root = Path(temp)
        fixture = root / "approved"
        fixture.mkdir()
        Image.new("RGB", (400, 240), (190, 40, 90)).save(fixture / "00-picture.png")
        (fixture / "01-document.txt").write_text("safe <script>literal text</script>\n" * 1500)
        (fixture / "02-folder" / "nested").mkdir(parents=True)
        for i in range(80):
            (fixture / f"file-{i:03}.txt").write_text(f"Original bytes {i}")
        store = Store(root / "history")
        store.add_stream("history.txt", io.BytesIO(b"History survives"), 16, mime="text/plain")
        saved_image = (fixture / "00-picture.png").read_bytes()
        store.add_stream("history-real.png", io.BytesIO(saved_image), len(saved_image), mime="image/png")
        server = ChuteServer(("127.0.0.1", 17891), store)
        if fixture_mode:
            server.RequestHandlerClass = FixtureHandler
        engine = Explorer([RootGrant(fixture)])
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                if fixture_mode:
                    browser = playwright.chromium.launch(executable_path=os.environ.get("CHUTE_TEST_CHROME") or shutil.which("chromium"), headless=True, args=["--no-sandbox"])
                    context = browser.new_context()
                    context.add_init_script("""window.chrome = {storage:{local:{get:async d=>Object.assign({},d,window.__local||{}),set:async x=>{window.__local=Object.assign(window.__local||{},x)}},sync:{get:async d=>d},onChanged:{addListener(){}}},runtime:{sendNativeMessage:async()=>({ok:true,token:window.__nativeSessionToken}),sendMessage:async()=>({}),onMessage:{addListener(){}},connectNative(){throw Error('fixture: no native host')}}};""")
                    origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
                    # Test-only transport: real browser/GUI/API, not extension enrollment proof.
                    context.route("http://127.0.0.1:17891/api/explorer/**", lambda route: route.fulfill(response=route.fetch(headers={**route.request.headers, "origin": origin})))
                else:
                    context = playwright.chromium.launch_persistent_context(str(root / "profile"),
                        executable_path=os.environ.get("CHUTE_TEST_CHROME") or playwright.chromium.executable_path,
                        headless=True, ignore_default_args=["--disable-extensions"], args=["--no-sandbox", "--disable-background-networking",
                        f"--disable-extensions-except={ROOT / 'extension'}", f"--load-extension={ROOT / 'extension'}"])
                    worker = context.service_workers[0] if context.service_workers else context.wait_for_event("serviceworker")
                    origin = worker.url.split("/background-entry.js")[0]
                session = Session(origin)
                server.explorer_api = ExplorerAPI(engine, session)
                context.add_init_script("window.__nativeSessionToken = " + json.dumps(session.token) + ";")
                if not fixture_mode:
                    # Browser proof only: real native picker is covered separately on Windows.
                    context.add_init_script("chrome.runtime.sendNativeMessage = async () => ({ok:true, token:window.__nativeSessionToken});")
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(("http://127.0.0.1:17891" if fixture_mode else origin) + "/shelf.html")
                page.locator("#chutey-tab-explorer").click()
                page.get_by_role("button", name="Select folder", exact=True).click()
                try:
                    page.locator(".ex-row").first.wait_for(timeout=8000)
                except Exception:
                    print("GUI errors:", errors)
                    print("Explorer status:", page.locator(".ex-status").inner_text())
                    print("Page URL:", page.url)
                    raise
                expect(page.locator(".ex-icon img").first).to_have_js_property("complete", True)
                expect(page.locator(".ex-icon img").first).to_have_js_property("naturalWidth", 256)
                results = []
                for width in (390, 900):
                    page.set_viewport_size({"width": width, "height": 800})
                    if width == 900:
                        page.get_by_role("button", name="Toggle grid", exact=True).click()
                    page.locator(".ex-preview [data-action=close]").evaluate("node => { if (!node.closest('section').hidden) node.click(); }")
                    metrics = """() => { const list = document.querySelector('.ex-list'); const work = document.querySelector('.ex-workspace'); const rect = list.getBoundingClientRect(); return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,columns:getComputedStyle(list).gridTemplateColumns,scroll:list.scrollHeight,client:list.clientHeight,workHeight:work.getBoundingClientRect().height}; }"""
                    if width == 900:
                        label = page.locator(".ex-row .ex-name").first.bounding_box()
                        assert label and label["height"] >= 16, "Grid filename must remain visible"
                    before = page.evaluate(metrics)
                    page.locator(".ex-row", has_text="00-picture.png").click()
                    expect(page.locator(".ex-preview-body img")).to_have_js_property("naturalWidth", 400)
                    after = page.evaluate(metrics)
                    assert before == after, (before, after)
                    assert after["scroll"] > after["client"]
                    overlap = page.evaluate("""() => {const p=document.querySelector('.ex-preview').getBoundingClientRect(),l=document.querySelector('.ex-list').getBoundingClientRect(); return p.top>l.top && p.top<l.bottom && p.bottom>=l.bottom;}""")
                    assert overlap
                    thumb = page.locator(".ex-row .ex-icon img").first
                    assert thumb.evaluate("node => node.complete && node.naturalWidth > 0")
                    thumb_box = thumb.bounding_box()
                    assert thumb_box and thumb_box["height"] >= 32 and thumb_box["width"] >= 32
                    page.screenshot(path=str(out / f"explorer-{width}.png"), full_page=True)
                    page.get_by_role("button", name="Close preview", exact=True).click()
                    page.locator(".ex-row", has_text="01-document.txt").click()
                    page.locator(".ex-preview-body pre").wait_for()
                    assert page.locator(".ex-preview-body pre").text_content().startswith("safe <script>")
                    scroll = page.evaluate("""() => {const b=document.querySelector('.ex-preview-body'), l=document.querySelector('.ex-list'); const prior=l.scrollTop; b.scrollTop=120; return {document:b.scrollTop, list:l.scrollTop,prior,overflow:b.scrollHeight>b.clientHeight};}""")
                    assert scroll["document"] == 120 and scroll["list"] == scroll["prior"] and scroll["overflow"]
                    page.get_by_role("button", name="Close preview", exact=True).click()
                    row = page.locator(".ex-row", has_text="00-picture.png")
                    row.click(button="right")
                    page.get_by_role("menuitem", name="Properties", exact=True).wait_for()
                    page.keyboard.press("End")
                    assert page.get_by_role("menuitem", name="Properties", exact=True).evaluate("node => node === document.activeElement")
                    page.keyboard.press("Escape")
                    page.locator(".ex-list").evaluate("node => node.scrollTop=100")
                    page.get_by_role("tab", name="History", exact=True).click()
                    page.locator("#files .file-row").first.wait_for()
                    assert "history.txt" in page.locator("#files").inner_text()
                    expect(page.locator("#files .file-icon.has-thumbnail .file-thumb").first).to_be_visible()
                    expect(page.locator("#files .file-icon.has-thumbnail .file-thumb").first).to_have_js_property("complete", True)
                    page.get_by_role("tab", name="File Explorer", exact=True).click()
                    assert page.locator(".ex-list").evaluate("node => node.scrollTop") == 100
                    assert page.locator("#chutey-workspace-tabs button").first.inner_text() == "File Explorer"
                    page.locator(".ex-list").evaluate("node => node.scrollTop=0")
                    results.append({"transport": "fixture; not installed extension" if fixture_mode else "installed extension; native selection simulated", "width": width, "overlay_geometry": "PASS", "thumbnail_original_pixels": "PASS", "document_scroll": "PASS", "history": "PASS including real saved PNG thumbnail", "menu_keyboard": "PASS", "metrics": after})
                assert not errors, errors
                (out / "results.json").write_text(json.dumps(results, indent=2))
                print(json.dumps(results, indent=2))
                context.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
            engine.close()


if __name__ == "__main__":
    main()
