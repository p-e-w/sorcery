// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025  Philipp Emanuel Weidmann <pew@worldwidemann.com>

import { renderExtensionTemplateAsync } from "../../../extensions.js";
import { power_user } from "../../../power-user.js";
import { promptManager } from "../../../openai.js";
import { executeSlashCommandsWithOptions } from "../../../slash-commands.js";
import { eventSource, event_types, streamingProcessor, saveSettingsDebounced } from "../../../../script.js";
import { Handlebars, hljs } from "../../../../lib.js";
import { NAME } from "./common.js";
import { loadSettings } from "./settings.js";


// @ts-ignore: Hack to suppress IDE errors due to SillyTavern's
//             weird mix of imports and globally defined objects.
const $ = window.$;

const settings = loadSettings();

function addScript(script = {}) {
    const ids = settings.scripts.map(script => script.id);
    const nextId = Math.max(...ids, 0) + 1;

    const scriptCopy = Object.assign({
        condition: "",
        stscript: "",
        javascript: ""
    }, script, {
        id: nextId,
        enabled: true
    });

    settings.scripts.push(scriptCopy);
    saveSettingsDebounced();

    return scriptCopy;
}

function getEnabledScripts() {
    if (settings.enabled) {
        return settings.scripts.filter(script =>
            script.enabled &&
            script.condition.trim().length > 0 &&
            (script.stscript.trim().length > 0 || script.javascript.trim().length > 0)
        );
    } else {
        return [];
    }
}

function getMainPrompt() {
    for (const prompt of promptManager.serviceSettings.prompts) {
        if (prompt.identifier === "main") {
            return prompt;
        }
    }
}

let instructionsInjected = false;
let originalSystemPrompt;
let originalMainPrompt;
let enabledScripts;
let hookToBeInstalled;

function injectInstructions() {
    // Due to SillyTavern's "dry run" mechanism, it is possible for two generations to interleave
    // under certain circumstances. This leads to `injectInstructions` being invoked twice in a row
    // without a call to `restorePrompts` in between, which would result in two copies of the instructions
    // being injected. This guard protects against this rare occurrence, and prevents the second injection.
    if (!instructionsInjected) {
        originalSystemPrompt = power_user.sysprompt.content;
        originalMainPrompt = getMainPrompt().content;

        enabledScripts = getEnabledScripts();

        if (enabledScripts.length > 0) {
            const instructionsTemplate = Handlebars.compile(settings.instructions, { noEscape: true });
            const instructions = instructionsTemplate({ scripts: enabledScripts });
            power_user.sysprompt.content += instructions;
            getMainPrompt().content += instructions;
            hookToBeInstalled = true;
        } else {
            hookToBeInstalled = false;
        }

        instructionsInjected = true;
    }
}

function restorePrompts() {
    if (instructionsInjected) {
        power_user.sysprompt.content = originalSystemPrompt;
        getMainPrompt().content = originalMainPrompt;
        instructionsInjected = false;
    }
}

function runSTscript(stscript) {
    executeSlashCommandsWithOptions(stscript);
}

function runJavaScript(javascript) {
    Function(javascript)();
}

function runScript(script) {
    console.log(`${NAME}: Running script ${script.id}...`);

    if (settings.flashIcon) {
        const element = $("#sorcery-button");
        element.addClass("flashing-icon");
        setTimeout(() => element.removeClass("flashing-icon"), 300);
    }

    if (script.stscript.trim().length > 0) {
        runSTscript(script.stscript);
    }

    if (script.javascript.trim().length > 0) {
        runJavaScript(script.javascript);
    }
}

function installStreamHook() {
    if (hookToBeInstalled) {
        const markerRegex = new RegExp(settings.markerRegex, "g");
        const partialMarkerRegex = new RegExp(settings.partialMarkerRegex);

        const processedIndices = new Set();

        const originalOnProgressStreaming = streamingProcessor.onProgressStreaming.bind(streamingProcessor);

        function onProgressStreaming(messageId, text, isFinal) {
            for (const match of text.matchAll(markerRegex)) {
                if (!processedIndices.has(match.index)) {
                    // `match[0]` is the whole match, `match[1]` is the first capturing group, i.e. the script ID.
                    const scriptId = parseInt(match[1]);

                    // This is probably faster overall than constructing an ID => script map beforehand and using a lookup,
                    // because many messages don't contain any markers, and in that case the upfront cost is saved.
                    for (const script of enabledScripts) {
                        if (script.id === scriptId) {
                            runScript(script);
                            break;
                        }
                    }

                    processedIndices.add(match.index);
                }
            }

            // A partial marker at the end of a partial message might turn into a complete marker later,
            // so we remove such partial markers during mid-streaming in order to prevent partial markers
            // flickering in and out.
            //
            // Note that for maximum correctness, this removal must happen before the removal of complete
            // markers below, because the latter might remove a marker at the end of the message, turning
            // a non-terminal partial marker into a terminal one, causing incorrect removal of a partial
            // marker that is guaranteed to never turn into a complete one.
            if (!isFinal) {
                text = text.replace(partialMarkerRegex, "");
            }

            text = text.replaceAll(markerRegex, "");

            return originalOnProgressStreaming(messageId, text, isFinal);
        }

        streamingProcessor.onProgressStreaming = onProgressStreaming;
        hookToBeInstalled = false;
    }
}

eventSource.on(event_types.GENERATION_AFTER_COMMANDS, injectInstructions);

