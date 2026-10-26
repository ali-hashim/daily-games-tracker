"""Strict current-source checks for the maintained 06/07 canonical inspector."""

from __future__ import annotations

import json
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]
INSPECTOR = ROOT / "daily-games-tracker" / "shortcut" / "cherri-migration" / "build" / "inspect-shortcut.py"
RETAINED = ROOT / "tmp" / "phase5a-retained-probes"


def attachment(variable: str, property_name: str | None = None) -> dict[str, object]:
    reference: dict[str, object] = {"Type": "Variable", "VariableName": variable}
    if property_name is not None:
        reference["Aggrandizements"] = [{"PropertyName": property_name, "Type": "WFPropertyVariableAggrandizement"}]
    return {"WFSerializationType": "WFTextTokenAttachment", "Value": reference}


def action_output(output_name: str, output_uuid: str) -> dict[str, object]:
    return {
        "WFSerializationType": "WFTextTokenAttachment",
        "Value": {"Type": "ActionOutput", "OutputName": output_name, "OutputUUID": output_uuid},
    }


def get_value_action(output_name: str, output_uuid: str, key: str, source: str = "fixtureResponse") -> dict[str, object]:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
        "WFWorkflowActionParameters": {
            "CustomOutputName": output_name,
            "UUID": output_uuid,
            "WFDictionaryKey": key,
            "WFGetDictionaryValueType": "Value",
            "WFInput": attachment(source),
        },
    }


def variable(name: str, value: dict[str, object]) -> dict[str, object]:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.setvariable",
        "WFWorkflowActionParameters": {"WFVariableName": name, "WFInput": value},
    }


def control(identifier: str, group: str, mode: int, **extra: object) -> dict[str, object]:
    params: dict[str, object] = {"GroupingIdentifier": group, "WFControlFlowMode": mode}
    params.update(extra)
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": params}


def alert(title: str) -> dict[str, object]:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.alert",
        "WFWorkflowActionParameters": {"WFAlertActionTitle": title},
    }


def exit_action() -> dict[str, object]:
    return {"WFWorkflowActionIdentifier": "is.workflow.actions.exit", "WFWorkflowActionParameters": {}}


def routing_condition(
    status: str,
    group: str,
    true_actions: list[dict[str, object]],
    false_actions: list[dict[str, object]],
) -> list[dict[str, object]]:
    return [
        control("is.workflow.actions.conditional", group, 0, WFCondition=4, WFConditionalActionString=status),
        *true_actions,
        control("is.workflow.actions.conditional", group, 1),
        *false_actions,
        control("is.workflow.actions.conditional", group, 2),
    ]


def current_routing_fixture() -> dict[str, object]:
    actions: list[dict[str, object]] = [variable("completionResponse", attachment("initialResponse"))]
    actions.extend(routing_condition("already_submitted", "validation-already", [variable("completionResponse", attachment("validationResponse"))], []))
    actions.extend(routing_condition("error", "validation-error", [alert("Validation error"), exit_action()], []))
    actions.extend(routing_condition("update_required", "validation-update", [alert("Update required"), exit_action()], []))
    menu = "routing-menu"
    menu_actions = [
        control(
            "is.workflow.actions.choosefrommenu",
            menu,
            0,
            WFMenuItems=[{"WFValue": "Cancel"}, {"WFValue": "✅ Submit Results"}],
            WFMenuPrompt="Submit synthetic result?",
        ),
        control("is.workflow.actions.choosefrommenu", menu, 1, WFMenuItemTitle="Cancel"),
        exit_action(),
        control("is.workflow.actions.choosefrommenu", menu, 1, WFMenuItemTitle="✅ Submit Results"),
        variable("submitMarker", attachment("submitMarkerText")),
        control("is.workflow.actions.choosefrommenu", menu, 2),
    ]
    actions.extend(routing_condition("valid", "validation-valid", menu_actions, [alert("Unknown validation status"), exit_action()]))
    actions.extend(routing_condition("submitted", "submit-submitted", [variable("completionResponse", attachment("submitResponse"))], []))
    actions.extend(routing_condition("already_submitted", "submit-already", [variable("completionResponse", attachment("submitResponse"))], []))
    actions.extend(routing_condition("error", "submit-error", [alert("Submit error"), exit_action()], []))
    actions.extend(routing_condition("update_required", "submit-update", [alert("Update required"), exit_action()], [alert("Unknown submit status"), exit_action()]))
    actions.extend([alert("Shared synthetic completion"), exit_action()])
    return {"WFWorkflowActions": actions}


