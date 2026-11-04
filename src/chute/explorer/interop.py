"""Chutey/REDOWN handoff proposal v1; validation does not authorize a transfer.

Transport is deliberately unbound until both participant/native-consent gates pass.
Cloud credentials and local paths are never valid fields in this wire contract.
"""
from __future__ import annotations

from dataclasses import dataclass
import re

from .protocol import ExplorerError
from .security import component


@dataclass(frozen=True)
class TransferIntent:
    version: str
    correlation_id: str
    direction: str
    source: str
    destination: str
    name: str
    mime: str
    size: int
    sha256: str
    conflict: str = "keep_both"
    operation: str = "copy"

    @classmethod
    def parse(cls, payload: dict):
        try:
            intent = cls(**payload)
            component(intent.name)
            if (intent.version != "1.0" or intent.operation != "copy"
                    or intent.direction not in {"local_to_cloud", "cloud_to_local"}
                    or intent.conflict not in {"keep_both", "skip"}
                    or type(intent.size) is not int or not 0 <= intent.size <= 300000000
                    or re.fullmatch(r"[a-f0-9]{32}", intent.correlation_id) is None
                    or re.fullmatch(r"[a-f0-9]{64}", intent.sha256) is None
                    or re.fullmatch(r"[A-Za-z0-9_-]{24,128}", intent.source) is None
                    or re.fullmatch(r"[A-Za-z0-9_-]{24,128}", intent.destination) is None
                    or re.fullmatch(r"[a-z0-9.+-]+/[a-z0-9.+-]+", intent.mime) is None):
                raise ValueError
            return intent
        except (TypeError, ValueError):
            raise ExplorerError("INVALID_TRANSFER_INTENT", "Invalid versioned copy handoff.")


def capabilities():
    return {"version": "1.0", "enabled": False, "reason": "NATIVE_CONSENT_REQUIRED",
            "directions": ["local_to_cloud", "cloud_to_local"], "default_operation": "copy",
            "maximum_chunk_bytes": 262144, "maximum_streams": 1,
            "completion": "independent destination readback SHA-256 required"}


class AdapterBridge:
    """Trusted-code adapter foundation. No browser/HTTP participant enrollment.

    Participants are supplied by the native owner after authentication, never
    constructed from wire claims. prepare does not turn an intent into authority:
    each adapter must independently approve its opaque reference and exact peer.
    The public capability stays disabled until installed participant trust exists.
    """
    def __init__(self, participants, *, clock=None, ledger=None):
        import time
        self.participants = dict(participants)
        self.clock = clock or time.monotonic
        self.ledger = ledger if ledger is not None else {}
        self.pending = {}
        self.bindings = {}

    def prepare(self, payload, *, sender, receiver, user_gesture):
        import secrets
        intent = TransferIntent.parse(payload)
        if (user_gesture is not True or sender == receiver
                or sender not in self.participants or receiver not in self.participants):
            raise ExplorerError('PARTICIPANT_UNAVAILABLE', 'Both explicitly enrolled participants are required.')
        if intent.correlation_id in self.ledger:
            raise ExplorerError('REPLAY', 'Reconcile the original transfer before retrying.')
        if len(self.pending) >= 32 or len(self.ledger) >= 256:
            raise ExplorerError('BUSY','Reconcile outstanding handoffs before preparing more.')
        source, target = self.participants[sender], self.participants[receiver]
        if intent.size > min(source.maximum_size, target.maximum_size):
            raise ExplorerError('CAPABILITY_LIMIT', 'The participant limits do not permit this copy.')
        self.bindings[intent.correlation_id] = (sender,receiver)
        self.ledger[intent.correlation_id] = {'state':'PREPARED','correlation_id':intent.correlation_id}
        try:
            source.prepare(intent, peer=receiver, role='read')
            target.prepare(intent, peer=sender, role='receive')
        except BaseException:
            self.ledger[intent.correlation_id] = {'state':'FAILED','correlation_id':intent.correlation_id}
            raise
        nonce = secrets.token_urlsafe(32)
        self.pending[nonce] = (intent, sender, receiver, self.clock()+60)
        self.ledger[intent.correlation_id] = {'state':'PREPARED','correlation_id':intent.correlation_id}
        return {'nonce':nonce,'expires_in':60,'state':'PREPARED','version':'1.0'}

    def commit(self, nonce, *, sender, receiver):
        entry = self.pending.get(nonce)
        if entry is None or (sender,receiver) != entry[1:3]:
            raise ExplorerError('UNAUTHORIZED','The handoff is unavailable to this participant.')
        self.pending.pop(nonce)  # One-use even on interruption; reconcile, never blind replay.
        intent, _, _, expires = entry
        if expires <= self.clock():
            self.ledger[intent.correlation_id] = {'state':'FAILED','reason':'EXPIRED'}
            raise ExplorerError('EXPIRED','Prepare a new explicitly approved handoff.')
        source, target = self.participants[sender], self.participants[receiver]
        try:
            with source.read(intent) as stream:
                self.ledger[intent.correlation_id] = {'state':'RECEIVING'}
                staged = target.receive(intent, stream)
                self.ledger[intent.correlation_id] = {'state':'STAGED'}
                verified = target.verify(intent, staged)
                if verified.get('sha256') != intent.sha256 or verified.get('size') != intent.size:
                    raise ExplorerError('VERIFY_FAILED','Independent destination bytes do not match.')
                self.ledger[intent.correlation_id] = {'state':'VERIFIED'}
                receipt = target.commit(intent, staged)
                if receipt.get('state') != 'COMMITTED':
                    raise ExplorerError('UNCERTAIN','Reconcile the destination before retrying.')
            self.ledger[intent.correlation_id] = {**receipt,'correlation_id':intent.correlation_id}
            return self.ledger[intent.correlation_id]
        except BaseException:
            target.cancel(intent)
            # A provider may have received bytes already. Only the target can resolve this.
            self.ledger[intent.correlation_id] = {'state':'UNCERTAIN','correlation_id':intent.correlation_id}
            raise

    def cancel(self, nonce, *, sender, receiver):
        entry = self.pending.get(nonce)
        if entry is None or (sender,receiver) != entry[1:3]:
            raise ExplorerError('UNAUTHORIZED','The handoff is unavailable to this participant.')
        intent, _, _, _ = self.pending.pop(nonce)
        for participant in (sender,receiver): self.participants[participant].cancel(intent)
        self.ledger[intent.correlation_id] = {'state':'CANCELLED','correlation_id':intent.correlation_id}
        return self.ledger[intent.correlation_id]

    def reconcile(self, correlation_id, *, receiver):
        if receiver not in self.participants or correlation_id not in self.ledger or self.bindings.get(correlation_id,(None,None))[1] != receiver:
            raise ExplorerError('NOT_FOUND','No handoff is available to reconcile.')
        # Local state alone cannot establish provider completion.
        return self.participants[receiver].reconcile(correlation_id, self.ledger[correlation_id])
