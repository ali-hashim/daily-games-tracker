"""Legacy credential-free inspection for synthetic Phase 5A fixtures.

This module retains the historical two-request import contract: validate and
submit use JSON bodies attached to one native request-body variable.  It reads
an unsigned Shortcut plist from disk and never downloads a Shortcut, resolves
an iCloud URL, executes a native action, or contacts an API.  The synthetic
fixtures and mutation tests that exercise this contract remain useful
historical coverage.

The maintained Upload to WHT full-client source uses three approval/validate/
submit requests with File bodies and an explicit exit/open-app completion
route.  Inspect that current artifact with ``phase5a_inspect_upload.py``;
this legacy inspector is not its authoritative contract.  Both tools report
static evidence only; iPhone behavior, transport failures, and Copy to
Clipboard permission failures remain runtime acceptance items.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
import plistlib
import re
from typing import Any, Iterable


class ShortcutInspectionError(AssertionError):
    """Raised when a workflow violates a Phase 5A static invariant."""


def _fail(message: str) -> None:
    raise ShortcutInspectionError(message)


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def _strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from _strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from _strings(child)


def _has_text(value: Any, text: str) -> bool:
    return text in _json(value)


def _variable_name(value: Any) -> str | None:
    """Return a native variable name from common Shortcuts token shapes."""
    if not isinstance(value, dict):
        return None
    for key in ("VariableName", "OutputName"):
        if isinstance(value.get(key), str):
            return value[key]
    nested = value.get("Variable")
    if isinstance(nested, dict):
        name = _variable_name(nested)
        if name:
            return name
    for key in ("Value", "WFInput", "WFValue", "WFDictionaryValue"):
        if key in value:
            name = _variable_name(value[key])
            if name:
                return name
    for child in value.values():
        name = _variable_name(child)
        if name:
            return name
    return None


def _references_variable(value: Any, expected: str | set[str]) -> bool:
    expected_names = {expected} if isinstance(expected, str) else expected
    if isinstance(value, dict):
        if any(value.get(key) in expected_names for key in ("VariableName", "OutputName")):
            return True
        nested = value.get("Variable")
        if isinstance(nested, dict) and _references_variable(nested, expected_names):
            return True
        return any(_references_variable(child, expected_names) for child in value.values())
    if isinstance(value, list):
        return any(_references_variable(child, expected_names) for child in value)
    return False


def _is_attachment(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    return value.get("WFSerializationType") == "WFTextTokenAttachment"


def _attachment_variable(value: Any) -> str | None:
    if not _is_attachment(value):
        return None
    return _variable_name(value)


def _numeric_literals(value: Any) -> list[int | float]:
    """Collect numeric literals while excluding Boolean values."""
    if isinstance(value, bool):
        return []
    if isinstance(value, (int, float)):
        return [value]
    if isinstance(value, dict):
        numbers: list[int | float] = []
        for child in value.values():
            numbers.extend(_numeric_literals(child))
        return numbers
    if isinstance(value, list):
        numbers: list[int | float] = []
        for child in value:
            numbers.extend(_numeric_literals(child))
        return numbers
    return []


def _string_literals(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        strings: list[str] = []
        for child in value.values():
            strings.extend(_string_literals(child))
        return strings
    if isinstance(value, list):
        strings: list[str] = []
        for child in value:
            strings.extend(_string_literals(child))
        return strings
    return []


def _references_property(value: Any, variable_names: set[str], property_names: set[str]) -> bool:
    """Check a native variable token for a response property extraction."""
    if not isinstance(value, (dict, list)):
        return False
    serialized = _json(value)
    return any(name in serialized for name in property_names) and any(
        _references_variable(value, name) for name in variable_names
    )


def _field_key(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    key = value.get("WFKey")
    if isinstance(key, str):
        return key
    if isinstance(key, dict):
        for candidate in (key.get("Value"), key):
            if isinstance(candidate, dict):
                text = candidate.get("string") or candidate.get("String")
                if isinstance(text, str):
                    return text
    return None


def _dictionary_fields(value: Any) -> list[tuple[str, Any, dict[str, Any]]]:
    """Find serialized Set Dictionary Value/JSON dictionary items."""
    found: list[tuple[str, Any, dict[str, Any]]] = []
    if isinstance(value, dict):
        key = _field_key(value)
        if key is not None and "WFValue" in value:
            found.append((key, value.get("WFValue"), value))
        for child in value.values():
            found.extend(_dictionary_fields(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(_dictionary_fields(child))
    return found


def _action_identifier(action: dict[str, Any]) -> str:
    return str(action.get("WFWorkflowActionIdentifier", ""))


def _params(action: dict[str, Any]) -> dict[str, Any]:
    value = action.get("WFWorkflowActionParameters", {})
    return value if isinstance(value, dict) else {}


@dataclass
class Group:
    kind: str
    identifier: str
    start: int
    markers: list[int]
    end: int

    def branch_bounds(self, marker: int | None = None) -> tuple[int, int]:
        if marker is None:
            return self.start + 1, self.end
        later = [index for index in self.markers if index > marker]
        return marker + 1, min(later) if later else self.end


def _groups(actions: list[dict[str, Any]]) -> list[Group]:
    """Parse nested menu/conditional intervals and reject malformed flow."""
    stack: list[dict[str, Any]] = []
    result: list[Group] = []
    kinds = {
        "is.workflow.actions.choosefrommenu": "menu",
        "is.workflow.actions.conditional": "conditional",
    }
    for index, action in enumerate(actions):
        params = _params(action)
        mode = params.get("WFControlFlowMode")
        if mode is None:
            continue
        try:
            mode = int(mode)
        except (TypeError, ValueError):
            _fail(f"Action {index} has a non-numeric control-flow mode.")
        identifier = _action_identifier(action)
        kind = kinds.get(identifier)
        grouping_id = params.get("GroupingIdentifier")
        if mode == 0:
            if kind is None or not grouping_id:
                _fail(f"Action {index} starts an unknown or unkeyed group.")
            stack.append({"kind": kind, "identifier": str(grouping_id), "start": index, "markers": []})
        elif mode == 1:
            if not stack or stack[-1]["identifier"] != grouping_id:
                _fail(f"Action {index} has an unmatched group branch.")
            if kind != stack[-1]["kind"]:
                _fail(f"Action {index} changes group type within a branch.")
            stack[-1]["markers"].append(index)
        elif mode == 2:
            if not stack or stack[-1]["identifier"] != grouping_id:
                _fail(f"Action {index} has an unmatched group end.")
            item = stack.pop()
            if kind != item["kind"]:
                _fail(f"Action {index} changes group type at group end.")
            result.append(Group(item["kind"], item["identifier"], item["start"], item["markers"], index))
        else:
            _fail(f"Action {index} uses unsupported control-flow mode {mode}.")
    if stack:
        _fail(f"Unclosed control-flow groups: {stack}.")
    return result


def _containing(groups: list[Group], index: int, kind: str | None = None) -> list[Group]:
    return [
        group
        for group in groups
        if group.start < index < group.end and (kind is None or group.kind == kind)
    ]


def _identifiers(actions: list[dict[str, Any]], start: int = 0, end: int | None = None) -> list[str]:
    return [_action_identifier(action) for action in actions[start:end]]


def _menu_labels(action: dict[str, Any]) -> list[str]:
    labels = []
    for item in _params(action).get("WFMenuItems", []):
        if isinstance(item, dict):
            value = item.get("WFValue")
            if isinstance(value, str):
                labels.append(value)
    return labels


def _menu_branch(actions: list[dict[str, Any]], group: Group, label_index: int) -> tuple[int, int]:
    if label_index >= len(group.markers):
        _fail(f"Menu {group.identifier} has no branch marker for item {label_index}.")
    return group.branch_bounds(group.markers[label_index])


def _assert_explicit_stop(actions: list[dict[str, Any]], start: int, end: int, context: str) -> None:
    if "is.workflow.actions.exit" not in _identifiers(actions, start, end):
        _fail(f"{context} has no explicit Stop This Shortcut action.")


def _find_requests(actions: list[dict[str, Any]]) -> list[tuple[int, dict[str, Any]]]:
    return [(index, action) for index, action in enumerate(actions) if _action_identifier(action) == "is.workflow.actions.downloadurl"]


def _assert_import_question(workflow: dict[str, Any], actions: list[dict[str, Any]]) -> None:
    questions = workflow.get("WFWorkflowImportQuestions", [])
    if not isinstance(questions, list) or len(questions) != 1:
        _fail("Expected exactly one credential-free Import Question.")
    question = questions[0]
    if question.get("DefaultValue", "") != "":
        _fail("Import Question must have an empty default; configured device codes are forbidden.")
    if question.get("ParameterKey") != "WFTextActionText":
        _fail("Import Question must bind the Text action parameter.")
    text_index = next(
        (index for index, action in enumerate(actions) if _action_identifier(action) == "is.workflow.actions.gettext"),
        None,
    )
    if text_index is None or question.get("ActionIndex") != text_index:
        _fail("Import Question must target the device-code Text action.")
    prompt = str(question.get("Text", "")).lower()
    if not all(word in prompt for word in ("private", "wht", "device", "code")):
        _fail("Import Question must explain that it requests the private WHT device code.")
    text_value = _params(actions[text_index]).get("WFTextActionText")
    if text_value not in (None, "", "DEVICE_CODE"):
        _fail("Device-code Text action contains configured credential material.")


def _assert_input_surface(workflow: dict[str, Any]) -> None:
    classes = workflow.get("WFWorkflowInputContentItemClasses", [])
    if set(classes or []) != {"WFSafariWebPageContentItem", "WFStringContentItem"}:
        _fail("Share Sheet must accept Safari Web Pages and Text input.")
    if workflow.get("WFWorkflowTypes") != ["ActionExtension"]:
        _fail("Shortcut must be exposed as an Action Extension.")


def _assert_requests(actions: list[dict[str, Any]], requests: list[tuple[int, dict[str, Any]]]) -> None:
    if len(requests) != 2:
        _fail(f"Expected exactly validate and submit requests; found {len(requests)}.")
    # Cherri commonly assembles one native body dictionary before the first
    # request and reuses its attachment for submit.  Therefore dictionary
    # item checks are workflow-wide, while each request still has to reference
    # a native body attachment.
    workflow_fields = _dictionary_fields(actions)
    workflow_field_names = {name for name, _, _ in workflow_fields}
    if not {"shortcut_version", "capture"}.issubset(workflow_field_names):
        _fail("Workflow must assemble shortcut_version and nested capture fields.")
    capture_values = [value for name, value, _ in workflow_fields if name == "capture"]
    if not any(_is_attachment(value) or _references_variable(value, {"original_capture", "capture"}) for value in capture_values):
        _fail("Workflow capture field is not a native attachment.")
    version_items = [item for name, _, item in workflow_fields if name == "shortcut_version"]
    if not any(item.get("WFItemType") in (3, "Number", "number") for item in version_items):
        _fail("Workflow shortcut_version is not statically numeric.")
    version_values: list[int | float] = []
    for name, value, item in workflow_fields:
        if name != "shortcut_version":
            continue
        version_values.extend(_numeric_literals(value))
        # Shortcuts may serialize a native Number dictionary item as a text
        # token while retaining WFItemType=3. Accept only the exact token 1.
        if item.get("WFItemType") in (3, "Number", "number"):
            version_values.extend(int(text) for text in _string_literals(value) if text in {"1", "2", "0"})
    if not version_values or any(number != 1 for number in version_values):
        _fail(f"Workflow shortcut_version must be the native Number value 1; found {version_values}.")
    capture_variables = {
        _attachment_variable(value)
        for name, value, _ in workflow_fields
        if name == "capture" and _attachment_variable(value)
    }
    if len(capture_variables) != 1:
        _fail(f"Validate and submit capture fields must reuse one original capture variable; found {sorted(capture_variables)}.")
    header_assignments = [
        action for action in actions
        if _action_identifier(action) == "is.workflow.actions.setvariable"
        and _params(action).get("WFVariableName") in {"authorization_header", "authorizationHeader"}
    ]
    if not header_assignments or not any(
        _references_variable(_params(action).get("WFInput", {}), {"device_code", "deviceCode"})
        for action in header_assignments
    ):
        _fail("Authorization header variable is not derived from the runtime device code.")
    paths: set[str] = set()
    body_variables: list[str] = []
    for index, action in requests:
        params = _params(action)
        method = str(params.get("WFHTTPMethod", "")).upper()
        if method != "POST" or params.get("WFHTTPBodyType") != "JSON":
            _fail(f"Request at action {index} must be POST with a JSON body.")
        url = params.get("WFURL")
        if not isinstance(url, str) or "/api/import/" not in url:
            _fail(f"Request at action {index} does not target an import endpoint.")
        paths.add(url.rsplit("/", 1)[-1])
        headers = params.get("WFHTTPHeaders")
        if not isinstance(headers, dict):
            _fail(f"Request at action {index} has no native HTTP headers dictionary.")
        authorization = next((value for key, value in headers.items() if str(key).lower() == "authorization"), None)
        if authorization is None:
            _fail(f"Request at action {index} has no Authorization header.")
        if not _is_attachment(authorization) and not _references_variable(authorization, {"authorization_header", "device_code"}):
            _fail(f"Request at action {index} Authorization header is not bound to the runtime device variable.")
        content_type = next((value for key, value in headers.items() if str(key).lower() == "content-type"), None)
        if content_type != "application/json":
            _fail(f"Request at action {index} must declare application/json.")
        body = params.get("WFJSONValues")
        if not _is_attachment(body):
            _fail(f"Request at action {index} JSON body must be a native variable attachment.")
        body_variable = _attachment_variable(body)
        if body_variable:
            body_variables.append(body_variable)
        if any(re.search(r"Device\s+[A-Za-z0-9_-]{8,}", text) for text in _strings(params)):
            _fail(f"Request at action {index} contains a literal device credential.")
    if paths != {"validate", "submit"}:
        _fail(f"Expected /validate and /submit endpoints; found {sorted(paths)}.")
    if len(body_variables) != len(requests) or len(set(body_variables)) != 1:
        _fail(f"Validate and submit must reuse one native request-body variable; found {body_variables}.")


def _assert_status_and_stop(actions: list[dict[str, Any]], groups: list[Group]) -> None:
    serialized = _json(actions)
    for status in ("already_submitted", "valid", "submitted", "error", "update_required"):
        if status not in serialized:
            _fail(f"Missing explicit status routing for {status}.")

    # Error/update branches need to stop in the same branch that displays the
    # server result. This deliberately does not infer native transport behavior.
    for status in ("error", "update_required"):
        condition_indices = [
            index for index, action in enumerate(actions)
            if _action_identifier(action) == "is.workflow.actions.conditional" and _has_text(_params(action), status)
        ]
        if not condition_indices:
            _fail(f"No conditional action compares {status}.")
        for index in condition_indices:
            containing = [group for group in groups if group.start == index]
            containing.extend(_containing(groups, index, "conditional"))
            if not containing:
                _fail(f"Conditional status branch for {status} is not a well-formed group.")
            group = min(containing, key=lambda item: item.end - item.start)
            branch_text = _json(actions[group.start:group.end]).lower()
            if not any(field in branch_text for field in ("error_message", "errormessage")):
                _fail(f"{status} branch must use the server error_message field.")
            if status == "update_required" and not any(field in branch_text for field in ("install_url", "installurl")):
                _fail("update_required branch must use the server install_url field.")
            if group.markers:
                bounds = [group.branch_bounds(marker) for marker in group.markers]
                if not any("is.workflow.actions.exit" in _identifiers(actions, start, end) for start, end in bounds):
                    _fail(f"{status} branch has no explicit Stop This Shortcut action.")
            else:
                _assert_explicit_stop(actions, *group.branch_bounds(), f"{status} branch")

    unknown_alerts = [
        index for index, action in enumerate(actions)
        if _action_identifier(action) == "is.workflow.actions.alert"
        and any(word in " ".join(_strings(_params(action))).lower() for word in ("unknown", "usable response"))
    ]
    if not unknown_alerts:
        _fail("Unknown status fallback must display a safe message and stop.")
    for index in unknown_alerts:
        containing = _containing(groups, index, "conditional")
        if containing:
            group = min(containing, key=lambda item: item.end - item.start)
            start, end = group.branch_bounds()
            if "is.workflow.actions.exit" not in _identifiers(actions, start, end):
                _fail("Unknown status fallback has no explicit Stop This Shortcut action.")
        elif "is.workflow.actions.exit" not in _identifiers(actions, index + 1, len(actions)):
            _fail("Unknown status fallback has no explicit Stop This Shortcut action.")

    menus = [group for group in groups if group.kind == "menu"]
    confirmation = [group for group in menus if _menu_labels(actions[group.start]) == ["Cancel", "✅ Submit Results"]]
    completion = [group for group in menus if _menu_labels(actions[group.start]) == ["Close", "Open WHT"]]
    if len(confirmation) != 1:
        _fail(f"Expected exactly one confirmation menu; found {len(confirmation)}.")
    if len(completion) != 1:
        _fail(f"Expected exactly one shared completion menu; found {len(completion)}.")

    menu = confirmation[0]
    cancel_start, cancel_end = _menu_branch(actions, menu, 0)
    _assert_explicit_stop(actions, cancel_start, cancel_end, "Cancel branch")
    if "is.workflow.actions.downloadurl" in _identifiers(actions, cancel_start, cancel_end):
        _fail("Cancel branch contains a network request.")
    if "is.workflow.actions.setclipboard" in _identifiers(actions, cancel_start, cancel_end):
        _fail("Cancel branch copies to the clipboard.")
    submit_start, submit_end = _menu_branch(actions, menu, 1)
    if not any(name in _identifiers(actions, submit_start, submit_end) for name in ("is.workflow.actions.downloadurl", "is.workflow.actions.setvariable")):
        _fail("Submit Results branch has no submit or completion assignment.")

    final_menu = completion[0]
    close_start, close_end = _menu_branch(actions, final_menu, 0)
    _assert_explicit_stop(actions, close_start, close_end, "Close branch")
    open_start, open_end = _menu_branch(actions, final_menu, 1)
    open_indices = [index for index in range(open_start, open_end) if _action_identifier(actions[index]) == "is.workflow.actions.openurl"]
    if len(open_indices) != 1:
        _fail("Open WHT branch must contain exactly one Open URLs action.")
    _assert_explicit_stop(actions, open_start, open_end, "Open WHT branch")
    if open_indices[0] >= open_end - 1:
        _fail("Open WHT branch must stop after opening the URL.")
    open_input = _params(actions[open_indices[0]]).get("WFInput", {})
    open_variable = _attachment_variable(open_input)
    property_assignments = [
        action for action in actions
        if _action_identifier(action) == "is.workflow.actions.setvariable"
        and _params(action).get("WFVariableName") == open_variable
    ]
    if not (
        _references_property(open_input, {"completionResponse", "completion_response"}, {"wht_url"})
        or any(
            _references_property(_params(action).get("WFInput", {}), {"completionResponse", "completion_response"}, {"wht_url"})
            for action in property_assignments
        )
    ):
        _fail("Open WHT must use completion_response.wht_url.")
    prompt = _params(actions[final_menu.start]).get("WFMenuPrompt", {})
    if not _references_variable(prompt, {"completionMessage", "completion_message"}):
        _fail("Shared completion menu prompt must use the server completion message.")

    assignments = [
        action for action in actions
        if _action_identifier(action) == "is.workflow.actions.setvariable"
        and _params(action).get("WFVariableName") in {"completionResponse", "completion_response"}
    ]
    if len(assignments) < 2:
        _fail("Both already_submitted and submitted paths must assign the shared completion response.")
    sources = [
        _variable_name(_params(assignment).get("WFInput", {}))
        for assignment in assignments
    ]
    if sum(source in {"validationResponse", "validation_response"} for source in sources) != 1:
        _fail("Shared completion is missing its validation already_submitted assignment.")
    if not any(source in {"submitResponse", "submissionResponse", "submission_response"} for source in sources):
        _fail("Shared completion is missing its submit response assignment.")
    for assignment in assignments:
        if not _references_variable(_params(assignment).get("WFInput", {}), {"validationResponse", "validation_response", "submitResponse", "submissionResponse", "submission_response"}):
            _fail("Completion response assignment does not use a server response variable.")

    # The completion menu must be outside the confirmation menu: both response
    # paths converge on one copy/menu sequence.
    if final_menu.start < menu.end:
        _fail("Completion menu is nested in the confirmation branch instead of shared after it.")
    clipboard_indices = [
        index for index, action in enumerate(actions)
        if _action_identifier(action) == "is.workflow.actions.setclipboard"
    ]
    if not clipboard_indices:
        _fail("Shared completion menu must follow a guarded scoreboard copy section.")
    for index in clipboard_indices:
        guards = _containing(groups, index, "conditional")
        if guards and final_menu.start <= max(group.end for group in guards):
            _fail("Shared completion menu must follow every guarded scoreboard copy section.")


def _assert_scoreboard(actions: list[dict[str, Any]], groups: list[Group]) -> None:
    clipboard_indices = [index for index, action in enumerate(actions) if _action_identifier(action) == "is.workflow.actions.setclipboard"]
    if not clipboard_indices:
        _fail("No guarded scoreboard clipboard action found.")
    for index in clipboard_indices:
        guards = _containing(groups, index, "conditional")
        if len(guards) != 1:
            _fail(f"Clipboard action {index} is not inside exactly one scoreboard guard.")
        guard = guards[0]
        guard_text = _json(_params(actions[guard.start])).lower()
        if "scoreboard" not in guard_text:
            _fail(f"Clipboard action {index} is guarded by an unrelated conditional.")
        if not any(word in guard_text for word in ("present", "exists", "has", "nonempty", "not empty", "missing", "null", "empty")):
            _fail(f"Scoreboard guard for clipboard action {index} does not cover missing/null/empty values.")
        input_value = _params(actions[index]).get("WFInput", {})
        if not _is_attachment(input_value) or _attachment_variable(input_value) not in {"scoreboardText", "scoreboard_text"}:
            _fail(f"Clipboard action {index} must copy the server scoreboard variable by native attachment.")

    # A static artifact cannot prove a native permission failure, but it can
    # reject the unsafe pattern of displaying a copied-success literal before
    # copying. The final prompt must remain server-owned and variable-bound.
    for index, action in enumerate(actions):
        if index >= min(clipboard_indices):
            continue
        text = " ".join(_strings(_params(action))).lower()
        if "scoreboard copied" in text or "upload successful" in text:
            _fail("Copied-success text appears before the guarded clipboard action.")


def inspect_workflow(workflow: dict[str, Any]) -> dict[str, Any]:
    """Inspect a parsed unsigned Shortcut plist and return static evidence."""
    if not isinstance(workflow, dict):
        _fail("Shortcut plist root must be a dictionary.")
    actions = workflow.get("WFWorkflowActions")
    if not isinstance(actions, list) or not actions:
        _fail("Shortcut contains no workflow actions.")
    if not all(isinstance(action, dict) for action in actions):
        _fail("Shortcut action list contains a non-dictionary item.")
    actions = list(actions)
    if _action_identifier(actions[-1]) != "is.workflow.actions.exit":
        _fail("Shortcut must end with an explicit Stop This Shortcut action.")
    groups = _groups(actions)
    _assert_input_surface(workflow)
    _assert_import_question(workflow, actions)
    requests = _find_requests(actions)
    _assert_requests(actions, requests)
    _assert_status_and_stop(actions, groups)
    _assert_scoreboard(actions, groups)
    return {
        "name": workflow.get("WFWorkflowName"),
        "actions": len(actions),
        "requests": len(requests),
        "menus": len([group for group in groups if group.kind == "menu"]),
        "conditionalGroups": len([group for group in groups if group.kind == "conditional"]),
        "structuralChecks": "passed",
        "nativeExecution": "not performed",
        "copyFailureRuntime": "not proven",
        "runtimeJSONTypes": "not proven",
    }


def inspect_path(path: Path, require_signed: bool = False) -> dict[str, Any]:
    """Inspect a local unsigned plist or verify a signed container header."""
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if data.startswith(b"AEA1"):
        if not require_signed:
            _fail("Signed AEA1 container cannot be statically inspected without a local unsigned export.")
        return {
            "file": path.name,
            "sha256": digest,
            "containerHeader": "AEA1",
            "structuralChecks": "signed-container-header-only",
            "signatureValidation": "not performed",
            "nativeExecution": "not performed",
            "copyFailureRuntime": "not proven",
        }
    if require_signed:
        _fail("--require-signed requires an AEA1 signed Shortcut container.")
    try:
        workflow = plistlib.loads(data)
    except (plistlib.InvalidFileException, ValueError, TypeError) as exc:
        _fail(f"Unable to parse unsigned Shortcut plist: {exc}")
    report = inspect_workflow(workflow)
    report.update({"file": path.name, "sha256": digest})
    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        epilog="Maintained Upload to WHT full-client inspection: phase5a_inspect_upload.py PATH",
    )
    parser.add_argument(
        "shortcut",
        type=Path,
        help="local unsigned synthetic legacy-contract plist/export",
    )
    parser.add_argument("--require-signed", action="store_true", help="accept an AEA1 header as header-only evidence")
    args = parser.parse_args()
    print(json.dumps(inspect_path(args.shortcut, args.require_signed), ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