def current_completion_fixture() -> dict[str, object]:
    menu = "completion-menu"
    guard = "scoreboard-guard"
    actions: list[dict[str, object]] = [
        variable("fixtureResponse", attachment("nullResponse")),
        variable("scoreboardText", attachment("fixtureResponse", "scoreboard_text")),
        variable("completionMessage", attachment("fixtureResponse", "completion_message")),
        variable("whtURL", attachment("fixtureResponse", "wht_url")),
        control("is.workflow.actions.conditional", guard, 0, WFCondition=1),
        {"WFWorkflowActionIdentifier": "is.workflow.actions.setclipboard", "WFWorkflowActionParameters": {"WFInput": attachment("scoreboardText")}},
        control("is.workflow.actions.conditional", guard, 2),
        control(
            "is.workflow.actions.choosefrommenu",
            menu,
            0,
            WFMenuItems=[{"WFValue": "Close"}, {"WFValue": "Open WHT"}],
            WFMenuPrompt=attachment("completionMessage"),
        ),
        control("is.workflow.actions.choosefrommenu", menu, 1, WFMenuItemTitle="Close"),
        {"WFWorkflowActionIdentifier": "is.workflow.actions.exit", "WFWorkflowActionParameters": {}},
        control("is.workflow.actions.choosefrommenu", menu, 1, WFMenuItemTitle="Open WHT"),
        {"WFWorkflowActionIdentifier": "is.workflow.actions.openurl", "WFWorkflowActionParameters": {"Show-WFInput": True, "WFInput": attachment("whtURL")}},
        {"WFWorkflowActionIdentifier": "is.workflow.actions.exit", "WFWorkflowActionParameters": {}},
        control("is.workflow.actions.choosefrommenu", menu, 2),
        {"WFWorkflowActionIdentifier": "is.workflow.actions.exit", "WFWorkflowActionParameters": {}},
    ]
    return {"WFWorkflowActions": actions}


def current_completion_get_value_fixture() -> dict[str, object]:
    """Use the pinned compiler's getvalueforkey attachment shape."""
    fixture = current_completion_fixture()
    actions = fixture["WFWorkflowActions"]
    assert isinstance(actions, list)
    fields = [
        ("scoreboardText", "scoreboard_text", "get-scoreboard", "scoreboard-uuid"),
        ("completionMessage", "completion_message", "get-completion", "completion-uuid"),
        ("whtURL", "wht_url", "get-url", "url-uuid"),
    ]
    rewritten: list[dict[str, object]] = [actions[0]]
    for index, (name, key, output_name, output_uuid) in enumerate(fields, start=1):
        rewritten.append(get_value_action(output_name, output_uuid, key))
        assignment = actions[index]
        assignment["WFWorkflowActionParameters"]["WFInput"] = action_output(output_name, output_uuid)
        rewritten.append(assignment)
    rewritten.extend(actions[4:])
    fixture["WFWorkflowActions"] = rewritten
    return fixture


def run_inspector(path: Path, experiment: str, strict: bool = True) -> subprocess.CompletedProcess[str]:
    args = [sys.executable, str(INSPECTOR), str(path), "--experiment", experiment]
    if strict:
        args.append("--strict-current")
    return subprocess.run(args, capture_output=True, text=True, check=False)


