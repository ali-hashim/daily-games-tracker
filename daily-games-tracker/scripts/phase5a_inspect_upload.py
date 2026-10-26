"""Strict native action contract for Upload to WHT; never runs the shortcut."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import plistlib

from phase5a_build_upload import (
    CAPTURE,
    MIGRATION,
    NOTE,
    PROMPT,
    RUNTIME_ORIGIN_TOKEN,
    runtime_origin as resolve_runtime_origin,
)

CONTRACT = MIGRATION/'build/upload-native-contract.json'

def canonical(workflow):
    """Normalize only identifier spelling and dictionary-field/key ordering.

    Action/control-flow/menu arrays always retain their exact order. Native
    Dictionary field ordering is not meaningful; names, types, tokens remain.
    """
    ids = {}
    for a in workflow['WFWorkflowActions']:
        p=a.get('WFWorkflowActionParameters',{})
        for key in ('UUID','GroupingIdentifier'):
            if key in p and p[key] not in ids:
                ids[p[key]]=f'native-id-{len(ids)}'
    def visit(value,key=''):
        if key=='WFJavaScript':
            return {'sha256':hashlib.sha256(value.encode()).hexdigest(),'bytes':len(value.encode())}
        if isinstance(value,str):
            return ids.get(value,value)
        if isinstance(value,list):
            result=[visit(x) for x in value]
            if key=='WFDictionaryFieldValueItems':
                result.sort(key=lambda x: x['WFKey']['Value']['string'])
            if key=='WFWorkflowInputContentItemClasses':
                result.sort()
            return result
        if isinstance(value,dict):
            return {k:visit(v,k) for k,v in value.items()}
        return value
    return visit(workflow)

def _replace_origin_token(value, origin):
    if isinstance(value, str):
        return value.replace(RUNTIME_ORIGIN_TOKEN, origin)
    if isinstance(value, list):
        return [_replace_origin_token(item, origin) for item in value]
    if isinstance(value, dict):
        return {key: _replace_origin_token(item, origin) for key, item in value.items()}
    return value


def inspect(workflow, require_contract=True, runtime_origin=None):
    runtime_origin = resolve_runtime_origin(runtime_origin)
    a=workflow['WFWorkflowActions']
    p=[x.get('WFWorkflowActionParameters',{}) for x in a]
    ids=[x['WFWorkflowActionIdentifier'].removeprefix('is.workflow.actions.') for x in a]
    assert ids[0]=='setvariable' and p[0]['WFVariableName']=='originalInput'
    assert p[0]['WFInput']['Value']=={'Type':'ExtensionInput','VariableName':'ShortcutInput'}
    q,=workflow['WFWorkflowImportQuestions']
    assert type(q['ActionIndex']) is int and q['ActionIndex']==1
    assert q=={'ActionIndex':1,'Category':'Parameter','DefaultValue':'','ParameterKey':'WFTextActionText','Text':PROMPT}
    assert ids[1]=='gettext' and p[1]['WFTextActionText']=='' and p[1]['CustomOutputName']=='deviceCode'
    assert ids[2]=='comment' and p[2]['WFCommentActionText']==NOTE
    assert workflow['WFWorkflowTypes']==['ActionExtension']
    assert set(workflow['WFWorkflowInputContentItemClasses'])=={'WFSafariWebPageContentItem','WFStringContentItem'}
    script,=[x for x in p if 'WFJavaScript' in x]
    assert script['WFJavaScript'].encode()==CAPTURE.read_bytes()
    assert script['WFInput']['Value']=={'Type':'Variable','VariableName':'originalInput'}
    requests=[x for i,x in enumerate(p) if ids[i]=='downloadurl']
    assert len(requests)==3
    for request,endpoint in zip(requests,['auth/device/approve','import/validate','import/submit']):
        assert request['WFURL']==runtime_origin+'/api/'+endpoint
        assert request['WFHTTPMethod']=='POST' and request['WFHTTPBodyType']=='File'
        assert 'WFJSONValues' not in request and 'WFFormValues' not in request
    assert requests[0]['WFRequestVariable']['Value']['OutputName']=='loginJson'
    assert requests[1]['WFRequestVariable']['Value']['OutputName']=='requestJson'
    assert requests[1]['WFRequestVariable']==requests[2]['WFRequestVariable']
    def header_items(request):
        return {x['WFKey']['Value']['string']:x['WFValue'] for x in request['WFHTTPHeaders']['Value']['WFDictionaryFieldValueItems']}
    assert header_items(requests[0])==header_items(requests[1])==header_items(requests[2])
    login_index=ids.index('downloadurl')
    assert ids[login_index-2:login_index]==['setvariable','detect.text']
    assert p[login_index-2]['WFVariableName']=='loginBody'
    assert p[login_index-1]['CustomOutputName']=='loginJson'
    assert p[login_index]['WFRequestVariable']['Value']['OutputName']=='loginJson'
    login_dispatch=ids.index('conditional', ids.index('detect.text'))
    assert p[login_dispatch]['WFConditionalActionString']=='DGT_LOGIN_V1:'
    assert ids.count('setclipboard')==1
    copy_index=ids.index('setclipboard')
    assert ids[copy_index-3:copy_index]==['conditional','getitemtype','conditional']
    assert p[copy_index-3]['WFCondition']==100
    assert p[copy_index-1]['WFConditionalActionString']=='Text'
    assert ids[-2:] == ['exit', 'openapp']
    assert p[-1]['WFAppIdentifier'] == 'com.apple.AppStore'
    assert p[-1]['WFSelectedApp'] == {'BundleIdentifier': 'com.apple.AppStore'}
    approved_start = next(i for i,x in enumerate(p)
                          if ids[i]=='conditional'
                          and x.get('WFControlFlowMode')==0
                          and x.get('WFConditionalActionString')=='approved')
    approved_group = p[approved_start]['GroupingIdentifier']
    approved_end = next(i for i in range(approved_start + 1, len(p))
                        if ids[i]=='conditional'
                        and p[i].get('WFControlFlowMode')==2
                        and p[i].get('GroupingIdentifier')==approved_group)
    return_reads = [i for i,x in enumerate(p)
                    if ids[i]=='getvalueforkey' and x.get('WFDictionaryKey')=='return_url']
    assert len(return_reads)==1 and approved_start < return_reads[0] < approved_end
    return_index = return_reads[0]
    assert p[return_index]['WFInput']['Value']=={'Type':'Variable','VariableName':'loginResponse'}
    assert p[return_index + 1]['WFVariableName']=='loginReturnURL'
    success_start = next(i for i,x in enumerate(p)
                         if ids[i]=='choosefrommenu'
                         and x.get('WFControlFlowMode')==0
                         and x.get('WFMenuItems')==[{'WFValue':'Close'},{'WFValue':'Return to WHT'}])
    assert approved_start < success_start < approved_end
    success_group = p[success_start]['GroupingIdentifier']
    assert p[success_start]['WFMenuPrompt']=='Login approved. Return to WHT in Safari?'
    success_end = next(i for i in range(success_start + 1, approved_end)
                       if ids[i]=='choosefrommenu'
                       and p[i].get('WFControlFlowMode')==2
                       and p[i].get('GroupingIdentifier')==success_group)
    close_index = next(i for i in range(success_start + 1, success_end)
                       if p[i].get('WFMenuItemTitle')=='Close'
                       and p[i].get('GroupingIdentifier')==success_group)
    return_item_index = next(i for i in range(close_index + 1, success_end)
                             if p[i].get('WFMenuItemTitle')=='Return to WHT'
                             and p[i].get('GroupingIdentifier')==success_group)
    assert ids[close_index + 1]=='exit'
    assert ids[return_item_index + 1]=='openurl'
    assert p[return_item_index + 1]['WFInput']['Value']=={'Type':'Variable','VariableName':'loginReturnURL'}
    assert 'WFURL' not in p[return_item_index + 1]
    assert ids[return_item_index + 2]=='exit'
    stack=[]; groups=set(); menus=[]
    for i,x in enumerate(p):
        mode=x.get('WFControlFlowMode')
        if mode is None: continue
        group=x['GroupingIdentifier']
        if mode==0:
            assert group not in groups, 'Control group reused.'
            groups.add(group); stack.append((group,i,[]))
        else:
            assert stack and stack[-1][0]==group
            if ids[i]=='choosefrommenu' and mode==1: stack[-1][2].append(x['WFMenuItemTitle'])
        if mode==2:
            _,start,titles=stack.pop()
            if ids[i]=='choosefrommenu':
                assert p[start]['WFMenuItems']==[{'WFValue':t} for t in titles]
                menus.append(titles)
    assert not stack
    assert menus==[['Close','Return to WHT'],['Cancel','Approve Login'],['Cancel','Submit Results'],['Close','Open WHT']]
    if require_contract:
        expected=_replace_origin_token(json.loads(CONTRACT.read_text(encoding='utf-8')), runtime_origin)
        assert canonical(workflow)==expected, 'Native action contract mismatch (order, slot, reference or literal).'
    return {'structuralChecks':'passed','actions':len(a),'networkActions':3,'clipboardActions':1,'importQuestionActionIndex':1,'captureBytes':len(CAPTURE.read_bytes()),'nativeExecution':'not performed','dynamicSerialization':'requires native acceptance','transportAndCopyPermissionFailure':'native fail-stop requires acceptance'}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('shortcut',type=Path)
    parser.add_argument('--runtime-origin', default=None,
                        help='HTTPS origin; defaults to WHT_RUNTIME_ORIGIN or a generic fixture origin')
    args=parser.parse_args()
    print(json.dumps(inspect(plistlib.loads(args.shortcut.read_bytes()), runtime_origin=args.runtime_origin),indent=2))
