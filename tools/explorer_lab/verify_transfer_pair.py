"""Tiny original-byte roundtrip receipt from the production engines, no providers."""
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'src'))
from chute.explorer import Explorer, RootGrant
from chute.explorer.transfers import Transfers, receive
from chute.store import Store
from PIL import Image


def pdf():
    data=b'%PDF-1.4\n'; offsets=[0]
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
             b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Resources << >> /Contents 4 0 R >>',
             b'<< /Length 0 >>\nstream\nendstream']
    for index,body in enumerate(objects,1):
        offsets.append(len(data)); data+=f'{index} 0 obj\n'.encode()+body+b'\nendobj\n'
    xref=len(data); data+=b'xref\n0 5\n0000000000 65535 f \n'
    for offset in offsets[1:]: data+=f'{offset:010d} 00000 n \n'.encode()
    return data+f'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()


def main():
    out=Path(sys.argv[1]); out.parent.mkdir(parents=True,exist_ok=True)
    image=io.BytesIO(); Image.new('RGB',(2,2),(20,40,60)).save(image,format='PNG')
    fixtures=[('tiny.png',image.getvalue()),('tiny.pdf',pdf()),('tiny.txt',b'Tiny original text.\n')]
    results=[]
    with tempfile.TemporaryDirectory(prefix='chute-byte-receipt-') as temp:
        root=Path(temp); (root/'source').mkdir(); (root/'destination'/'nested').mkdir(parents=True)
        source=RootGrant(root/'source'); destination=RootGrant(root/'destination',writable=True)
        engine=Explorer([source,destination]); transfers=Transfers(engine); store=Store(root/'live')
        try:
            for name,data in fixtures:
                (root/'source'/name).write_bytes(data)
                row=next(row for row in engine.execute('list',handle=source.id)['result']['entries'] if row['name']==name)
                prepared=transfers.prepare(row['handle'],row['identity'])
                exported=transfers.to_live(prepared['capability'],store)
                _,live=store.get(exported['file']['id'])
                with live.open('rb') as stream:
                    receipt=receive(destination,destination.handle(('nested',)),name,stream,len(data),expected_sha256=exported['sha256'])
                target=root/'destination'/'nested'/receipt['name']
                expected=hashlib.sha256((root/'source'/name).read_bytes()).hexdigest()
                live_hash=hashlib.sha256(live.read_bytes()).hexdigest()
                final=hashlib.sha256(target.read_bytes()).hexdigest()
                assert expected==live_hash==final==receipt['sha256']
                assert target.name==name and target.parent==root/'destination'/'nested'
                results.append({'class':'PYTHON_ENGINE','direction':'local_explorer -> Live -> approved nested directory',
                    'fixture':name,'size':len(data),'source_sha256':expected,'live_sha256':live_hash,
                    'destination_sha256':final,'exact_name':'PASS','exact_directory':'PASS',
                    'source_preserved':True,'operation':'copy','state':receipt['state']})
        finally: engine.close()
    out.write_text(json.dumps(results,indent=2)+'\n'); print('PASS: three independently hashed tiny original-byte roundtrips')


if __name__=='__main__':main()
