"""Clipboard adapter contracts; OS calls separated from guarded file authority."""
import io,os,struct
from pathlib import Path
import pytest
from PIL import Image
from chute.explorer import Explorer,RootGrant
from chute.explorer.clipboard import Clipboard,CF_HDROP,CF_DIB,CF_DIBV5,dropfiles,image_formats
from chute.explorer.protocol import ExplorerError

class MemoryClipboard:
    def __init__(self):self.formats={};self.paths=[];self.sequence=0
    def write(self,formats):
        self.formats=formats;self.sequence+=1
        if CF_HDROP in formats:self.paths=formats[CF_HDROP][20:].decode('utf-16le').rstrip('\0').split('\0')
        return {'verified':True,'sequence':self.sequence}
    def read_paths(self):return self.sequence,self.paths

@pytest.fixture
def clipboard(tmp_path):
    root=tmp_path/'approved';root.mkdir();(root/'é test.txt').write_bytes(b'original bytes')
    engine=Explorer([RootGrant(root)]);driver=MemoryClipboard();module=Clipboard(engine,driver=driver)
    rows=engine.execute('list',handle=next(iter(engine.grants)))['result']['entries']
    yield root,engine,driver,module,rows[0]
    module.close();engine.close()

def test_copy_files_is_actual_hdrop_and_retains_internal_identity(clipboard):
    root,engine,driver,module,row=clipboard
    copied=module.copy_files([{k:row[k] for k in ('handle','identity')}],user_gesture=True)
    assert copied['state']=='COPIED' and copied['kind']=='windows_file_list' and copied['verified']
    assert driver.paths==[str(root/'é test.txt')]
    assert driver.formats[CF_HDROP][:20]==struct.pack('<IiiII',20,0,0,0,1)
    assert driver.formats[CF_HDROP].endswith(b'\0\0\0\0')
    assert (root/'é test.txt').read_bytes()==b'original bytes'
    assert str(root) not in repr(copied)

def test_windows_paste_uses_private_scoped_snapshot_not_browseable_path_grant(clipboard,tmp_path):
    root,engine,driver,module,row=clipboard
    imported=tmp_path/'outside';imported.mkdir();source=imported/'Windows copy.txt';source.write_bytes(b'OS-selected source')
    driver.paths=[str(source)];before=set(engine.grants)
    snapshot=module.read_files(user_gesture=True)
    assert set(engine.grants)==before
    assert snapshot['files'][0]['name']=='Windows copy.txt' and 'handle' not in snapshot['files'][0]
    assert str(imported) not in repr(snapshot)
    for _ in range(2):
        with module.read(snapshot['snapshot'],0) as (meta,stream):assert stream.read()==b'OS-selected source'
    source.write_bytes(b'different source data')
    with pytest.raises(ExplorerError) as changed:
        with module.read(snapshot['snapshot'],0):pass
    assert changed.value.code=='FILE_CHANGED'
    module.release(snapshot['snapshot'])
    with pytest.raises(ExplorerError):
        with module.read(snapshot['snapshot'],0):pass

def test_clipboard_requires_explicit_gesture_and_valid_identity(clipboard):
    root,engine,driver,module,row=clipboard
    with pytest.raises(ExplorerError):module.copy_files([{k:row[k] for k in ('handle','identity')}])
    with pytest.raises(ExplorerError):module.read_files()
    with pytest.raises(ExplorerError):module.copy_files([{'path':str(root/'é test.txt')}],user_gesture=True)
    with pytest.raises(ExplorerError):module.copy_files([{'handle':row['handle'],'identity':'wrong'}],user_gesture=True)
    assert not driver.formats

def test_pixels_include_actual_dib_v5_alpha_and_png(clipboard):
    root,engine,driver,module,row=clipboard
    image=root/'alpha.png';Image.new('RGBA',(12,7),(10,80,150,99)).save(image)
    item=next(r for r in engine.execute('list',handle=next(iter(engine.grants)))['result']['entries'] if r['name']=='alpha.png')
    result=module.copy_image(item['handle'],item['identity'],user_gesture=True)
    assert result['kind']=='windows_image_pixels' and result['width']==12 and result['height']==7
    assert struct.unpack_from('<IiiHHI',driver.formats[CF_DIBV5])==(124,12,-7,1,32,3)
    assert driver.formats[CF_DIBV5][124:128]==bytes((150,80,10,99))
    with Image.open(io.BytesIO(driver.formats['PNG'])) as decoded:assert decoded.getpixel((0,0))==(10,80,150,99)
    with Image.open(io.BytesIO(b'BM'+struct.pack('<IHHI',14+len(driver.formats[CF_DIB]),0,0,54)+driver.formats[CF_DIB])) as decoded:assert decoded.size==(12,7)
    assert b'http://127.0.0.1' not in driver.formats[CF_DIBV5]

