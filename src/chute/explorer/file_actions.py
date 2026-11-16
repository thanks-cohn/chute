"""Explicit file actions over existing scoped handles; no browser paths."""
import os
from .preview import preview_kind
from .protocol import ExplorerError


def external_action(engine, action, handle, identity):
    if action not in {'open', 'reveal'}:
        raise ExplorerError('INVALID_ARGUMENT', 'Unknown file action.')
    grant = engine.grant_for(handle)
    if not grant.windows or os.name != 'nt':
        raise ExplorerError('UNSUPPORTED_PLATFORM', 'System file actions require the Windows candidate companion.')
    with grant.open(handle) as fd:
        row = engine._record(grant, grant.parts(handle), os.fstat(fd), fd=fd)
        if identity != row['identity']:
            raise ExplorerError('FILE_CHANGED', 'The file changed. Refresh before opening its location or application.')
        path = grant.windows.root.joinpath(*grant.parts(handle))
        if action == 'open':
            # A read session is not authority to run executables, scripts or URL
            # shortcuts. Only the same passive media/document kinds as Preview.
            safe_suffixes = {'.png','.jpg','.jpeg','.gif','.webp','.bmp','.mp3','.m4a','.wav','.flac','.oga','.ogg','.ogv','.mp4','.webm','.txt','.log','.csv','.md','.pdf'}
            if path.suffix.lower() not in safe_suffixes or preview_kind(row) == 'unavailable':
                raise ExplorerError('UNSUPPORTED_FORMAT', 'System Open supports previewable media, text and PDF; executable and shortcut launch is not allowed.')
            os.startfile(str(path), 'open')
            return {'action':'open', 'status':'accepted'}
        from chute.reveal import reveal_file
        return {'action':'reveal', 'status':reveal_file(path)}
