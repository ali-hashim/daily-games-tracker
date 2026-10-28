"""Offline full-client build. No network, signing, install or service request."""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import uuid
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT/'daily-games-tracker/shortcut/cherri-migration'
SOURCE = MIGRATION/'source/upload-to-wht.cherri'
CAPTURE = MIGRATION.parent/'capture-safari.js'
LOCK = MIGRATION/'toolchain.lock.json'
NOTE = 'PRIVATE DEVICE CODE: stored in the Text action immediately above, named deviceCode. Customize Shortcut asks for it on this iPhone. If setup was skipped, edit that Text action. Editing or sharing a configured shortcut can expose the code.'
PROMPT = 'Paste your private WHT device code.'
SHORTCUT_NAME = 'Upload to WHT'
RUNTIME_ORIGIN_TOKEN = '__WHT_RUNTIME_ORIGIN__'
RESERVED_RUNTIME_HOST_SUFFIXES = ('.invalid', '.example', '.test')

def digest(data):
    return hashlib.sha256(data).hexdigest()

def validate_runtime_origin(value: str, *, allow_fixture: bool = True) -> str:
    """Validate an origin without echoing it; protected signing rejects placeholders."""
    if not isinstance(value, str) or not value or value != value.strip():
        raise ValueError('runtime origin must be a nonempty trimmed HTTPS origin')
    parsed = urlsplit(value)
    if (
        parsed.scheme != 'https'
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ('', '/')
        or parsed.query
        or parsed.fragment
        or value.endswith('/')
    ):
        raise ValueError('runtime origin must be an HTTPS origin without path, query, fragment, userinfo, or trailing slash')
    host = parsed.hostname.lower().rstrip('.')
    if not allow_fixture and (host == 'localhost' or host.endswith(RESERVED_RUNTIME_HOST_SUFFIXES)):
        raise ValueError('runtime origin must not use a reserved or placeholder host')
    return value


def runtime_origin(value: str | None = None, *, allow_fixture: bool = True) -> str:
    if value is None:
        value = os.environ.get('WHT_RUNTIME_ORIGIN')
    if value is None:
        raise ValueError('runtime origin must be provided explicitly or via WHT_RUNTIME_ORIGIN')
    return validate_runtime_origin(value, allow_fixture=allow_fixture)


def render_source(origin: str | None = None, *, allow_fixture: bool = True):
    capture = CAPTURE.read_bytes()
    lock = json.loads(LOCK.read_bytes())
    assert len(capture) == lock['capture']['bytes'] == 5250
    assert digest(capture) == lock['capture']['sha256'] == 'fb50c544f795a5db5102c6e936b3bea723eca7fd92f4c6677d2780bfdf0ba2fb'
    source = SOURCE.read_text(encoding='utf-8')
    assert source.count('__WHT_CAPTURE_SCRIPT__') == 1
    source = source.replace(RUNTIME_ORIGIN_TOKEN, runtime_origin(origin, allow_fixture=allow_fixture))
    assert RUNTIME_ORIGIN_TOKEN not in source
    return source.replace('__WHT_CAPTURE_SCRIPT__', capture.decode('utf-8').replace("'", "\\'"))

def normalize(workflow):
    result = copy.deepcopy(workflow)
    # Pin the installed display name in the delivered plist.
    result['WFWorkflowName'] = SHORTCUT_NAME
    actions = result['WFWorkflowActions']
    targets = [(i,a) for i,a in enumerate(actions) if a['WFWorkflowActionIdentifier']=='is.workflow.actions.gettext' and a['WFWorkflowActionParameters'].get('CustomOutputName')=='deviceCode']
    assert len(targets) == 1
    index, target = targets[0]
    assert target['WFWorkflowActionParameters']['WFTextActionText'] == ''
    questions = result['WFWorkflowImportQuestions']
    assert len(questions) == 1
    q = questions[0]
    assert q['Text'] == PROMPT and q['DefaultValue']==''
    assert q['Category']=='Parameter' and q['ParameterKey']=='WFTextActionText'
    # Pinned compiler omits ActionIndex even when an earlier setvariable action
    # exists. Map the unique named empty Text target rather than trusting zero.
    assert 'ActionIndex' not in q or (type(q['ActionIndex']) is int and q['ActionIndex']==index)
    q['ActionIndex'] = index
    actions.insert(index+1, {'WFWorkflowActionIdentifier':'is.workflow.actions.comment','WFWorkflowActionParameters':{'WFCommentActionText':NOTE}})
    # --derive-uuids in pinned Cherri reuses the same UUID for all controls,
    # and its menu map consequently overwrites the earlier menu's item list.
    # Preserve action order and repair each structurally nested control group.
    stack = []
    for action_index, action in enumerate(actions):
        p = action.get('WFWorkflowActionParameters', {})
        mode = p.get('WFControlFlowMode')
        if mode is None:
            continue
        kind = action['WFWorkflowActionIdentifier']
        assert kind in ('is.workflow.actions.conditional','is.workflow.actions.choosefrommenu')
        if mode == 0:
            group = str(uuid.uuid5(uuid.NAMESPACE_URL, f'wht-upload-control-v1/{action_index}/{kind}'))
            stack.append((kind,group,action,[]))
        else:
            assert stack and stack[-1][0]==kind
        current = stack[-1]
        p['GroupingIdentifier'] = current[1]
        if 'UUID' in p:
            p['UUID'] = current[1]
        if kind.endswith('choosefrommenu') and mode == 1:
            assert isinstance(p['WFMenuItemTitle'],str)
            current[3].append(p['WFMenuItemTitle'])
        if mode == 2:
            if kind.endswith('choosefrommenu'):
                current[2]['WFWorkflowActionParameters']['WFMenuItems'] = [{'WFValue':title} for title in current[3]]
            stack.pop()
    assert not stack
    return result

