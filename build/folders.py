#!/usr/bin/env python3
"""Shared helper for generating Foundry compendium folder documents so the big
packs browse by category. Deterministic ids -> stable across rebuilds."""
import hashlib

_B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

def fid(ftype, name):
    n = int.from_bytes(hashlib.sha1(f"folder::{ftype}::{name}".encode()).digest(), "big")
    return "".join(_B62[(n // (62 ** i)) % 62] for i in range(16))


def folder_doc(ftype, name, color="", sort=0):
    _id = fid(ftype, name)
    return {
        "name": name, "type": ftype, "_id": _id, "folder": None,
        "sorting": "a", "sort": sort, "color": color, "flags": {},
        "_stats": {"systemId": "dnd5e", "systemVersion": "5.3.3"},
        "_key": f"!folders!{_id}",
    }
