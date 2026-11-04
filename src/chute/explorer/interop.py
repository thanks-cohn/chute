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
