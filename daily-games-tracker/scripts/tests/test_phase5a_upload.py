"""Focused native full-client contract and compiler repair regressions."""
import copy
import json
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import phase5a_build_upload as b
import phase5a_inspect_upload as i
import phase5a_upload_signing as s
TEST_RUNTIME_ORIGIN='https://runtime.example.invalid'
TEST_TMP=b.ROOT/'tmp/phase5a-upload-tests'
TEST_TMP.mkdir(parents=True,exist_ok=True)

def fixture():
    # Reconstruct UUID spellings only; this is the reviewed complete native
    # contract, not a second source renderer or implementation of game logic.
    w=i._replace_origin_token(
        json.loads(i.CONTRACT.read_text(encoding='utf-8')),
        TEST_RUNTIME_ORIGIN,
    )
    for action in w['WFWorkflowActions']:
        p=action.get('WFWorkflowActionParameters',{})
        if 'WFJavaScript' in p: p['WFJavaScript']=b.CAPTURE.read_text(encoding='utf-8')
    return w

def params(w,kind=None,output=None,key=None,n=0):
    candidates=[]
    for a in w['WFWorkflowActions']:
        p=a.get('WFWorkflowActionParameters',{})
        if kind and not a['WFWorkflowActionIdentifier'].endswith('.'+kind): continue
        if output and p.get('CustomOutputName')!=output: continue
        if key and p.get('WFDictionaryKey')!=key: continue
        candidates.append(p)
    return candidates[n]

