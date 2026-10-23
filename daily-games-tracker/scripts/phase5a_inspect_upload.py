"""Strict native action contract for Upload to WHT; never runs the shortcut."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import plistlib

from phase5a_build_upload import CAPTURE, MIGRATION, NOTE, PROMPT

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

def inspect(workflow, require_contract=True):
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
    assert len(requests)==2
    for request,endpoint in zip(requests,['validate','submit']):
        assert request['WFURL']=='https://preview.example.invalid/api/import/'+endpoint
        assert request['WFHTTPMethod']=='POST' and request['WFHTTPBodyType']=='File'
        assert 'WFJSONValues' not in request and 'WFFormValues' not in request
        assert request['WFRequestVariable']['Value']['OutputName']=='requestJson'
    assert requests[0]['WFRequestVariable']==requests[1]['WFRequestVariable']
    def header_items(request):
        return {x['WFKey']['Value']['string']:x['WFValue'] for x in request['WFHTTPHeaders']['Value']['WFDictionaryFieldValueItems']}
    assert header_items(requests[0])==header_items(requests[1])
    assert ids.count('setclipboard')==1
    copy_index=ids.index('setclipboard')
    assert ids[copy_index-3:copy_index]==['conditional','getitemtype','conditional']
    assert p[copy_index-3]['WFCondition']==100
    assert p[copy_index-1]['WFConditionalActionString']=='Text'
    assert ids[-1]=='exit'
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
    assert menus==[['Cancel','Submit Results'],['Close','Open WHT']]
    if require_contract:
        expected=json.loads(CONTRACT.read_text(encoding='utf-8'))
        assert canonical(workflow)==expected, 'Native action contract mismatch (order, slot, reference or literal).'
    return {'structuralChecks':'passed','actions':len(a),'networkActions':2,'clipboardActions':1,'importQuestionActionIndex':1,'captureBytes':len(CAPTURE.read_bytes()),'nativeExecution':'not performed','dynamicSerialization':'requires native acceptance','transportAndCopyPermissionFailure':'native fail-stop requires acceptance'}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('shortcut',type=Path)
    args=parser.parse_args()
    print(json.dumps(inspect(plistlib.loads(args.shortcut.read_bytes())),indent=2))
