"""Structural checks only; never executes a Shortcut or contacts a service."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib

parser = argparse.ArgumentParser()
parser.add_argument('shortcut', type=Path)
parser.add_argument('--experiment', choices=['01', '02', '03', '04', '05', '06', '07'])
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
if args.experiment == '01':
    assert identifiers == ['is.workflow.actions.alert', 'is.workflow.actions.exit'], 'Alert probe must contain only the alert and explicit stop.'
    alert_parameters = actions[0].get('WFWorkflowActionParameters', {})
    assert alert_parameters.get('WFAlertActionTitle') == 'WHT build probe', 'Unexpected alert title.'
    assert alert_parameters.get('WFAlertActionMessage') == 'Credential-free compiler experiment.', 'Unexpected alert message.'
dictionary_item_types = {}
def groups(actions):
    """Return well-formed nested conditional/menu group intervals."""
    stack = []
    result = []
    for index, action in enumerate(actions):
        parameters = action.get('WFWorkflowActionParameters', {})
        mode = parameters.get('WFControlFlowMode')
        group_id = parameters.get('GroupingIdentifier')
        identifier = action.get('WFWorkflowActionIdentifier')
        group_type = 'menu' if identifier == 'is.workflow.actions.choosefrommenu' else 'conditional' if identifier == 'is.workflow.actions.conditional' else None
        if mode == 0:
            assert group_type and group_id, f'Unknown or unkeyed group start at action {index}.'
            stack.append({'type': group_type, 'id': group_id, 'start': index, 'markers': [], 'end': None})
        elif mode == 1:
            assert stack and stack[-1]['id'] == group_id, f'Unmatched group branch at action {index}.'
            assert stack[-1]['type'] == group_type, f'Group type changed at action {index}.'
            stack[-1]['markers'].append(index)
        elif mode == 2:
            assert stack and stack[-1]['id'] == group_id, f'Unmatched group end at action {index}.'
            group = stack.pop()
            assert group['type'] == group_type, f'Group type changed at action {index}.'
            group['end'] = index
            result.append(group)
    assert not stack, f'Unclosed groups: {stack}.'
    return result

def variable_name(value):
    if not isinstance(value, dict):
        return None
    reference = value.get('Value', {})
    if not isinstance(reference, dict):
        return None
    if reference.get('Type') == 'Variable':
        variable = reference.get('Variable', {})
        return (variable.get('VariableName') or variable.get('OutputName')) if isinstance(variable, dict) else None
    return reference.get('VariableName') or reference.get('OutputName')

def contains_text(value, expected):
    return expected in json.dumps(value, ensure_ascii=False, sort_keys=True)

def action_indices(identifier):
    return [i for i, action in enumerate(actions) if action.get('WFWorkflowActionIdentifier') == identifier]

def branch_bounds(group, marker_index):
    later = [i for i in group['markers'] if i > marker_index]
    return marker_index + 1, min(later) if later else group['end']

all_groups = groups(actions)
if args.experiment in ('02', '03', '04'):
    classes = shortcut.get('WFWorkflowInputContentItemClasses', [])
    assert len(classes) == 2 and set(classes) == {'WFSafariWebPageContentItem', 'WFStringContentItem'}, 'Wrong Share Sheet input classes.'
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
    body = parameters.get('WFJSONValues', {})
    assert body.get('WFSerializationType') == 'WFTextTokenAttachment', 'Request body must remain a native variable attachment.'
    assert body.get('Value', {}).get('VariableName') == 'body', 'Request body must reference the assembled body variable.'
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
    find_fields(actions)
    assert dictionary_item_types.get('shortcut_version') == 3, 'Version must be a native numeric dictionary item.'
    set_values = [a for a in actions if a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.setvalueforkey']
    def references_capture(action):
        value = action.get('WFWorkflowActionParameters', {}).get('WFDictionaryValue', {})
        reference = value.get('Value', {})
        return value.get('WFSerializationType') == 'WFTextTokenAttachment' and (
            reference.get('VariableName') == 'capture' or
            (reference.get('OutputName') == 'capture' and reference.get('Type') == 'ActionOutput')
        )
    capture_assignments = [a for a in set_values if references_capture(a)]
    assert len(capture_assignments) == 1, 'Nested capture must be inserted through one native variable-valued Set Dictionary Value action.'
    questions = shortcut.get('WFWorkflowImportQuestions', [])
    assert len(questions) == 1, 'Expected one mock-code Import Question.'
    question = questions[0]
    assert question.get('DefaultValue', '') == '', 'Question must have no configured credential.'
    assert question.get('ParameterKey') == 'WFTextActionText', 'Question must bind Text parameter.'
    index = question.get('ActionIndex', 0)
    assert identifiers[index] == 'is.workflow.actions.gettext', 'Question index does not target Text action.'
if args.experiment == '06':
    assert not requests, 'Routing probe must never contact a service.'
    menus = [g for g in all_groups if g['type'] == 'menu']
    assert len(menus) == 1, f'Expected one synthetic confirmation menu; found {len(menus)}.'
    menu = menus[0]
    menu_start = actions[menu['start']]['WFWorkflowActionParameters']
    menu_labels = [item.get('WFValue') for item in menu_start.get('WFMenuItems', [])]
    assert menu_labels == ['Cancel', '✅ Submit Results'], f'Unexpected confirmation options: {menu_labels}.'
    assert menu['markers'], 'Confirmation menu has no item markers.'
    cancel_start, cancel_end = branch_bounds(menu, menu['markers'][0])
    assert 'is.workflow.actions.exit' in identifiers[cancel_start:cancel_end], 'Cancel branch must stop.'
    submit_start, submit_end = branch_bounds(menu, menu['markers'][1])
    submit_actions = actions[submit_start:submit_end]
    assert any(a.get('WFWorkflowActionIdentifier') == 'is.workflow.actions.setvariable' and a.get('WFWorkflowActionParameters', {}).get('WFVariableName') == 'submitMarker' for a in submit_actions), 'Submission marker must be within Submit Results.'
    assert identifiers[-2] == 'is.workflow.actions.alert' and identifiers[-1] == 'is.workflow.actions.exit', 'Only the shared completion marker may follow routing.'
    assignments = [a for a in actions if a.get('WFWorkflowActionIdentifier') == 'is.workflow.actions.setvariable' and a.get('WFWorkflowActionParameters', {}).get('WFVariableName') == 'completionResponse']
    assert len(assignments) == 4, f'Expected one harmless initial value plus three accepted-response assignments; found {len(assignments)}.'
    sources = [variable_name(a.get('WFWorkflowActionParameters', {}).get('WFInput', {})) for a in assignments]
    assert sources.count('validationResponse') == 1 and sources.count('submitResponse') == 2, f'Completion assignments must use the accepted response directly: {sources}.'
    conditionals = [actions[g['start']].get('WFWorkflowActionParameters', {}) for g in all_groups if g['type'] == 'conditional']
    for status in ('already_submitted', 'valid', 'submitted'):
        assert any(contains_text(params, status) for params in conditionals), f'Missing explicit status comparison for {status}.'
    assert any(contains_text(a.get('WFWorkflowActionParameters', {}), 'Shared synthetic completion') for a in actions if a.get('WFWorkflowActionIdentifier') == 'is.workflow.actions.alert'), 'Expected one shared completion marker.'
if args.experiment == '07':
    assert not requests, 'Completion probe must never contact a service.'
    clipboards = action_indices('is.workflow.actions.setclipboard')
    assert len(clipboards) == 4, f'Expected one guarded clipboard action per fixture; found {len(clipboards)}.'
    conditional_groups = [g for g in all_groups if g['type'] == 'conditional']
    expected_scoreboards = {'presentScoreboard', 'emptyScoreboard', 'nullScoreboard', 'missingScoreboard'}
    clipboard_sources = []
    for index in clipboards:
        containing = [g for g in conditional_groups if g['start'] < index < g['end']]
        assert len(containing) == 1, f'Clipboard action {index} must be in one scoreboard presence guard.'
        input_value = actions[index].get('WFWorkflowActionParameters', {}).get('WFInput', {})
        assert input_value.get('WFSerializationType') == 'WFTextTokenAttachment', 'Clipboard must receive a native variable reference.'
        clipboard_sources.append(variable_name(input_value))
    assert set(clipboard_sources) == expected_scoreboards and len(clipboard_sources) == len(expected_scoreboards), f'Each fixture must guard copying its own extracted scoreboard: {clipboard_sources}.'
    menus = [g for g in all_groups if g['type'] == 'menu']
    assert len(menus) == 1, f'Expected one shared completion menu; found {len(menus)}.'
    menu = menus[0]
    menu_params = actions[menu['start']]['WFWorkflowActionParameters']
    labels = [item.get('WFValue') for item in menu_params.get('WFMenuItems', [])]
    assert labels == ['Close', 'Open WHT'], f'Unexpected completion menu options: {labels}.'
    open_urls = action_indices('is.workflow.actions.openurl')
    assert len(open_urls) == 1, f'Expected one Open WHT action, found {len(open_urls)}.'
    open_index = open_urls[0]
    assert menu['markers'], 'Completion menu has no option markers.'
    close_start, close_end = branch_bounds(menu, menu['markers'][0])
    assert 'is.workflow.actions.exit' in identifiers[close_start:close_end], 'Close branch must stop.'
    open_start, open_end = branch_bounds(menu, menu['markers'][1])
    assert open_start <= open_index < open_end, 'Open WHT must be inside its menu branch.'
    assert 'is.workflow.actions.exit' in identifiers[open_index + 1:open_end], 'Open WHT must stop after opening.'
    assert open_index > max(clipboards), 'Completion menu must follow every guarded clipboard action.'
    open_params = actions[open_index].get('WFWorkflowActionParameters', {})
    assert open_params.get('Show-WFInput') is True, 'Open WHT must show the URL input.'
    assert contains_text(open_params.get('WFInput', {}), 'whtURL'), 'Open WHT must reference the extracted synthetic URL.'
    assert contains_text(menu_params.get('WFMenuPrompt', {}), 'completionMessage'), 'Completion prompt must reference the response message.'
print(json.dumps({'file': args.shortcut.name, 'sha256': hashlib.sha256(data).hexdigest(), 'actions': len(actions), 'experiment': args.experiment, 'structuralChecks': 'passed', 'dictionaryItemTypes': dictionary_item_types, 'nativeExecution': 'not performed', 'runtimeJSONTypes': 'unproven' if args.experiment == '05' else 'not applicable'}))
