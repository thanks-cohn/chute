import io,json,time
from unittest.mock import patch
from chute.explorer import Explorer,RootGrant,Session
from chute.explorer.api import ExplorerAPI
from chute.explorer.performance import Performance
from chute.explorer.protocol import ExplorerError
from chute.store import Store
import test_explorer_media as base
ORIGIN=base.ORIGIN

class ContinuationTests(base.MediaAPITests):
    def test_renewal_survives_control_session_replacement_but_revocation_stops(self):
        source=self.source();old=self.adapter
        self.session.expires=0
        self.session=Session(ORIGIN);self.adapter=self.server.explorer_api=ExplorerAPI(self.engine,self.session,previous=old)
        renewed=self.command('renew_media',{'ticket':source['ticket']});self.assertTrue(renewed['renewed'])
        with self.request(source['url'],headers={'Range':'bytes=0-9'}) as r:self.assertEqual(r.read(),b'0123456789')
        self.adapter.revoke_media()
        from urllib.error import HTTPError
        with self.assertRaises(HTTPError):self.request(source['url'])
    def test_origin_omitted_is_rejected_and_original_failure_is_retrievable(self):
        source=self.source()
        from urllib.request import Request
        from urllib.error import HTTPError
        with self.assertRaises(HTTPError):self.opener.open(Request(self.base+source['url']))
        status=self.command('media_status',{'ticket':source['ticket']})
        self.assertEqual(status['original_get']['code'],'UNAUTHORIZED');self.assertFalse(status['original_get']['origin_present'])
    def test_lease_expiry_is_independent_of_broad_bearer(self):
        source=self.source();self.session.expires=0
        with self.request(source['url'],headers={'Range':'bytes=0-1'}) as r:self.assertEqual(r.read(),b'01')
        self.adapter.media[source['ticket']]['expires']=0
        from urllib.error import HTTPError
        with self.assertRaises(HTTPError):self.request(source['url'])

    def test_external_folder_opt_out_does_not_disable_saved_history_media(self):
        self.adapter.media_allowed=False
        from urllib.error import HTTPError
        with self.assertRaises(HTTPError):self.source()
        saved=self.server.store.add_stream('saved.mp4',io.BytesIO(b'saved movie bytes'),17,mime='video/mp4')
        row=self.command('locate_saved',{'id':saved.id})
        source=self.command('media_source',{key:row[key] for key in ('handle','identity')})
        with self.request(source['url'],headers={'Range':'bytes=0-4'}) as response:self.assertEqual(response.read(),b'saved')
        self.assertEqual(self.adapter.media[source['ticket']]['permission_scope'],'saved_store')


def test_presets_distinct_persist_adapt_and_reserved_control(tmp_path):
    p=Performance(Store(tmp_path));assert p.mode=='balanced'
    with patch.object(p,'hardware',return_value={'available_memory_bytes':4*1024**3,'cpu_count':8,'low_memory':False}):
        limits=[p.set(mode)['effective_limits'] for mode in ('efficiency','balanced','turbo')]
        assert [v['navigation'] for v in limits]==[2,4,6]
        assert [v['thumbnail'] for v in limits]==[1,2,3]
        with p.enter('thumbnail') as a,p.enter('thumbnail') as b,p.enter('thumbnail') as c:
            with p.enter('thumbnail') as rejected:assert not rejected
            with p.enter('control') as allowed:assert allowed
        assert Performance(Store(tmp_path)).mode=='turbo'
    with patch.object(p,'hardware',return_value={'available_memory_bytes':256*1024**2,'cpu_count':2,'low_memory':True}):
        assert p.get()['effective_limits']['thumbnail']==1
        assert p.get()['effective_limits']['media']==2
