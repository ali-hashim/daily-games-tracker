"""Mutation tests for the credential-free Phase 5A Shortcut inspector."""

from __future__ import annotations

from pathlib import Path
import plistlib
import sys
import tempfile
import unittest


SCRIPT_DIR = Path(__file__).resolve().parents[1]
FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(FIXTURE_DIR))

from inspect_phase5a_shortcut import ShortcutInspectionError, inspect_path, inspect_workflow  # noqa: E402
from phase5a_shortcut_fixture import phase5a_workflow  # noqa: E402


class Phase5AShortcutInspectionTests(unittest.TestCase):
    def valid(self) -> dict:
        return phase5a_workflow()

    def assert_rejected(self, workflow: dict, message: str) -> None:
        with self.assertRaisesRegex(ShortcutInspectionError, message):
            inspect_workflow(workflow)

    def test_valid_fixture_has_shared_completion_and_static_only_evidence(self) -> None:
        report = inspect_workflow(self.valid())
        self.assertEqual(report["structuralChecks"], "passed")
        self.assertEqual(report["nativeExecution"], "not performed")
        self.assertEqual(report["copyFailureRuntime"], "not proven")
        self.assertEqual(report["runtimeJSONTypes"], "not proven")

    def test_local_unsigned_plist_path_is_credential_free(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "phase5a-fixture.shortcut"
            path.write_bytes(plistlib.dumps(self.valid(), fmt=plistlib.FMT_BINARY))
            report = inspect_path(path)
        self.assertEqual(report["file"], "phase5a-fixture.shortcut")
        self.assertEqual(report["structuralChecks"], "passed")

    def test_cancel_branch_must_stop_without_network_or_copy(self) -> None:
        workflow = self.valid()
        actions = workflow["WFWorkflowActions"]
        # The first exit is the confirmation Cancel branch in this fixture.
        cancel_exit = next(index for index, action in enumerate(actions) if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.exit")
        actions.pop(cancel_exit)
        self.assert_rejected(workflow, "Cancel branch has no explicit Stop")

    def test_unbalanced_branch_is_rejected(self) -> None:
        workflow = self.valid()
        actions = workflow["WFWorkflowActions"]
        confirmation_end = next(
            index
            for index, action in enumerate(actions)
            if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.choosefrommenu"
            and action["WFWorkflowActionParameters"].get("WFControlFlowMode") == 2
            and action["WFWorkflowActionParameters"].get("GroupingIdentifier") == "confirmation"
        )
        actions.pop(confirmation_end)
        self.assert_rejected(workflow, "unmatched group end")

    def test_completion_menu_must_be_shared_after_confirmation(self) -> None:
        workflow = self.valid()
        actions = workflow["WFWorkflowActions"]
        completion_start = next(
            index
            for index, action in enumerate(actions)
            if action["WFWorkflowActionParameters"].get("GroupingIdentifier") == "completion"
            and action["WFWorkflowActionParameters"].get("WFControlFlowMode") == 0
        )
        # Duplicating the terminal menu is the static shape produced when
        # completion handling is copied into a branch instead of shared.
        actions.insert(completion_start, dict(actions[completion_start]))
        self.assert_rejected(workflow, "Unclosed control-flow groups")

    def test_shared_completion_requires_both_response_assignments(self) -> None:
        workflow = self.valid()
        actions = workflow["WFWorkflowActions"]
        assignment = next(
            index
            for index, action in enumerate(actions)
            if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.setvariable"
            and action["WFWorkflowActionParameters"].get("WFVariableName") == "completionResponse"
            and action["WFWorkflowActionParameters"]["WFInput"]["Value"]["Variable"]["VariableName"] == "validationResponse"
        )
        actions.pop(assignment)
        self.assert_rejected(workflow, "validation already_submitted assignment")

    def test_missing_null_scoreboard_guard_is_rejected(self) -> None:
        workflow = self.valid()
        actions = workflow["WFWorkflowActions"]
        guard_end = next(
            index
            for index, action in enumerate(actions)
            if action["WFWorkflowActionParameters"].get("GroupingIdentifier") == "scoreboard-guard"
            and action["WFWorkflowActionParameters"].get("WFControlFlowMode") == 2
        )
        actions.pop(guard_end)
        self.assert_rejected(workflow, "Unclosed control-flow groups")

    def test_clipboard_outside_scoreboard_guard_is_rejected(self) -> None:
        workflow = self.valid()
        actions = workflow["WFWorkflowActions"]
        clipboard = next(action for action in actions if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.setclipboard")
        actions.remove(clipboard)
        completion_start = next(
            index
            for index, action in enumerate(actions)
            if action["WFWorkflowActionParameters"].get("GroupingIdentifier") == "completion"
            and action["WFWorkflowActionParameters"].get("WFControlFlowMode") == 0
        )
        actions.insert(completion_start, clipboard)
        self.assert_rejected(workflow, "Clipboard action .* is not inside exactly one scoreboard guard")

    def test_copied_success_literal_before_copy_is_rejected(self) -> None:
        workflow = self.valid()
        actions = workflow["WFWorkflowActions"]
        insert_at = next(index for index, action in enumerate(actions) if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.setclipboard")
        actions.insert(insert_at, {
            "WFWorkflowActionIdentifier": "is.workflow.actions.alert",
            "WFWorkflowActionParameters": {"WFAlertActionMessage": "Scoreboard copied."},
        })
        self.assert_rejected(workflow, "Copied-success text appears before")

    def test_literal_device_header_is_rejected(self) -> None:
        workflow = self.valid()
        request = next(action for action in workflow["WFWorkflowActions"] if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.downloadurl")
        request["WFWorkflowActionParameters"]["WFHTTPHeaders"]["Authorization"] = "Device configured-secret-123456"
        self.assert_rejected(workflow, "Authorization header is not bound")

    def test_authorization_header_variable_must_derive_device_code(self) -> None:
        workflow = self.valid()
        assignment = next(
            action for action in workflow["WFWorkflowActions"]
            if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.setvariable"
            and action["WFWorkflowActionParameters"].get("WFVariableName") == "authorization_header"
        )
        assignment["WFWorkflowActionParameters"]["WFInput"] = "Device "
        self.assert_rejected(workflow, "not derived from the runtime device code")

    def test_request_body_must_use_native_attachments_and_nested_capture(self) -> None:
        workflow = self.valid()
        request = next(action for action in workflow["WFWorkflowActions"] if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.downloadurl")
        request["WFWorkflowActionParameters"]["WFJSONValues"] = '{"shortcut_version":1,"capture":"text"}'
        self.assert_rejected(workflow, "JSON body must be a native variable attachment")

    def test_shortcut_version_must_be_native_number_one(self) -> None:
        workflow = self.valid()
        requests = [
            action for action in workflow["WFWorkflowActions"]
            if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.downloadurl"
        ]
        requests[0]["WFWorkflowActionParameters"]["WFDictionaryFieldValueItems"][0]["WFValue"] = {"Value": 2}
        self.assert_rejected(workflow, "native Number value 1")

    def test_validate_and_submit_must_reuse_the_same_original_capture(self) -> None:
        workflow = self.valid()
        requests = [
            action for action in workflow["WFWorkflowActions"]
            if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.downloadurl"
        ]
        requests[1]["WFWorkflowActionParameters"]["WFDictionaryFieldValueItems"][1]["WFValue"] = {
            "WFSerializationType": "WFTextTokenAttachment",
            "Value": {"Type": "Variable", "Variable": {"VariableName": "recaptured_input"}},
        }
        self.assert_rejected(workflow, "reuse one original capture variable")

    def test_error_branch_must_use_server_error_message(self) -> None:
        workflow = self.valid()
        alert = next(
            action for action in workflow["WFWorkflowActions"]
            if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.alert"
            and action["WFWorkflowActionParameters"].get("WFAlertActionMessage")
            and "errorMessage" in str(action["WFWorkflowActionParameters"])
        )
        alert["WFWorkflowActionParameters"]["WFAlertActionMessage"] = "local fallback"
        self.assert_rejected(workflow, "error branch must use the server error_message")

    def test_update_branch_must_use_server_install_url(self) -> None:
        workflow = self.valid()
        update_open = next(
            action for action in workflow["WFWorkflowActions"]
            if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.openurl"
            and "installURL" in str(action["WFWorkflowActionParameters"])
        )
        update_open["WFWorkflowActionParameters"]["WFInput"] = {"Value": "local-install-url"}
        self.assert_rejected(workflow, "update_required branch must use the server install_url")

    def test_open_wht_must_use_completion_response_wht_url(self) -> None:
        workflow = self.valid()
        assignment = next(
            action for action in workflow["WFWorkflowActions"]
            if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.setvariable"
            and action["WFWorkflowActionParameters"].get("WFVariableName") == "whtURL"
        )
        assignment["WFWorkflowActionParameters"]["WFInput"]["Value"].pop("Aggrandizements")
        self.assert_rejected(workflow, "completion_response.wht_url")

    def test_completion_menu_must_follow_guarded_clipboard_section(self) -> None:
        workflow = self.valid()
        actions = workflow["WFWorkflowActions"]
        scoreboard_start = next(
            index for index, action in enumerate(actions)
            if action["WFWorkflowActionParameters"].get("GroupingIdentifier") == "scoreboard-guard"
            and action["WFWorkflowActionParameters"].get("WFControlFlowMode") == 0
        )
        completion_start = next(
            index for index, action in enumerate(actions)
            if action["WFWorkflowActionParameters"].get("GroupingIdentifier") == "completion"
            and action["WFWorkflowActionParameters"].get("WFControlFlowMode") == 0
        )
        block = actions[completion_start:-1]
        del actions[completion_start:-1]
        actions[scoreboard_start:scoreboard_start] = block
        self.assert_rejected(workflow, "follow every guarded scoreboard copy section")

    def test_import_question_cannot_bind_a_configured_default(self) -> None:
        workflow = self.valid()
        workflow["WFWorkflowImportQuestions"][0]["DefaultValue"] = "configured-secret"
        self.assert_rejected(workflow, "empty default")

    def test_import_question_must_target_the_text_action(self) -> None:
        workflow = self.valid()
        workflow["WFWorkflowImportQuestions"][0]["ActionIndex"] = 1
        self.assert_rejected(workflow, "target the device-code Text action")

    def test_require_signed_rejects_an_unsigned_plist(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "phase5a-fixture.shortcut"
            path.write_bytes(plistlib.dumps(self.valid(), fmt=plistlib.FMT_BINARY))
            with self.assertRaisesRegex(ShortcutInspectionError, "--require-signed requires an AEA1"):
                inspect_path(path, require_signed=True)

    def test_unknown_status_fallback_requires_stop(self) -> None:
        workflow = self.valid()
        actions = workflow["WFWorkflowActions"]
        unknown_exit = next(
            index
            for index, action in enumerate(actions)
            if action["WFWorkflowActionIdentifier"] == "is.workflow.actions.exit"
            and index > next(
                i for i, candidate in enumerate(actions)
                if candidate["WFWorkflowActionIdentifier"] == "is.workflow.actions.alert"
                and "usable response" in str(candidate["WFWorkflowActionParameters"])
            )
        )
        actions.pop(unknown_exit)
        self.assert_rejected(workflow, "Unknown status fallback has no explicit Stop")


if __name__ == "__main__":
    unittest.main()