def test_snapshot_expiry_and_metadata_limit(clipboard):
    root,engine,driver,module,row=clipboard
    driver.paths=[str(root/'é test.txt')];now=[100];module.clock=lambda:now[0]
    result=module.read_files(user_gesture=True);now[0]=401
    with pytest.raises(ExplorerError) as expired:
        with module.read(result['snapshot'],0):pass
    assert expired.value.code=='CLIPBOARD_EXPIRED'
    # Browser data cannot pass an arbitrary path through the file-copy operation.
    with pytest.raises(ExplorerError):module.copy_files([{'handle':row['handle'],'identity':row['identity'],'path':'/etc/passwd'}],user_gesture=True)

@pytest.mark.skipif(os.name!='nt',reason='Native Windows clipboard test')
def test_real_windows_clipboard_round_trip_and_guarded_file_import(tmp_path):
    root=tmp_path/'approved';root.mkdir();path=root/'é Windows clipboard.txt';path.write_bytes(b'actual Windows file source')
    image=root/'pixels.png';Image.new('RGBA',(20,14),(30,100,190,128)).save(image)
    engine=Explorer([RootGrant(root)]);module=Clipboard(engine)
    try:
        rows=engine.execute('list',handle=next(iter(engine.grants)))['result']['entries'];row=next(r for r in rows if r['name']==path.name)
        result=module.copy_files([{k:row[k] for k in ('handle','identity')}],user_gesture=True)
        assert result['verified']
        snapshot=module.read_files(user_gesture=True)
        with module.read(snapshot['snapshot'],0) as (_,source):assert source.read()==path.read_bytes()
        picture=next(r for r in rows if r['name']==image.name)
        assert module.copy_image(picture['handle'],picture['identity'],user_gesture=True)['verified']
        # Pillow uses the real Win32 clipboard reader rather than module output.
        from PIL import ImageGrab
        pasted=ImageGrab.grabclipboard()
        assert isinstance(pasted,Image.Image) and pasted.size==(20,14)
        assert pasted.convert('RGB').getpixel((0,0)) in {(30,100,190),(142,177,222)}
    finally:module.close();engine.close()

def test_large_image_limit_is_rejected_before_clipboard_mutation(clipboard):
    root,engine,driver,module,row=clipboard
    path=root/'oversized.png';Image.new('RGB',(4000,3000),(4,5,6)).save(path)
    large=next(r for r in engine.execute('list',handle=next(iter(engine.grants)))['result']['entries'] if r['name']==path.name)
    with pytest.raises(ExplorerError) as rejected:module.copy_image(large['handle'],large['identity'],user_gesture=True)
    assert rejected.value.code=='CLIPBOARD_IMAGE_LIMIT' and driver.formats=={}

def test_revoked_and_missing_sources_cannot_be_copied(clipboard):
    root,engine,driver,module,row=clipboard
    (root/'é test.txt').unlink()
    with pytest.raises((OSError,ExplorerError)):module.copy_files([{k:row[k] for k in ('handle','identity')}],user_gesture=True)
    assert not driver.formats

def test_versioned_dispatch_rejects_extra_browser_paths_and_unknown_versions(clipboard):
    root,engine,driver,module,row=clipboard
    with pytest.raises(ExplorerError) as bad:module.dispatch('clipboard_copy_files',{'files':[],'user_gesture':True,'path':'C:\\unapproved'})
    assert bad.value.code=='INVALID_ARGUMENT'
    with pytest.raises(ExplorerError) as version:module.dispatch('clipboard_read_files',{'user_gesture':True,'version':2})
    assert version.value.code=='UNSUPPORTED_VERSION'
    result=module.dispatch('clipboard_copy_files',{'files':[{k:row[k] for k in ('handle','identity')}],'user_gesture':True,'version':1})
    assert result['version']==1 and result['kind']=='windows_file_list'
