"""Windows CI only: compare actual helper bytes and exercise framed native RPC."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys


def main():
    installed, bundled = map(Path,sys.argv[1:3])
    with installed.open('rb') as left, bundled.open('rb') as right:
        if hashlib.file_digest(left,'sha256').digest()!=hashlib.file_digest(right,'sha256').digest():
            raise RuntimeError('Installed helper does not match this test pair')
    body=json.dumps({'action':'get_native_capabilities'}).encode()
    result=subprocess.run([str(installed),'chrome-extension://hpcpnigfadojjmnbflfhkfkallfafajb/'],
        input=struct.pack('<I',len(body))+body,capture_output=True,timeout=20)
    if result.returncode or len(result.stdout)<4:
        raise RuntimeError('Packaged native helper did not return a framed receipt')
    length=struct.unpack('<I',result.stdout[:4])[0]
    if length>1048576 or len(result.stdout)!=length+4:
        raise RuntimeError('Invalid packaged native receipt framing')
    receipt=json.loads(result.stdout[4:])
    if not receipt.get('ok') or receipt.get('explorer_protocol')!='1.1' or not receipt.get('persistent_consent'):
        raise RuntimeError('Packaged native helper protocol mismatch')
    print('PASS: independently matched helper SHA-256 and framed Explorer 1.1 native handshake')


if __name__=='__main__':main()