class Phase5ACanonicalInspectionTests(unittest.TestCase):
    def write_plist(self, value: dict[str, object], directory: Path, name: str = "fixture.shortcut") -> Path:
        path = directory / name
        path.write_bytes(plistlib.dumps(value, fmt=plistlib.FMT_BINARY))
        return path

    def test_current_completion_fixture_passes_strict_data_flow_checks(self) -> None:
        with tempfile.TemporaryDirectory(prefix="phase5a-canonical-") as directory:
            path = self.write_plist(current_completion_fixture(), Path(directory))
            result = run_inspector(path, "07")
            self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
            report = json.loads(result.stdout)
            self.assertEqual(report["structuralChecks"], "passed")

    def test_compiler_get_value_attachment_shape_passes_strict_data_flow_checks(self) -> None:
        with tempfile.TemporaryDirectory(prefix="phase5a-canonical-") as directory:
            path = self.write_plist(current_completion_get_value_fixture(), Path(directory))
            result = run_inspector(path, "07")
            self.assertEqual(result.returncode, 0, result.stderr or result.stdout)

    def test_dictionary_aggrandizement_shape_passes_strict_data_flow_checks(self) -> None:
        fixture = current_completion_fixture()
        actions = fixture["WFWorkflowActions"]
        assert isinstance(actions, list)
        for action in actions[1:4]:
            aggrandizement = action["WFWorkflowActionParameters"]["WFInput"]["Value"]["Aggrandizements"][0]
            aggrandizement["DictionaryKey"] = aggrandizement.pop("PropertyName")
        with tempfile.TemporaryDirectory(prefix="phase5a-canonical-") as directory:
            path = self.write_plist(fixture, Path(directory))
            result = run_inspector(path, "07")
            self.assertEqual(result.returncode, 0, result.stderr or result.stdout)

    def test_get_value_wrong_dictionary_is_rejected(self) -> None:
        fixture = current_completion_get_value_fixture()
        actions = fixture["WFWorkflowActions"]
        assert isinstance(actions, list)
        get_value = next(action for action in actions if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.getvalueforkey")
        get_value["WFWorkflowActionParameters"]["WFInput"] = attachment("presentResponse")
        with tempfile.TemporaryDirectory(prefix="phase5a-canonical-") as directory:
            path = self.write_plist(fixture, Path(directory))
            result = run_inspector(path, "07")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("fixtureResponse.scoreboard_text", result.stderr)

    def test_get_value_wrong_key_is_rejected(self) -> None:
        fixture = current_completion_get_value_fixture()
        actions = fixture["WFWorkflowActions"]
        assert isinstance(actions, list)
        get_value = next(action for action in actions if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.getvalueforkey")
        get_value["WFWorkflowActionParameters"]["WFDictionaryKey"] = "completion_message"
        with tempfile.TemporaryDirectory(prefix="phase5a-canonical-") as directory:
            path = self.write_plist(fixture, Path(directory))
            result = run_inspector(path, "07")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("fixtureResponse.scoreboard_text", result.stderr)

    def test_get_value_wrong_action_output_is_rejected(self) -> None:
        fixture = current_completion_get_value_fixture()
        actions = fixture["WFWorkflowActions"]
        assert isinstance(actions, list)
        scoreboard = next(action for action in actions if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.setvariable" and action.get("WFWorkflowActionParameters", {}).get("WFVariableName") == "scoreboardText")
        scoreboard["WFWorkflowActionParameters"]["WFInput"]["Value"]["OutputUUID"] = "wrong-output-uuid"
        with tempfile.TemporaryDirectory(prefix="phase5a-canonical-") as directory:
            path = self.write_plist(fixture, Path(directory))
            result = run_inspector(path, "07")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("fixtureResponse.scoreboard_text", result.stderr)

    def test_selected_null_fixture_cannot_copy_present_scoreboard(self) -> None:
        fixture = current_completion_fixture()
        actions = fixture["WFWorkflowActions"]
        assert isinstance(actions, list)
        # A mutation that copies a fixture-specific present value bypasses the
        # selected fixtureResponse null path and must fail strict inspection.
        actions[1]["WFWorkflowActionParameters"]["WFInput"] = attachment("presentScoreboard")
        with tempfile.TemporaryDirectory(prefix="phase5a-canonical-") as directory:
            path = self.write_plist(fixture, Path(directory))
            result = run_inspector(path, "07")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("fixtureResponse.scoreboard_text", result.stderr)

    def test_current_routing_fixture_requires_terminal_error_stop(self) -> None:
        fixture = current_routing_fixture()
        actions = fixture["WFWorkflowActions"]
        assert isinstance(actions, list)
        with tempfile.TemporaryDirectory(prefix="phase5a-canonical-") as directory:
            path = self.write_plist(fixture, Path(directory))
            result = run_inspector(path, "06")
            self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        result_messages = [
            index
            for index, action in enumerate(actions)
            if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.alert"
            and action.get("WFWorkflowActionParameters", {}).get("WFAlertActionTitle") == "Submit error"
        ]
        self.assertEqual(len(result_messages), 1)
        del actions[result_messages[0] + 1]
        with tempfile.TemporaryDirectory(prefix="phase5a-canonical-") as directory:
            path = self.write_plist(fixture, Path(directory))
            result = run_inspector(path, "06")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("must be followed by an explicit Stop", result.stderr)

    @unittest.skipUnless((RETAINED / "Cherri-probe-06_unsigned.shortcut").is_file(), "retained run-17 probes are unavailable")
    def test_legacy_routing_probe_is_rejected_by_strict_current_mode(self) -> None:
        result = run_inspector(RETAINED / "Cherri-probe-06_unsigned.shortcut", "06")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Current routing source", result.stderr)

    @unittest.skipUnless((RETAINED / "Cherri-probe-07_unsigned.shortcut").is_file(), "retained run-17 probes are unavailable")
    def test_legacy_completion_probe_is_rejected_by_strict_current_mode(self) -> None:
        result = run_inspector(RETAINED / "Cherri-probe-07_unsigned.shortcut", "07")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Current completion source", result.stderr)


if __name__ == "__main__":
    unittest.main()
