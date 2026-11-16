"""Read-only approved-session example client; never enrolls or broadens access."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import re
from urllib.request import Request, build_opener, ProxyHandler

class Client:
    def __init__(self, origin, token, port=17891):
        if not re.fullmatch(r'chrome-extension://[a-p]{32}',origin):
            raise ValueError('An exact enrolled extension origin is required.')
        if not token: raise ValueError('Set CHUTE_SESSION_TOKEN securely before running.')
        if not 1 <= port <= 65535: raise ValueError('Invalid port.')
        self.base=f'http://127.0.0.1:{port}'
        self.headers={'Origin':origin,'Authorization':'Bearer '+token,'Content-Type':'application/json'}
        self.opener=build_opener(ProxyHandler({}))
    def request(self, path, body=None, headers=None):
        if not path.startswith('/api/explorer/v1/'): raise ValueError('Unexpected API path.')
        return self.opener.open(Request(self.base+path,json.dumps(body).encode() if body is not None else None,
            {**self.headers,**(headers or {})}),timeout=15)
    def command(self,name,args=None):
        with self.request('/api/explorer/v1/command',{'command':name,'args':args or {}}) as response:
            receipt=json.load(response)
        if receipt.get('state')!='completed': raise RuntimeError(receipt.get('error',{}).get('code','COMMAND_FAILED'))
        return receipt['result']
    def thumbnail(self,handle):
        row=self.command('preview',{'handle':handle})
        with self.request('/api/explorer/v1/content',{'handle':row['handle'],'identity':row['identity'],'thumbnail':True}) as response:
            return response.read(1024*1024) # thumbnail, never full original
    def media_range(self,handle,value):
        if not re.fullmatch(r'bytes=\d+-\d+',value): raise ValueError('Example requires a bounded byte range.')
        start,end=map(int,value[6:].split('-'))
        if end<start or end-start+1>4*1024*1024: raise ValueError('Example range must be at most 4 MiB.')
        row=self.command('preview',{'handle':handle})
        source=self.command('media_source',{'handle':row['handle'],'identity':row['identity']})
        try:
            path=source['url']
            if not re.fullmatch(r'/api/explorer/v1/media/[A-Za-z0-9_-]+',path): raise ValueError('Invalid media URL.')
            with self.request(path,headers={'Range':value}) as response:
                if response.status!=206: raise RuntimeError('Expected a partial-content response.')
                return response.read(end-start+2)
        finally:self.command('release_media',{'ticket':source['ticket']})

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin',required=True);parser.add_argument('--port',type=int,default=17891)
    parser.add_argument('operation',choices=['roots','list','preview','thumbnail','range'])
    parser.add_argument('--handle');parser.add_argument('--output',type=Path);parser.add_argument('--range',dest='byte_range',default='bytes=0-4095')
    args=parser.parse_args()
    client=Client(args.origin,os.environ.get('CHUTE_SESSION_TOKEN',''),args.port)
    if args.operation!='roots' and not args.handle:parser.error('--handle is required')
    if args.operation in {'thumbnail','range'}:
        if not args.output:parser.error('--output is required')
        data=client.thumbnail(args.handle) if args.operation=='thumbnail' else client.media_range(args.handle,args.byte_range)
        with args.output.open('xb') as output:output.write(data)
    else:print(json.dumps(client.command(args.operation,{'handle':args.handle} if args.handle else {}),indent=2))
if __name__=='__main__':main()
