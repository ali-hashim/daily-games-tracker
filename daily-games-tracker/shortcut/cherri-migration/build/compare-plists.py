#!/usr/bin/env python3
"""Compare generated Shortcut plists without collapsing ordered arrays."""

from __future__ import annotations

import hashlib
import json
import plistlib
import sys
from pathlib import Path
from typing import Any


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def differences(left: Any, right: Any, path: str = "$") -> list[str]:
    found: list[str] = []
    if type(left) is not type(right):
        return [path]
    if isinstance(left, dict):
        for key in sorted(set(left) | set(right), key=str):
            child = f"{path}.{key}"
            if key not in left or key not in right:
                found.append(child)
            else:
                found.extend(differences(left[key], right[key], child))
    elif isinstance(left, list):
        if len(left) != len(right):
            found.append(f"{path}.length")
        for index, (left_item, right_item) in enumerate(zip(left, right)):
            found.extend(differences(left_item, right_item, f"{path}[{index}]"))
    elif left != right:
        found.append(path)
    return found


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: compare-plists.py FIRST.shortcut SECOND.shortcut")
    first, second = (Path(value) for value in sys.argv[1:])
    first_bytes, second_bytes = first.read_bytes(), second.read_bytes()
    first_plist = plistlib.loads(first_bytes)
    second_plist = plistlib.loads(second_bytes)
    differing_paths = differences(first_plist, second_plist)
    print(
        json.dumps(
            {
                "firstSha256": hashlib.sha256(first_bytes).hexdigest(),
                "secondSha256": hashlib.sha256(second_bytes).hexdigest(),
                "byteIdentical": first_bytes == second_bytes,
                "propertyListsSemanticallyEqual": not differing_paths,
                "differingPaths": differing_paths,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
