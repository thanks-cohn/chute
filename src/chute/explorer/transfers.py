"""Bounded original-byte COPY operations under the production root guards.

No URL resolution, deletion, replacement or cloud authority. Native code alone
may grant write permission. Receipts describe verified publication, not delivery
into a website. Windows parents remain guarded throughout stage and publish.
"""
from __future__ import annotations

import contextlib
import hashlib
import os
from pathlib import Path
import secrets
import stat
import time

from .protocol import ExplorerError
from .security import component

CHUNK = 262144


def digest(stream):
    value = hashlib.sha256()
    while block := stream.read(CHUNK):
        value.update(block)
    return value.hexdigest()


class Transfers:
    def __init__(self, engine, *, clock=time.monotonic):
        self.engine, self.clock = engine, clock
        self.sources = {}

    def prepare(self, handle, identity):
        # A bounded, short-lived source reference is distinct from a Store ID.
        self.sources = {key:value for key,value in self.sources.items() if value['expires'] > self.clock()}
        if len(self.sources) >= 32:
            raise ExplorerError('BUSY', 'Finish or cancel the pending file copies first.')
        grant = self.engine.grant_for(handle)
        row = self.engine._record(grant, grant.parts(handle), grant.stat(handle))
        if row['kind'] != 'file' or identity != row['identity']:
            raise ExplorerError('FILE_CHANGED', 'Refresh the selected file before copying.')
        capability = secrets.token_urlsafe(32)
        self.sources[capability] = {'handle':handle, 'identity':identity, 'expires':self.clock()+60}
        return {'source_kind':'local_explorer', 'capability':capability, 'expires_in':60,
                'name':row['name'], 'mime':row['mime'], 'size':row['size'], 'state':'PREPARED'}

    @contextlib.contextmanager
    def read(self, capability):
        source = self.sources.pop(capability, None)  # Consume before opening; never replay.
        if not source or source['expires'] <= self.clock():
            raise ExplorerError('EXPIRED', 'Start a new copy from the selected file.')
        grant = self.engine.grant_for(source['handle'])
        with grant.open(source['handle']) as fd:
            info = os.fstat(fd)
            row = self.engine._record(grant, grant.parts(source['handle']), info, fd=fd)
            if row['identity'] != source['identity'] or not stat.S_ISREG(info.st_mode):
                raise ExplorerError('FILE_CHANGED', 'The source changed. Start a new copy.')
            with os.fdopen(os.dup(fd), 'rb') as stream:
                yield row, stream
                if os.fstat(fd) != info:
                    # Compare identity fields rather than atime changed by our reads.
                    after = os.fstat(fd)
                    if (info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns) != (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
                        raise ExplorerError('FILE_CHANGED', 'The source changed during copying.')

    def to_live(self, capability, store):
        with self.read(capability) as (row, stream):
            # Store owns its normal chunked intake and creates a genuine Store ID.
            expected = digest(stream); stream.seek(0)
            item = store.add_stream(row['name'], stream, row['size'], mime=row['mime'], source_path='local_explorer')
            found = store.get(item.id)
            with found[1].open('rb') as copied:
                actual = digest(copied)
            if actual != expected:
                store.remove(item.id)
                raise ExplorerError('VERIFY_FAILED', 'Live copy failed byte verification.')
        return {'source_kind':'local_explorer','state':'COMMITTED','sha256':actual,
                'file':{'id':item.id,'name':row['name'],'mime':row['mime'],'size':row['size']}}


def receive(grant, destination, name, stream, size, *, expected_sha256=None, conflict='keep_both', authorize=lambda:None):
    """Stage, fsync, independent readback and no-clobber publication; COPY only."""
    component(name)
    if not getattr(grant, 'writable', False):
        raise ExplorerError('WRITE_CONSENT_REQUIRED', 'Approve write access using the native folder picker first.')
    if type(size) is not int or size < 0 or conflict not in {'keep_both','skip'}:
        raise ExplorerError('INVALID_ARGUMENT', 'Invalid copy size or conflict policy.')
    operation = secrets.token_hex(16)
    stage = '.chute-stage-' + secrets.token_hex(24)
    published = False
    with contextlib.ExitStack() as stack:
        if grant.windows:
            stack.enter_context(grant.windows.guard(grant.parts(destination), directory=True))
            directory = grant.windows.root.joinpath(*grant.parts(destination))
            target = lambda value: directory / value
            kwargs = {}
        else:
            directory = stack.enter_context(grant.open(destination, directory=True))
            target = lambda value: value
            kwargs = {'dir_fd':directory}
        def unlink(value):
            os.unlink(target(value), **kwargs)
        fd = os.open(target(stage), os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os,'O_NOFOLLOW',0), 0o600, **kwargs)
        try:
            with os.fdopen(fd, 'w+b') as staging:
                source_hash = hashlib.sha256(); remaining = size
                while remaining:
                    authorize()
                    block = stream.read(min(CHUNK,remaining))
                    if not block or len(block) > remaining:
                        raise ExplorerError('INCOMPLETE_STREAM', 'Copy interrupted before all bytes arrived.')
                    staging.write(block); source_hash.update(block); remaining -= len(block)
                staging.flush(); os.fsync(staging.fileno())
                expected = source_hash.hexdigest()
                if expected_sha256 is not None and expected_sha256 != expected:
                    raise ExplorerError('VERIFY_FAILED', 'Source digest does not match the received bytes.')
                info = os.fstat(staging.fileno())
            # Independent reopening, no-follow; compare identity and digest.
            check_fd = os.open(target(stage), os.O_RDONLY | getattr(os,'O_NOFOLLOW',0), **kwargs)
            with os.fdopen(check_fd,'rb') as check:
                actual_info = os.fstat(check.fileno())
                if (info.st_dev,info.st_ino,info.st_size) != (actual_info.st_dev,actual_info.st_ino,actual_info.st_size) or digest(check) != expected:
                    raise ExplorerError('VERIFY_FAILED', 'Staged copy failed independent readback.')
            authorize()
            stem, suffix = os.path.splitext(name)
            for index in range(10000):
                final_name = name if index == 0 else f'{stem} ({index}){suffix}'
                component(final_name)
                try:
                    link_kwargs = {} if grant.windows else {'src_dir_fd':directory,'dst_dir_fd':directory}
                    os.link(target(stage), target(final_name), follow_symlinks=False, **link_kwargs)
                    published = True
                    break
                except FileExistsError:
                    if conflict == 'skip':
                        return {'operation_id':operation,'state':'CANCELLED','reason':'CONFLICT_SKIPPED'}
            else:
                raise ExplorerError('CONFLICT_LIMIT','Choose a different filename.')
            final_handle = grant.handle(grant.parts(destination)+(final_name,))
            with grant.open(final_handle) as verify_fd:
                final_info = os.fstat(verify_fd)
                with os.fdopen(os.dup(verify_fd),'rb') as verify:
                    if (info.st_dev,info.st_ino,info.st_size) != (final_info.st_dev,final_info.st_ino,final_info.st_size) or digest(verify) != expected:
                        raise ExplorerError('UNCERTAIN', 'Publication needs reconciliation; do not retry automatically.')
            if not grant.windows: os.fsync(directory)
            return {'operation_id':operation,'state':'COMMITTED','name':final_name,'destination':destination,
                    'handle':final_handle,'size':size,'sha256':expected,'operation':'copy','conflict':conflict}
        except BaseException as exc:
            if published and not (isinstance(exc,ExplorerError) and exc.code == 'UNCERTAIN'):
                raise ExplorerError('UNCERTAIN','Publication needs reconciliation; do not retry automatically.') from None
            raise
        finally:
            try: unlink(stage)
            except FileNotFoundError: pass
