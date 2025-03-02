# Sorcery

Sorcery is a [SillyTavern](https://github.com/SillyTavern/SillyTavern) extension
that allows AI characters to reach into the real world. It lets you bind arbitrary
STscript or JavaScript code to arbitrary events in the chat. It is infinitely more
powerful than existing "character expression" systems, and dramatically easier to
use than traditional function calling setups. It does **not** require a specially
trained function calling model.

Sorcery can enable your virtual characters to do tangible things, from interacting
with your SillyTavern instance to controlling smart home appliances and toys.
It is **zero-configuration,** and once installed will immediately work with most
models and setups.

![Screenshot](https://github.com/user-attachments/assets/71c0d9e5-6784-499e-8b67-26d531deb15f)

Sorcery executes actions **while the response is streaming, at the exact moment
the relevant event occurs,** as demonstrated in this video:

https://github.com/user-attachments/assets/49ff8f62-2674-4062-b378-bc272d1212e1

Sorcery works by injecting dynamically generated instructions into the system prompt
that tell the model to insert special markers into its responses when the configured
events occur. It then hooks the output stream, and intercepts those markers, removing
them from the output and running the associated scripts. The whole process is
completely invisible to the user.

Even relatively small models respond well to Sorcery's instructions. For example,
I have successfully used Sorcery with the IQ3_M quant of Mistral Small, which fits
into 12 GB VRAM.


## Requirements

For Sorcery to work, you need one of the following:

* A **text completion** backend with instruct mode and system prompt enabled,
  and character-specific system prompt overrides disabled.
* A **chat completion** backend with the main prompt enabled.

Most users will already have such a configuration, and don't need to do anything special.

Sorcery is developed and tested with the latest stable version of SillyTavern.
It may or may not work with older versions. Sorcery relies on several interfaces from
SillyTavern's internal API, which makes backward compatibility difficult to achieve.


## Installation

Sorcery can be installed in seconds:

1. Open SillyTavern
2. Click the "Extensions" button in the top bar
3. Click "Install extension"
4. Copy this URL into the input field: `https://github.com/p-e-w/sorcery`
5. Click "Install just for me"

A new button should appear in the top bar that looks like a wizard's hat.
Click that button to open the Sorcery configuration UI.


## Is this safe?

It's as safe as you want it to be.

Sorcery enables LLMs to execute the scripts written by the user, nothing more
and nothing less. Models cannot provide their own code to execute, they can only
choose among the already configured scripts. Thus even with a malicious model,
the worst thing that can happen is that it runs one of the scripts you wrote,
at a time that is inconvenient to you. But it is always you who decides what kind
of code can be run.


## Usage example: Controlling a smart bulb

Sorcery's ability to run arbitrary JavaScript code is extremely powerful, because
it allows us to make requests to any HTTP server. By whipping up a purpose-built
HTTP server with Python, we can let Sorcery do almost anything.

This example demonstrates how to control a Philips WiZ WiFi smart light bulb from
Sorcery. WiZ bulbs are relatively cheap, available in most countries, and can be
controlled entirely using open-source software once configured. If you have another
brand of smart light, adapt the instructions as needed.

Configure your WiZ bulb and connect it to the same LAN as your PC. Then figure out
the local IP address of the bulb, for example by logging in to your router. Now
follow these instructions:

Create a Python virtual environment and install dependencies:

```
python3 -m venv .venv
source .venv/bin/activate
pip install flask[async] pywizlight
```

Copy the following code into a file called `main.py`:

```python
import pywizlight
# https://github.com/sbidy/pywizlight/issues/140#issuecomment-1321426436
del pywizlight.wizlight.__del__
from pywizlight import wizlight, PilotBuilder
from flask import Flask

bulb_ip = "192.168.1.10"  # <-- Your bulb's IP address

app = Flask(__name__)

@app.route("/on")
async def light_on():
  light = wizlight(bulb_ip)
  await light.turn_on(PilotBuilder(brightness = 255))
  return ""

@app.route("/off")
async def light_off():
  light = wizlight(bulb_ip)
  await light.turn_off()
  return ""
```

Run the server:

```
flask --app main run --port 3000
```

Open Sorcery and copy the following code into the JavaScript field of the
**"{{char}} turns off the lights"** default script:

```javascript
fetch("http://127.0.0.1:3000/off");
```

Now start a chat and create a situation where the AI character turns off the
lights in the roleplay. **You will see your light bulb turning off in the real
world.** This is as close to magic as it gets.


## Acknowledgments

Sorcery includes the [code-input](https://github.com/WebCoder49/code-input)
library to provide syntax-highlighted text inputs. code-input is licensed
under the MIT License.

Parts of Sorcery's UI HTML were copied from SillyTavern's "World Info" UI.
SillyTavern is licensed under the GNU Affero General Public License.


## License

Copyright &copy; 2025  Philipp Emanuel Weidmann (<pew@worldwidemann.com>)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.

**By contributing to this project, you agree to release your
contributions under the same license.**
