"""Permissioned native participant for the disabled versioned adapter foundation.

Registration is trusted Python only. REDOWN must implement its own provider
participant; this module never accepts provider credentials or network URLs.
"""
import contextlib
import os
import tempfile

from .protocol import ExplorerError
from .transfers import CHUNK, digest, receive


class NativeTransferAdapter:
    maximum_size = 300000000  # Existing v1 ceiling; negotiate down, never promise more.

    def __init__(self, transfers, *, peers, destinations=None):
        self.transfers = transfers
        self.peers = frozenset(peers)
        self.destinations = dict(destinations or {})
        self.staged = {}
        self.receipts = {}

    def prepare(self, intent, *, peer, role):
        if peer not in self.peers:
            raise ExplorerError('UNAUTHORIZED','The peer has not been enrolled.')
        if role == 'read':
            source = self.transfers.sources.get(intent.source)
            if not source or source['expires'] <= self.transfers.clock():
                raise ExplorerError('EXPIRED','The source copy grant is unavailable.')
        elif role == 'receive':
            if intent.destination not in self.destinations:
                raise ExplorerError('WRITE_CONSENT_REQUIRED','Select an explicitly approved destination.')
            grant, handle = self.destinations[intent.destination]
            if not grant.writable:
                raise ExplorerError('WRITE_CONSENT_REQUIRED','Write approval is required.')
            with grant.open(handle,directory=True): pass
        else:
            raise ExplorerError('INVALID_ARGUMENT','Unsupported participant role.')

    @contextlib.contextmanager
    def read(self, intent):
        with self.transfers.read(intent.source) as (row, stream):
            if (row['name'],row['mime'],row['size']) != (intent.name,intent.mime,intent.size):
                raise ExplorerError('FILE_CHANGED','The source metadata changed.')
            yield stream

    def receive(self, intent, stream):
        if len(self.staged) >= 1:
            raise ExplorerError('BUSY','Only one stream may be staged at a time.')
        stage = tempfile.TemporaryFile('w+b')
        try:
            remaining = intent.size
            while remaining:
                data = stream.read(min(CHUNK,remaining))
                if not data or len(data)>remaining:
                    raise ExplorerError('INCOMPLETE_STREAM','The handoff ended early.')
                stage.write(data); remaining -= len(data)
            stage.flush(); os.fsync(stage.fileno())
            self.staged[intent.correlation_id] = stage
            return intent.correlation_id
        except BaseException:
            stage.close(); raise

    def verify(self, intent, staged):
        stage = self.staged[staged]
        stage.seek(0)
        # Independent descriptor readback, rather than trusting source digest.
        with os.fdopen(os.dup(stage.fileno()),'rb') as check:
            result = {'sha256':digest(check),'size':os.fstat(check.fileno()).st_size}
        stage.seek(0)
        return result

    def commit(self, intent, staged):
        stage = self.staged.pop(staged)
        try:
            grant, handle = self.destinations[intent.destination]
            # Revalidate exact destination and current native authority at publish time.
            result = receive(grant,handle,intent.name,stage,intent.size,expected_sha256=intent.sha256,conflict=intent.conflict)
            self.receipts[intent.correlation_id] = result
            return result
        finally:
            stage.close()

    def cancel(self, intent):
        stage = self.staged.pop(intent.correlation_id,None)
        if stage: stage.close()

    def reconcile(self, correlation_id, recorded):
        return self.receipts.get(correlation_id,recorded)
