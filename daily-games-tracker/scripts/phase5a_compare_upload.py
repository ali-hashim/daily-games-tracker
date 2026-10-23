"""Bounded two-build comparison; never sorts workflow/action/menu arrays."""
import argparse
import json
from pathlib import Path
import plistlib
from phase5a_build_upload import digest
from phase5a_inspect_upload import canonical, inspect

def compare(first:Path,second:Path):
    a,b=first.read_bytes(),second.read_bytes()
    wa,wb=plistlib.loads(a),plistlib.loads(b)
    inspect(wa);inspect(wb)
    return {'firstSha256':digest(a),'secondSha256':digest(b),'byteIdentical':a==b,'orderedPlistsEqual':wa==wb,'boundedNativeContractEqual':canonical(wa)==canonical(wb),'normalization':'UUID spelling; native dictionary field ordering; Share Sheet class set ordering only; every action, control-flow, menu and other array order preserved','disposition':'two local pinned-compiler builds only; no general byte reproducibility claim'}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('first',type=Path);p.add_argument('second',type=Path);a=p.parse_args()
    result=compare(a.first,a.second)
    assert result['boundedNativeContractEqual']
    print(json.dumps(result,indent=2))
