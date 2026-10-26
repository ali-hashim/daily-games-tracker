"""Small plist-shaped Phase 5A fixture used by static-inspection mutation tests."""

from __future__ import annotations

from typing import Any


def attachment(variable: str) -> dict[str, Any]:
    return {
        "WFSerializationType": "WFTextTokenAttachment",
        "Value": {"Type": "Variable", "Variable": {"VariableName": variable}},
    }


def field(name: str, value: Any, item_type: int | str = 4) -> dict[str, Any]:
    return {
        "WFKey": {"Value": {"string": name}},
        "WFValue": value,
        "WFItemType": item_type,
    }


def action(identifier: str, **params: Any) -> dict[str, Any]:
    return {
        "WFWorkflowActionIdentifier": identifier,
        "WFWorkflowActionParameters": params,
    }


def control(identifier: str, grouping: str, mode: int, **params: Any) -> dict[str, Any]:
    params.update({"WFControlFlowMode": mode, "GroupingIdentifier": grouping})
    return action(identifier, **params)


def request(url: str, response_variable: str) -> dict[str, Any]:
    return action(
        "is.workflow.actions.downloadurl",
        WFURL=url,
        WFHTTPMethod="POST",
        WFHTTPBodyType="JSON",
        WFHTTPHeaders={
            "Authorization": attachment("authorization_header"),
            "Content-Type": "application/json",
        },
        WFJSONValues=attachment("requestBody"),
        WFDictionaryFieldValueItems=[
            field("shortcut_version", {"Value": 1}, 3),
            field("capture", attachment("original_capture"), 4),
        ],
    )


def phase5a_workflow() -> dict[str, Any]:
    """Return a valid, credential-free upload flow with shared completion."""
    actions: list[dict[str, Any]] = [
        action("is.workflow.actions.gettext", WFTextActionText="DEVICE_CODE", UUID="text-uuid"),
        action("is.workflow.actions.setvariable", WFVariableName="device_code", WFInput=attachment("text-uuid")),
        action("is.workflow.actions.setvariable", WFVariableName="authorization_header", WFInput=attachment("device_code")),
        action("is.workflow.actions.setvariable", WFVariableName="original_capture", WFInput=attachment("original_input")),
        request("https://preview.example.test/api/import/validate", "validationResponse"),
        control(
            "is.workflow.actions.conditional",
            "validation-already",
            0,
            WFCondition="status equals already_submitted",
        ),
        action("is.workflow.actions.setvariable", WFVariableName="completionResponse", WFInput=attachment("validationResponse")),
        control("is.workflow.actions.conditional", "validation-already", 2),
        control(
            "is.workflow.actions.conditional",
            "validation-valid",
            0,
            WFCondition="status equals valid",
        ),
        control(
            "is.workflow.actions.choosefrommenu",
            "confirmation",
            0,
            WFMenuItems=[{"WFValue": "Cancel"}, {"WFValue": "✅ Submit Results"}],
            WFMenuPrompt=attachment("confirmationText"),
        ),
        control("is.workflow.actions.choosefrommenu", "confirmation", 1),
        action("is.workflow.actions.exit"),
        control("is.workflow.actions.choosefrommenu", "confirmation", 1),
        request("https://preview.example.test/api/import/submit", "submissionResponse"),
        control(
            "is.workflow.actions.conditional",
            "submit-submitted",
            0,
            WFCondition="status equals submitted",
        ),
        action("is.workflow.actions.setvariable", WFVariableName="completionResponse", WFInput=attachment("submissionResponse")),
        control("is.workflow.actions.conditional", "submit-submitted", 2),
        control(
            "is.workflow.actions.conditional",
            "submit-already",
            0,
            WFCondition="status equals already_submitted",
        ),
        action("is.workflow.actions.setvariable", WFVariableName="completionResponse", WFInput=attachment("submissionResponse")),
        control("is.workflow.actions.conditional", "submit-already", 2),
        control(
            "is.workflow.actions.conditional",
            "submit-error",
            0,
            WFCondition="status equals error",
        ),
        action("is.workflow.actions.alert", WFAlertActionMessage=attachment("errorMessage")),
        action("is.workflow.actions.exit"),
        control("is.workflow.actions.conditional", "submit-error", 2),
        control(
            "is.workflow.actions.conditional",
            "submit-update",
            0,
            WFCondition="status equals update_required",
        ),
        action("is.workflow.actions.alert", WFAlertActionMessage=attachment("errorMessage")),
        action("is.workflow.actions.openurl", WFInput=attachment("installURL")),
        action("is.workflow.actions.exit"),
        control("is.workflow.actions.conditional", "submit-update", 2),
        control(
            "is.workflow.actions.conditional",
            "submit-unknown",
            0,
            WFCondition="unknown status fallback",
        ),
        action(
            "is.workflow.actions.alert",
            WFAlertActionMessage="WHT did not return a usable response. Try again.",
        ),
        action("is.workflow.actions.exit"),
        control("is.workflow.actions.conditional", "submit-unknown", 2),
        control("is.workflow.actions.choosefrommenu", "confirmation", 2),
        control("is.workflow.actions.conditional", "validation-valid", 2),
        control(
            "is.workflow.actions.conditional",
            "scoreboard-guard",
            0,
            WFCondition="scoreboardText present; empty, null, or missing means skip copy",
        ),
        action("is.workflow.actions.setclipboard", WFInput=attachment("scoreboardText")),
        control("is.workflow.actions.conditional", "scoreboard-guard", 2),
        action(
            "is.workflow.actions.setvariable",
            WFVariableName="whtURL",
            WFInput={
                "WFSerializationType": "WFTextTokenAttachment",
                "Value": {
                    "Type": "Variable",
                    "VariableName": "completionResponse",
                    "Aggrandizements": [{"PropertyName": "wht_url"}],
                },
            },
        ),
        control(
            "is.workflow.actions.choosefrommenu",
            "completion",
            0,
            WFMenuItems=[{"WFValue": "Close"}, {"WFValue": "Open WHT"}],
            WFMenuPrompt=attachment("completionMessage"),
        ),
        control("is.workflow.actions.choosefrommenu", "completion", 1),
        action("is.workflow.actions.exit"),
        control("is.workflow.actions.choosefrommenu", "completion", 1),
        action("is.workflow.actions.openurl", WFInput=attachment("whtURL"), **{"Show-WFInput": True}),
        action("is.workflow.actions.exit"),
        control("is.workflow.actions.choosefrommenu", "completion", 2),
        action("is.workflow.actions.exit"),
    ]
    return {
        "WFWorkflowName": "Upload to WHT",
        "WFWorkflowTypes": ["ActionExtension"],
        "WFWorkflowInputContentItemClasses": ["WFSafariWebPageContentItem", "WFStringContentItem"],
        "WFWorkflowImportQuestions": [
            {
                "ActionIndex": 0,
                "ParameterKey": "WFTextActionText",
                "DefaultValue": "",
                "Text": "Paste your private WHT device code.",
            }
        ],
        "WFWorkflowActions": actions,
    }