class UploadContractTests(unittest.TestCase):
    def test_runtime_origin_fails_without_argument_or_environment(self):
        with patch.dict(b.os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, 'runtime origin'):
                b.runtime_origin()

    def test_runtime_origin_uses_an_explicit_environment_value(self):
        with patch.dict(b.os.environ, {'WHT_RUNTIME_ORIGIN': TEST_RUNTIME_ORIGIN}, clear=True):
            self.assertEqual(b.runtime_origin(), TEST_RUNTIME_ORIGIN)

    def test_cli_requires_runtime_origin(self):
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            root = Path(directory)
            result = subprocess.run(
                [sys.executable, str(Path(b.__file__).resolve()), '--compiler', str(root/'missing-compiler'), '--output', str(root/'output')],
                capture_output=True, text=True, check=False,
            )
        self.assertEqual(result.returncode, 2)
        self.assertIn('--runtime-origin', result.stderr)

    def test_reviewed_contract(self):
        # The accepted upload tail still has validate/submit; Phase 5B adds
        # the separate device-approval request ahead of it.
        self.assertEqual(i.inspect(fixture(), runtime_origin=TEST_RUNTIME_ORIGIN)['networkActions'],3)

    def test_login_return_contract_matches_current_source(self):
        source = b.SOURCE.read_text(encoding='utf-8')
        self.assertIn('@loginReturnURL = getValue(@loginResponse, "return_url")', source)
        self.assertIn('item "Return to WHT":', source)
        self.assertIn('whtOpenURL(@loginReturnURL)\n                        stop()', source)

        workflow = fixture()
        i.inspect(workflow, runtime_origin=TEST_RUNTIME_ORIGIN)
        actions = workflow['WFWorkflowActions']
        params_by_index = [a.get('WFWorkflowActionParameters', {}) for a in actions]
        return_reads = [
            (index, params)
            for index, params in enumerate(params_by_index)
            if actions[index]['WFWorkflowActionIdentifier'].endswith('.getvalueforkey')
            and params.get('WFDictionaryKey') == 'return_url'
        ]
        self.assertEqual(len(return_reads), 1)
        return_index, return_params = return_reads[0]
        self.assertEqual(return_params['WFInput']['Value']['VariableName'], 'loginResponse')
        self.assertEqual(params_by_index[return_index + 1]['WFVariableName'], 'loginReturnURL')

        success_menus = [
            (index, params)
            for index, params in enumerate(params_by_index)
            if actions[index]['WFWorkflowActionIdentifier'].endswith('.choosefrommenu')
            and params.get('WFControlFlowMode') == 0
            and [item['WFValue'] for item in params.get('WFMenuItems', [])]
            == ['Close', 'Return to WHT']
        ]
        self.assertEqual(len(success_menus), 1)
        menu_index, menu = success_menus[0]
        self.assertEqual(menu['WFMenuPrompt'], 'Login approved. Return to WHT in Safari?')
        group = menu['GroupingIdentifier']
        close_index = next(
            index for index in range(menu_index + 1, len(actions))
            if params_by_index[index].get('GroupingIdentifier') == group
            and params_by_index[index].get('WFMenuItemTitle') == 'Close'
        )
        return_item_index = next(
            index for index in range(close_index + 1, len(actions))
            if params_by_index[index].get('GroupingIdentifier') == group
            and params_by_index[index].get('WFMenuItemTitle') == 'Return to WHT'
        )
        self.assertEqual(actions[close_index + 1]['WFWorkflowActionIdentifier'], 'is.workflow.actions.exit')
        self.assertEqual(actions[return_item_index + 1]['WFWorkflowActionIdentifier'], 'is.workflow.actions.openurl')
        return_open_params = params_by_index[return_item_index + 1]
        self.assertEqual(return_open_params['WFInput']['Value']['VariableName'], 'loginReturnURL')
        self.assertEqual(actions[return_item_index + 2]['WFWorkflowActionIdentifier'], 'is.workflow.actions.exit')

    def test_login_return_native_mutations_rejected(self):
        mutations = []

        def remove_return_read(workflow):
            actions = workflow['WFWorkflowActions']
            actions[:] = [
                action for action in actions
                if action.get('WFWorkflowActionParameters', {}).get('WFDictionaryKey') != 'return_url'
            ]
        mutations.append(remove_return_read)

        def hard_code_return_target(workflow):
            for action in workflow['WFWorkflowActions']:
                params = action.get('WFWorkflowActionParameters', {})
                if action['WFWorkflowActionIdentifier'].endswith('.openurl') and params.get('WFInput', {}).get('Value', {}).get('VariableName') == 'loginReturnURL':
                    params['WFInput'] = {'Value': 'https://example.invalid', 'WFSerializationType': 'WFTextTokenString'}
                    return
            raise AssertionError('return URL action not found')
        mutations.append(hard_code_return_target)

        def remove_return_stop(workflow):
            actions = workflow['WFWorkflowActions']
            for index, action in enumerate(actions):
                if action.get('WFWorkflowActionParameters', {}).get('WFMenuItemTitle') == 'Return to WHT':
                    del actions[index + 2]
                    return
            raise AssertionError('Return to WHT menu item not found')
        mutations.append(remove_return_stop)

        def remove_close_stop(workflow):
            actions = workflow['WFWorkflowActions']
            for index, action in enumerate(actions):
                if action.get('WFWorkflowActionParameters', {}).get('WFMenuItemTitle') == 'Close':
                    del actions[index + 1]
                    return
            raise AssertionError('Close menu item not found')
        mutations.append(remove_close_stop)

        for number, mutate in enumerate(mutations):
            with self.subTest(mutation=number):
                workflow = fixture()
                mutate(workflow)
                with self.assertRaises((AssertionError, KeyError, IndexError)):
                    i.inspect(workflow, require_contract=False, runtime_origin=TEST_RUNTIME_ORIGIN)

    def test_native_mutations_rejected(self):
        mutations=[
            lambda w:w['WFWorkflowImportQuestions'][0].update(ActionIndex=0),
            lambda w:w['WFWorkflowImportQuestions'][0].update(ActionIndex=True),
            lambda w:w['WFWorkflowImportQuestions'][0].update(DefaultValue='CONFIGURED'),
            lambda w:w['WFWorkflowActions'][0]['WFWorkflowActionParameters']['WFInput']['Value'].update(Type='Clipboard'),
            lambda w:w['WFWorkflowActions'][1]['WFWorkflowActionParameters'].update(WFTextActionText='CONFIGURED'),
            lambda w:params(w,'runjavascriptonwebpage').update(WFJavaScript='completion({})'),
            lambda w:params(w,'downloadurl').update(WFHTTPBodyType='JSON'),
            lambda w:params(w,'downloadurl').update(WFURL='https://example.invalid'),
            lambda w:params(w,'downloadurl',n=1)['WFRequestVariable']['Value'].update(OutputUUID='disconnected'),
            lambda w:params(w,'choosefrommenu').update(WFMenuItems=[{'WFValue':'Close'}]),
            lambda w:next(p for a in w['WFWorkflowActions'] if (p:=a.get('WFWorkflowActionParameters',{})).get('WFConditionalActionString')=='DGT_LOGIN_V1:').update(WFCondition=99),
            lambda w:next(a for a in w['WFWorkflowActions'][40:] if a['WFWorkflowActionIdentifier']=='is.workflow.actions.exit').update(WFWorkflowActionIdentifier='is.workflow.actions.nothing'),
            lambda w:next(p for a in w['WFWorkflowActions'] if (p:=a.get('WFWorkflowActionParameters',{})).get('WFCondition')==100).update(WFCondition=101),
            lambda w:next(p for a in reversed(w['WFWorkflowActions']) if (p:=a.get('WFWorkflowActionParameters',{})).get('WFConditionalActionString')=='Text').update(WFConditionalActionString='Number'),
            lambda w:w['WFWorkflowActions'].reverse(),
            lambda w:w['WFWorkflowActions'].insert(0,{'WFWorkflowActionIdentifier':'is.workflow.actions.setclipboard'}),
            lambda w:params(w,output='captureJson')['WFInput']['Value'].update(VariableName='validationResponse'),
            lambda w:params(w,key='wht_url').update(WFDictionaryKey='install_url'),
        ]
        for number,mutate in enumerate(mutations):
            with self.subTest(mutation=number):
                w=fixture();mutate(w)
                with self.assertRaises((AssertionError,KeyError,IndexError)): i.inspect(w, runtime_origin=TEST_RUNTIME_ORIGIN)

    def test_compiler_control_and_menu_repair(self):
        desired=fixture(); raw=copy.deepcopy(desired)
        raw['WFWorkflowActions'].pop(2)
        raw['WFWorkflowImportQuestions'][0].pop('ActionIndex')
        for action in raw['WFWorkflowActions']:
            p=action.get('WFWorkflowActionParameters',{})
            if 'GroupingIdentifier' in p: p['GroupingIdentifier']='compiler-reused-id'
            if p.get('WFControlFlowMode')==2: p['UUID']='compiler-reused-id'
            if 'WFMenuItems' in p: p['WFMenuItems']=[{'WFValue':'Close'},{'WFValue':'Open WHT'}]
        repaired=b.normalize(raw)
        self.assertEqual(i.canonical(repaired),i.canonical(desired))
        i.inspect(repaired, runtime_origin=TEST_RUNTIME_ORIGIN)
        self.assertNotEqual(raw,repaired)
        self.assertEqual(raw['WFWorkflowActions'][0],repaired['WFWorkflowActions'][0])

    def test_normalizer_rejects_ambiguous_or_configured_question(self):
        for target in ('duplicate','configured','wrong-index'):
            raw=fixture();raw['WFWorkflowActions'].pop(2)
            if target=='duplicate': raw['WFWorkflowActions'].append(copy.deepcopy(raw['WFWorkflowActions'][1]))
            if target=='configured': raw['WFWorkflowActions'][1]['WFWorkflowActionParameters']['WFTextActionText']='secret'
            if target=='wrong-index': raw['WFWorkflowImportQuestions'][0]['ActionIndex']=0
            with self.assertRaises(AssertionError): b.normalize(raw)

    def test_script_render_is_exact_single_embedding(self):
        rendered=b.render_source(TEST_RUNTIME_ORIGIN)
        self.assertNotIn('__WHT_CAPTURE_SCRIPT__',rendered)
        self.assertNotIn(b.RUNTIME_ORIGIN_TOKEN, rendered)
        self.assertIn(TEST_RUNTIME_ORIGIN, rendered)
        self.assertEqual(rendered.count(b.CAPTURE.read_text(encoding='utf-8').replace("'","\\'")),1)

    def test_runtime_origin_is_injected_only_after_strict_origin_validation(self):
        origin = TEST_RUNTIME_ORIGIN
        with self.assertRaises(ValueError):
            b.validate_runtime_origin(origin, allow_fixture=False)
        rendered = b.render_source(origin)
        expected_endpoints = (
            'https://runtime.example.invalid/api/auth/device/approve',
            'https://runtime.example.invalid/api/import/validate',
            'https://runtime.example.invalid/api/import/submit',
        )
        for endpoint in expected_endpoints:
            with self.subTest(endpoint=endpoint):
                self.assertEqual(rendered.count('"' + endpoint + '"'), 1)
        self.assertNotIn(b.RUNTIME_ORIGIN_TOKEN, rendered)
        for invalid in (
            'http://runtime.example.invalid',
            'https://runtime.example.invalid/path',
            'https://runtime.example.invalid/',
            ' https://runtime.example.invalid',
            'https://user:pass@runtime.example.invalid',
        ):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                b.render_source(invalid)

    def test_contract_token_is_bound_to_the_same_runtime_origin(self):
        origin = TEST_RUNTIME_ORIGIN
        workflow = i._replace_origin_token(
            json.loads(i.CONTRACT.read_text(encoding='utf-8')), origin
        )
        for action in workflow['WFWorkflowActions']:
            params = action.get('WFWorkflowActionParameters', {})
            if 'WFJavaScript' in params:
                params['WFJavaScript'] = b.CAPTURE.read_text(encoding='utf-8')
        self.assertEqual(i.inspect(workflow, runtime_origin=origin)['networkActions'], 3)

    def package(self,root):
        build=root/'build';build.mkdir()
        raw=fixture();raw['WFWorkflowActions'].pop(2);raw['WFWorkflowImportQuestions'][0].pop('ActionIndex')
        raw_bytes=plistlib.dumps(raw);binary=plistlib.dumps(b.normalize(raw))
        (build/'compiler-output.shortcut').write_bytes(raw_bytes)
        (build/'Upload To WHT_unsigned.shortcut').write_bytes(binary)
        (build/'upload-to-wht.cherri').write_text(b.render_source(TEST_RUNTIME_ORIGIN),encoding='utf-8')
        manifest={'sourceSha256':b.digest(b.SOURCE.read_bytes()),'artifactSha256':b.digest(binary),'rawArtifactSha256':b.digest(raw_bytes),'lockSha256':b.digest(b.LOCK.read_bytes()),'normalizerSha256':b.digest(Path(b.__file__).read_bytes()),'inspectorSha256':b.digest(Path(i.__file__).read_bytes()),'nativeContractSha256':b.digest(i.CONTRACT.read_bytes())}
        manifest['captureSha256']=b.digest(b.CAPTURE.read_bytes())
        manifest['renderedSourceSha256']=b.digest((build/'upload-to-wht.cherri').read_bytes())
        (build/'manifest.json').write_text(json.dumps(manifest),encoding='utf-8')
        package=root/'package';info=s.freeze(build,package,runtime_origin=TEST_RUNTIME_ORIGIN)
        return package,info

    def test_package_validation_keeps_unsigned_payload_and_requires_exact_digests(self):
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            root=Path(directory);package,info=self.package(root)
            payload=s.validate(package,info['manifestSha256'],info['wireSha256'],runtime_origin=TEST_RUNTIME_ORIGIN)
            self.assertTrue(payload.startswith(b'<?xml'))
            with self.assertRaises(AssertionError):
                s.validate(package,'0'*64,info['wireSha256'],runtime_origin=TEST_RUNTIME_ORIGIN)
    def test_freeze_rejects_capture_and_rendered_source_provenance_drift(self):
        for field in ('captureSha256','renderedSourceSha256'):
            with self.subTest(field=field), tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
                root=Path(directory);self.package(root)
                manifest_path=root/'build/manifest.json'
                manifest=json.loads(manifest_path.read_bytes());manifest[field]='0'*64
                manifest_path.write_text(json.dumps(manifest),encoding='utf-8')
                with self.assertRaises(AssertionError): s.freeze(root/'build',root/'rejected',runtime_origin=TEST_RUNTIME_ORIGIN)

    def test_wrong_approved_hashes_stop_before_protected_transfer(self):
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            root=Path(directory);package,info=self.package(root)
            for name,manifest,wire in (('manifest','0'*64,info['wireSha256']),('wire',info['manifestSha256'],'0'*64)):
                with self.subTest(name=name), self.assertRaises(AssertionError):
                    s.validate(package,manifest,wire,runtime_origin=TEST_RUNTIME_ORIGIN)

    def test_package_tampering_is_rejected_before_protected_transfer(self):
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            root=Path(directory);package,info=self.package(root)
            (package/'hubsign-request.json').write_bytes(b'changed')
            with self.assertRaises(AssertionError):
                s.validate(package,info['manifestSha256'],info['wireSha256'],runtime_origin=TEST_RUNTIME_ORIGIN)
if __name__=='__main__': unittest.main()
