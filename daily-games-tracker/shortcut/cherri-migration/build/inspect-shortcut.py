"""Structural checks only; never executes a Shortcut or contacts a service."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib

parser = argparse.ArgumentParser()
parser.add_argument('shortcut', type=Path)
parser.add_argument('--experiment', choices=['01', '02', '03', '04', '05'])
parser.add_argument('--capture', type=Path)
parser.add_argument('--require-signed', action='store_true')
args = parser.parse_args()
data = args.shortcut.read_bytes()
if args.require_signed:
    if not data.startswith(b'AEA1'):
        raise SystemExit('Missing signed Shortcut AEA1 container header.')
    print(json.dumps({'sha256': hashlib.sha256(data).hexdigest(), 'containerHeader': 'AEA1', 'signatureValidation': 'not performed', 'nativeExecution': 'not performed'}))
    raise SystemExit(0)
shortcut = plistlib.loads(data)
actions = shortcut.get('WFWorkflowActions', [])
assert isinstance(actions, list) and actions, 'No workflow actions.'
identifiers = [a['WFWorkflowActionIdentifier'] for a in actions]
assert identifiers[-1] == 'is.workflow.actions.exit', 'Probe must explicitly stop.'
requests = [a for a in actions if a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.downloadurl']
assert len(requests) == (1 if args.experiment == '05' else 0), 'Unexpected network action count.'
dictionary_item_types = {}
if args.experiment in ('02', '03', '04'):
    assert shortcut.get('WFWorkflowInputContentItemClasses') == ['WFSafariWebPageContentItem', 'WFStringContentItem'], 'Wrong Share Sheet input classes/order.'
    assert shortcut.get('WFWorkflowTypes') == ['ActionExtension'], 'Wrong workflow surfaces.'
    saved = [a for a in actions if a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.setvariable' and a.get('WFWorkflowActionParameters', {}).get('WFVariableName') == 'originalInput']
    assert len(saved) == 1, 'Original input not captured exactly once.'
if args.experiment in ('03', '04'):
    safari = [a for a in actions if a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.runjavascriptonwebpage']
    assert len(safari) == 1, 'Expected one Safari JavaScript action.'
    parameters = safari[0]['WFWorkflowActionParameters']
    page = parameters.get('WFInput', {})
    assert page.get('WFSerializationType') == 'WFTextTokenAttachment', 'Safari input is not a native variable reference.'
    assert page.get('Value', {}).get('VariableName') == 'originalInput', 'Safari input does not bind saved page.'
    javascript = parameters.get('WFJavaScript')
    assert isinstance(javascript, str), 'JavaScript unexpectedly interpolated/coerced.'
    if args.experiment == '04':
        assert args.capture, 'Exact capture inspection requires --capture.'
        assert javascript.encode('utf-8') == args.capture.read_bytes(), 'Embedded capture differs from maintained source.'
if args.experiment == '05':
    parameters = requests[0]['WFWorkflowActionParameters']
    assert parameters.get('WFURL') == 'http://127.0.0.1:8765/probe', 'Probe must target only disposable loopback receiver.'
    assert parameters.get('WFHTTPMethod') == 'POST' and parameters.get('WFHTTPBodyType') == 'JSON', 'Wrong request type.'
    def find_fields(value):
        if isinstance(value, dict):
            if 'WFKey' in value and 'WFValue' in value:
                key = value['WFKey']
                if isinstance(key, dict):
                    key = key.get('Value', {}).get('string')
                if isinstance(key, str):
                    dictionary_item_types[key] = value.get('WFItemType', 0)
            for child in value.values():
                find_fields(child)
        elif isinstance(value, list):
            for child in value:
                find_fields(child)
    find_fields(parameters.get('WFJSONValues'))
    assert dictionary_item_types.get('shortcut_version') == 3, 'Version must be a native numeric dictionary item.'
    assert 'capture' in dictionary_item_types, 'Missing capture field.'
    questions = shortcut.get('WFWorkflowImportQuestions', [])
    assert len(questions) == 1, 'Expected one mock-code Import Question.'
    question = questions[0]
    assert question.get('DefaultValue', '') == '', 'Question must have no configured credential.'
    assert question.get('ParameterKey') == 'WFTextActionText', 'Question must bind Text parameter.'
    index = question.get('ActionIndex', 0)
    assert identifiers[index] == 'is.workflow.actions.gettext', 'Question index does not target Text action.'
print(json.dumps({'file': args.shortcut.name, 'sha256': hashlib.sha256(data).hexdigest(), 'actions': len(actions), 'experiment': args.experiment, 'structuralChecks': 'passed', 'dictionaryItemTypes': dictionary_item_types, 'nativeExecution': 'not performed', 'runtimeJSONTypes': 'unproven' if args.experiment == '05' else 'not applicable'}))