def build(compiler: Path, output: Path, origin: str | None = None, *, allow_fixture: bool = True):
    origin = runtime_origin(origin, allow_fixture=allow_fixture)
    output.mkdir(parents=True, exist_ok=True)
    assert not any(output.iterdir()), 'Use a new output directory.'
    lock = json.loads(LOCK.read_bytes())
    flags = lock['build']['flags']
    assert flags == ['--skip-sign','--derive-uuids']
    source = output/'upload-to-wht.cherri'
    source.write_text(render_source(origin), encoding='utf-8', newline='\n')
    subprocess.run([str(compiler.resolve()),str(source.resolve()),*flags], cwd=compiler.resolve().parent, check=True, timeout=120)
    artifacts = list(output.glob('*.shortcut'))
    assert len(artifacts)==1
    raw = artifacts[0].read_bytes()
    (output/'compiler-output.shortcut').write_bytes(raw)
    workflow = normalize(plistlib.loads(raw))
    from phase5a_inspect_upload import inspect
    inspection = inspect(workflow, runtime_origin=origin)
    artifacts[0].write_bytes(plistlib.dumps(workflow,fmt=plistlib.FMT_BINARY))
    (output/'toolchain.lock.json').write_bytes(LOCK.read_bytes())
    semantic_actions = {}
    for name in ('checkout', 'setupGo', 'uploadArtifact'):
        pin = lock.get('actions', {}).get(name)
        assert isinstance(pin, dict) and all(isinstance(pin.get(key), str) and pin[key] for key in ('repository', 'version', 'commit'))
        semantic_actions[name] = {key: pin[key] for key in ('repository', 'version', 'commit')}
    semantic_toolchain = {
        'schemaVersion': 1,
        'compiler': {key: lock['compiler'][key] for key in ('name', 'version', 'commit')},
        'go': {'version': lock['go']['version']},
        'runner': lock['build']['runner'],
        'flags': list(flags),
        'actions': semantic_actions,
    }
    manifest = {'schemaVersion':1,'status':'unsigned full client compiled; native acceptance pending','sourceSha256':digest(SOURCE.read_bytes()),'renderedSourceSha256':digest(source.read_bytes()),'captureSha256':digest(CAPTURE.read_bytes()),'lockSha256':digest(LOCK.read_bytes()),'compilerSha256':digest(compiler.read_bytes()),'compilerCommit':lock['compiler']['commit'],'goVersion':lock['go']['version'],'flags':flags,'toolchainSemantic':semantic_toolchain,'rawArtifactSha256':digest(raw),'artifactSha256':digest(artifacts[0].read_bytes()),'normalizerSha256':digest(Path(__file__).read_bytes()),'inspectorSha256':digest((Path(__file__).parent/'phase5a_inspect_upload.py').read_bytes()),'nativeContractSha256':digest((MIGRATION/'build/upload-native-contract.json').read_bytes()),'runtimeOrigin':'injected at build time; value intentionally omitted','transformation':'runtime origin injected only in runner temporary source; WFWorkflowName pinned to SHORTCUT_NAME; explicit actual Import Question action index; editor note after deviceCode Text; deterministic unique control groups from native nesting; each menu options rebuilt from its own native branch titles; action order preserved','inspection':inspection,'nativeExecution':'not performed','signing':'not performed','reproducibility':'not established; action/control-flow arrays are never sorted'}
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    return artifacts[0]

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--compiler',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path)
    p.add_argument('--runtime-origin', required=True, type=str,
                   help='Explicit HTTPS runtime origin')
    p.add_argument('--require-nonreserved-origin', action='store_true',
                   help='Reject generic fixture and reserved placeholder hosts for protected signing')
    a=p.parse_args()
    print(build(a.compiler, a.output, a.runtime_origin, allow_fixture=not a.require_nonreserved_origin))
