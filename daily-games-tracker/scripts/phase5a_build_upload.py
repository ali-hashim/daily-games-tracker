"""Offline full-client build. No network, signing, install or service request."""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
from pathlib import Path
import plistlib
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT/'daily-games-tracker/shortcut/cherri-migration'
SOURCE = MIGRATION/'source/upload-to-wht.cherri'
CAPTURE = MIGRATION.parent/'capture-safari.js'
LOCK = MIGRATION/'toolchain.lock.json'
NOTE = 'PRIVATE DEVICE CODE: stored in the Text action immediately above, named deviceCode. Customize Shortcut asks for it on this iPhone. If setup was skipped, edit that Text action. Editing or sharing a configured shortcut can expose the code.'
PROMPT = 'Paste your private WHT device code.'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def render_source():
    capture = CAPTURE.read_bytes()
    lock = json.loads(LOCK.read_bytes())
    assert len(capture) == lock['capture']['bytes'] == 5250
    assert digest(capture) == lock['capture']['sha256'] == 'fb50c544f795a5db5102c6e936b3bea723eca7fd92f4c6677d2780bfdf0ba2fb'
    source = SOURCE.read_text(encoding='utf-8')
    assert source.count('__WHT_CAPTURE_SCRIPT__') == 1
    return source.replace('__WHT_CAPTURE_SCRIPT__', capture.decode('utf-8').replace("'", "\\'"))

def normalize(workflow):
    result = copy.deepcopy(workflow)
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

def build(compiler: Path, output: Path):
    output.mkdir(parents=True, exist_ok=True)
    assert not any(output.iterdir()), 'Use a new output directory.'
    lock = json.loads(LOCK.read_bytes())
    flags = lock['build']['flags']
    assert flags == ['--skip-sign','--derive-uuids']
    source = output/'upload-to-wht.cherri'
    source.write_text(render_source(), encoding='utf-8', newline='\n')
    subprocess.run([str(compiler.resolve()),str(source.resolve()),*flags], cwd=compiler.resolve().parent, check=True, timeout=120)
    artifacts = list(output.glob('*.shortcut'))
    assert len(artifacts)==1
    raw = artifacts[0].read_bytes()
    (output/'compiler-output.shortcut').write_bytes(raw)
    workflow = normalize(plistlib.loads(raw))
    from phase5a_inspect_upload import inspect
    inspection = inspect(workflow)
    artifacts[0].write_bytes(plistlib.dumps(workflow,fmt=plistlib.FMT_BINARY))
    (output/'toolchain.lock.json').write_bytes(LOCK.read_bytes())
    manifest = {'schemaVersion':1,'status':'unsigned full client compiled; native acceptance pending','sourceSha256':digest(SOURCE.read_bytes()),'renderedSourceSha256':digest(source.read_bytes()),'captureSha256':digest(CAPTURE.read_bytes()),'lockSha256':digest(LOCK.read_bytes()),'compilerSha256':digest(compiler.read_bytes()),'compilerCommit':lock['compiler']['commit'],'goVersion':lock['go']['version'],'flags':flags,'rawArtifactSha256':digest(raw),'artifactSha256':digest(artifacts[0].read_bytes()),'normalizerSha256':digest(Path(__file__).read_bytes()),'inspectorSha256':digest((Path(__file__).parent/'phase5a_inspect_upload.py').read_bytes()),'nativeContractSha256':digest((MIGRATION/'build/upload-native-contract.json').read_bytes()),'transformation':'explicit actual Import Question action index; editor note after deviceCode Text; deterministic unique control groups from native nesting; each menu options rebuilt from its own native branch titles; action order preserved','inspection':inspection,'nativeExecution':'not performed','signing':'not performed','reproducibility':'not established; action/control-flow arrays are never sorted'}
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    return artifacts[0]

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--compiler',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path)
    a=p.parse_args()
    print(build(a.compiler,a.output))
