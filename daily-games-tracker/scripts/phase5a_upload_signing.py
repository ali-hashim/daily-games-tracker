"""Freeze an inspected full-client payload offline, or explicitly sign once.

No WHT request is made by either mode. Send requires both frozen expected
manifest and wire digests, uses HubSign only, and never retries or redirects.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import plistlib
import sys

from phase5a_build_upload import SOURCE, CAPTURE, LOCK, MIGRATION, digest, normalize
from phase5a_inspect_upload import inspect, CONTRACT
from phase5a_send_hubsign import HUBSIGN_ENDPOINT, json_request_body, post_once

STATUS='offline full upload signing-review package prepared; no transfer or signing performed'
NAME='Upload To WHT'

def encoded(value): return (json.dumps(value,indent=2,sort_keys=True)+'\n').encode()

def freeze(build_dir:Path, output:Path):
    assert not output.exists() or not any(output.iterdir()), 'Use a new output directory.'
    output.mkdir(parents=True,exist_ok=True)
    artifact=build_dir/'Upload To WHT_unsigned.shortcut'
    raw=(build_dir/'compiler-output.shortcut').read_bytes()
    binary=artifact.read_bytes(); workflow=plistlib.loads(binary)
    inspection=inspect(workflow)
    assert normalize(plistlib.loads(raw))==workflow
    manifest=json.loads((build_dir/'manifest.json').read_bytes())
    assert manifest['sourceSha256']==digest(SOURCE.read_bytes())
    assert manifest['captureSha256']==digest(CAPTURE.read_bytes())
    assert manifest['renderedSourceSha256']==digest((build_dir/'upload-to-wht.cherri').read_bytes())
    assert manifest['artifactSha256']==digest(binary) and manifest['rawArtifactSha256']==digest(raw)
    assert manifest['lockSha256']==digest(LOCK.read_bytes())
    assert manifest['normalizerSha256']==digest((Path(__file__).parent/'phase5a_build_upload.py').read_bytes())
    assert manifest['inspectorSha256']==digest((Path(__file__).parent/'phase5a_inspect_upload.py').read_bytes())
    assert manifest['nativeContractSha256']==digest(CONTRACT.read_bytes())
    xml=plistlib.dumps(workflow,fmt=plistlib.FMT_XML)
    assert plistlib.loads(xml)==workflow
    wire=json_request_body(xml,NAME)
    files={'upload_unsigned.shortcut':binary,'upload.xml':xml,'hubsign-request.json':wire,
           'inspection.json':encoded(inspection),'provenance/compiler-output.shortcut':raw,
           'provenance/build-manifest.json':encoded(manifest),'provenance/upload-to-wht.cherri':SOURCE.read_bytes(),
           'provenance/rendered-upload-to-wht.cherri':(build_dir/'upload-to-wht.cherri').read_bytes(),
           'provenance/toolchain.lock.json':LOCK.read_bytes(),'provenance/capture-safari.js':CAPTURE.read_bytes(),
           'provenance/upload-native-contract.json':CONTRACT.read_bytes()}
    for name in ('phase5a_build_upload.py','phase5a_inspect_upload.py','phase5a_upload_signing.py','phase5a_send_hubsign.py'):
        files['provenance/'+name]=(Path(__file__).parent/name).read_bytes()
    for name,data in files.items():
        (output/name).parent.mkdir(parents=True,exist_ok=True)
        (output/name).write_bytes(data)
    approval={'schemaVersion':1,'status':STATUS,'mode':'full-upload-preview','signing':'not performed','transfer':'not performed','nativeExecution':'not performed','artifactSha256':digest(binary),'toolchain':{'lockSha256':digest(LOCK.read_bytes())},'futureSigningPayload':{'shortcutName':NAME,'xmlPath':'upload.xml','xmlSha256':digest(xml),'xmlBytes':len(xml),'jsonWirePath':'hubsign-request.json','jsonWireSha256':digest(wire),'jsonWireBytes':len(wire)},'packageFileHashes':{n:digest(d) for n,d in files.items()}}
    (output/'approval-manifest.json').write_bytes(encoded(approval))
    hashes={**approval['packageFileHashes'],'approval-manifest.json':digest(encoded(approval))}
    (output/'PACKAGE-SHA256SUMS').write_text(''.join(f'{v}  {k}\n' for k,v in sorted(hashes.items())),encoding='utf-8')
    return {'manifestSha256':digest(encoded(approval)),'wireSha256':digest(wire),'artifactSha256':digest(binary),'package':str(output)}

def validate(package:Path, expected_manifest:str,expected_wire:str):
    manifest_bytes=(package/'approval-manifest.json').read_bytes()
    assert digest(manifest_bytes)==expected_manifest
    manifest=json.loads(manifest_bytes)
    assert manifest['status']==STATUS and manifest['mode']=='full-upload-preview'
    assert manifest['signing']==manifest['transfer']=='not performed'
    hashes={}
    for name,expected in manifest['packageFileHashes'].items():
        path=Path(name)
        assert not path.is_absolute() and '..' not in path.parts
        assert digest((package/path).read_bytes())==expected
        hashes[name]=expected
    hashes['approval-manifest.json']=expected_manifest
    assert (package/'PACKAGE-SHA256SUMS').read_text(encoding='utf-8')==''.join(f'{v}  {k}\n' for k,v in sorted(hashes.items()))
    workflow=plistlib.loads((package/'upload_unsigned.shortcut').read_bytes())
    inspect(workflow)
    assert plistlib.loads((package/'upload.xml').read_bytes())==workflow
    payload=(package/'upload.xml').read_bytes(); wire=(package/'hubsign-request.json').read_bytes()
    assert wire==json_request_body(payload,NAME) and digest(wire)==expected_wire
    info=manifest['futureSigningPayload']
    assert info=={'shortcutName':NAME,'xmlPath':'upload.xml','xmlSha256':digest(payload),'xmlBytes':len(payload),'jsonWirePath':'hubsign-request.json','jsonWireSha256':digest(wire),'jsonWireBytes':len(wire)}
    return payload

def send(package:Path, output:Path, expected_manifest:str,expected_wire:str, transport=post_once):
    payload=validate(package,expected_manifest,expected_wire)
    assert not output.exists(), 'Use a new evidence directory; requests never retry.'
    output.mkdir(parents=True)
    # Persist intent before transfer, so an ambiguous transport result cannot be
    # mistaken for permission to resend into this same evidence directory.
    intent={'endpoint':HUBSIGN_ENDPOINT,'manifestSha256':expected_manifest,'wireSha256':expected_wire,'requestsPlanned':1,'automaticRetry':False}
    (output/'request-intent.json').write_bytes(encoded(intent))
    response=transport(HUBSIGN_ENDPOINT,payload,NAME,'upload.xml')
    (output/'response.bin').write_bytes(response.body)
    content_type=next((v for k,v in response.headers.items() if k.casefold()=='content-type'),None)
    accepted=response.status==200 and content_type=='application/octet-stream' and response.body.startswith(b'AEA1')
    evidence={**intent,'httpStatus':response.status,'responseHeaders':dict(response.headers),'responseBytes':len(response.body),'responseSha256':digest(response.body),'responseContainerHeader':response.body[:4].decode('ascii',errors='replace'),'error':response.error,'acceptedContainer':accepted,'appleSignatureValidation':'not performed','nativeExecution':'not performed'}
    (output/'evidence.json').write_bytes(encoded(evidence))
    if accepted: (output/'Upload To WHT.shortcut').write_bytes(response.body)
    assert accepted, 'Signer did not return an accepted container; preserve evidence, never auto-retry.'
    return evidence

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='mode',required=True)
    p=sub.add_parser('prepare');p.add_argument('--build-directory',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    p=sub.add_parser('send');p.add_argument('--package',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--expected-manifest-sha256',required=True);p.add_argument('--expected-wire-sha256',required=True)
    a=parser.parse_args()
    result=freeze(a.build_directory,a.output) if a.mode=='prepare' else send(a.package,a.output,a.expected_manifest_sha256,a.expected_wire_sha256)
    print(json.dumps(result,indent=2))
