// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025  Philipp Emanuel Weidmann <pew@worldwidemann.com>

import { extension_settings } from "../../../extensions.js";
import { NAME } from "./common.js";


const INSTRUCTIONS = `

-----

!!! IMPORTANT !!!

The following are instructions for inserting certain markers into your responses.
Read them VERY carefully and follow them to the letter:

{{#each scripts}}When {{this.condition}}, insert the following string into the response, precisely at the point where it happens: %[{{this.id}}]
Do this ONLY when {{this.condition}}, not under any other circumstances.

{{/each}}Insert these markers only under the conditions described above, not when something tangentially related happens.
Write the markers exactly as given above. Do not place them inside quotes.
Do not use the same marker more than once per response, unless the trigger condition occurs multiple times.

Here is an example that demonstrates how the markers should be used:
Let's say you have been instructed to insert the marker %[987] when a certain character gives the user something to drink.
In that case, a dialogue might look like this:

User: "I'm completely parched."
Character: "I know, it's so hot today. Here." *She fills a glass with water and hands it to him.* %[987] "So, what are we going to do later?"
User: "How about we go bowling?"
Character: "Great idea! Let's do that." *Her eyes sparkle with excitement.*

-----

`;

const DEFAULT_SETTINGS = {
    enabled: true,
    flashIcon: true,
    instructions: INSTRUCTIONS,
    markerRegex: "%\\[(\\d+)\\]",
    partialMarkerRegex: "%(?:\\[\\d*)?$",
    scripts: [
        {
            id: 1,
            enabled: true,
            condition: "{{char}} turns off the lights",
            stscript: "/# Make sure you have the background set to something *other* than black first. |\n/bg _black\n",
            javascript: 'console.log("Lights out!");\n'
        }
    ]
};

export function loadSettings() {
    extension_settings[NAME] = Object.assign(
        // Start with an empty object to avoid overwriting anything.
        {},
        // Use the default settings as a baseline, so that new settings added in an extension update
        // are set to the defaults even if other settings are already saved.
        DEFAULT_SETTINGS,
        // Finally apply any saved settings, overriding the defaults where present.
        extension_settings[NAME] || {}
    );

    return extension_settings[NAME];
}