eventSource.on(event_types.GENERATE_AFTER_DATA, restorePrompts);

// This is less than ideal because `STREAM_TOKEN_RECEIVED` is emitted for each token during generation
// even though we only need to install the hook once. Unfortunately, it is the *only* event emitted
// between the instantiation of the `StreamingProcessor` and the first call to `onProgressStreaming`,
// so we have no choice.
eventSource.on(event_types.STREAM_TOKEN_RECEIVED, installStreamHook);

function template(templateId, templateData = {}, sanitize = true, localize = true) {
    return renderExtensionTemplateAsync(`third-party/${NAME}`, templateId, templateData, sanitize, localize);
}

// The top bar button is created too late to be covered by the standard event handlers.
// Unfortunately, the function `doNavbarIconClick` that is used to handle top bar clicks
// is not exported by `script.js`. This hack extracts the function from another button's
// event handler, and then attaches it to the extension button.
function clickHandlerHack() {
    const element = document.querySelector("#extensions-settings-button .drawer-toggle");
    const events = $._data(element, "events");
    const doNavbarIconClick = events.click[0].handler;
    $("#sorcery-button .drawer-toggle").on("click", doNavbarIconClick);
}

// Register a copy of the STscript language definition in order to avoid inheriting
// the ugly global styles from the Quick Reply extension. This is a ridiculous hack,
// but SillyTavern's complete lack of encapsulation makes it hard to find a clean solution.
hljs.registerLanguage("sorcery-stscript", () => hljs.getLanguage("stscript"));

$(async () => {
    // The code-input library is neither a module with exports, nor does it add its symbols
    // to any global objects. It must be loaded as a regular DOM script.
    const libPath = `/scripts/extensions/third-party/${NAME}/lib`;
    $("head").append(`<link rel="stylesheet" href="${libPath}/code-input.css">`);
    $("head").append(`<script src="${libPath}/code-input.js"></script>`);
    $("head").append(`<script>codeInput.registerTemplate("syntax-highlighted", codeInput.templates.hljs(hljs, []));</script>`);

    const settingsHtml = await template("settings");
    $("#extensions-settings-button").after(settingsHtml);
    clickHandlerHack();

    $("#sorcery-enabled").prop("checked", settings.enabled).change(function () {
        settings.enabled = this.checked;
        saveSettingsDebounced();
    });

    $("#sorcery-flash-icon").prop("checked", settings.flashIcon).change(function () {
        settings.flashIcon = this.checked;
        saveSettingsDebounced();
    });

    // Sanitization must be disabled because the template uses custom HTML elements,
    // which DOMPurify removes.
    const scriptHtml = await template("script", {}, false);

    const scriptsElement = $("#sorcery-scripts");

    function expandScriptElement(scriptElement) {
        scriptElement.find(".inline-drawer-toggle").removeClass("down fa-circle-chevron-down").addClass("up fa-circle-chevron-up");
        scriptElement.find(".inline-drawer-content").attr("style", "");
    }

    function focusConditionInput(scriptElement) {
        scriptElement.find(".sorcery-condition textarea").trigger("focus");
    }

    function addScriptElement(script) {
        const scriptElement = $(scriptHtml);
        scriptsElement.prepend(scriptElement);

        scriptElement.find(".sorcery-duplicate").click(() => {
            const s = addScript(script);
            const scriptElement = addScriptElement(s);
            expandScriptElement(scriptElement);
            focusConditionInput(scriptElement);
        });

        scriptElement.find(".sorcery-delete").click(() => {
            settings.scripts = settings.scripts.filter(s => s.id !== script.id);
            saveSettingsDebounced();
            scriptElement.remove();
        });

        scriptElement.find(".sorcery-enabled").addClass(script.enabled ? "fa-toggle-on" : "fa-toggle-off").click(function () {
            if ($(this).hasClass("fa-toggle-on")) {
                $(this).removeClass("fa-toggle-on").addClass("fa-toggle-off");
                script.enabled = false;
            } else {
                $(this).removeClass("fa-toggle-off").addClass("fa-toggle-on");
                script.enabled = true;
            }
            saveSettingsDebounced();
        });

        scriptElement.find(".sorcery-condition").val(script.condition).on("input", function () {
            script.condition = this.value;
            saveSettingsDebounced();
        });

        scriptElement.find(".sorcery-stscript").val(script.stscript).on("input", function () {
            script.stscript = this.value;
            saveSettingsDebounced();
        });

        scriptElement.find(".sorcery-run-stscript").click(() => {
            runSTscript(script.stscript);
        });

        scriptElement.find(".sorcery-javascript").val(script.javascript).on("input", function () {
            script.javascript = this.value;
            saveSettingsDebounced();
        });

        scriptElement.find(".sorcery-run-javascript").click(() => {
            runJavaScript(script.javascript);
        });

        return scriptElement;
    }

    if (settings.scripts.length === 1) {
        // Improve first-use experience by expanding the script editor if there is only one
        // (such as with the default settings).
        const scriptElement = addScriptElement(settings.scripts[0]);
        expandScriptElement(scriptElement);
    } else {
        for (const script of settings.scripts) {
            addScriptElement(script);
        }
    }

    $("#sorcery-new").click(() => {
        const script = addScript();
        const scriptElement = addScriptElement(script);
        expandScriptElement(scriptElement);
        focusConditionInput(scriptElement);
    });
});
