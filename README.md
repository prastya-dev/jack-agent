<div align="center">

```text
 ┏┓┏━┓┏━╸╻┏    ┏━┓┏━╸┏━╸┏┓╻╺┳╸
  ┃┣━┫┃  ┣┻┓   ┣━┫┃╺┓┣╸ ┃┗┫ ┃ 
┗━┛╹ ╹┗━╸╹ ╹   ╹ ╹┗━┛┗━╸╹ ╹ ╹ 
```

**Next-Gen AI CLI Terminal Interface**

[![npm version](https://badge.fury.io/js/@prastya-dev%2Fjack-agent.svg)](https://badge.fury.io/js/@prastya-dev%2Fjack-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@prastya-dev/jack-agent)](https://nodejs.org/)

JACK-Agent is a revolutionary terminal-based AI assistant designed specifically for developers and power users. Fully integrated with advanced models from Google Antigravity, JACK-Agent brings the power of next-generation coding and AI assistance right to your fingertips in the terminal.

[Key Features](#-key-features) • [Installation](#-installation) • [Usage Guide](#-usage-guide) • [Contributors](#-contributors)

</div>

---

> [!IMPORTANT]
> **Contributing / AI agents:** read [`PRD.md`](PRD.md) and [`TASKS.md`](TASKS.md) **before** touching any code, and read [`AGENTS.md`](AGENTS.md) for the condensed rules. Every completed change must be logged in `TASKS.md`.

---

## Key Features

- **Agentic, one mode:** jack always works like an agent — it reads the project, runs commands, and verifies its own work until the task is done.
- **Multi-provider:** Google Antigravity (OAuth2) or any OpenAI-compatible endpoint (`base_url` + `api_key`), with an optional fallback provider.
- **Layered permissions:** read-only commands run automatically, anything else asks first, destructive patterns (`rm -rf /`, `mkfs`, `dd if=`, …) are always blocked. Non-interactive sessions never guess "yes".
- **Skills:** drop a `SKILL.md` into a skill folder (`jack skill add <url|dir>`); only its name and description enter the prompt, the body is loaded on demand.
- **Token-thrifty:** command output is truncated (head + tail) before it goes back to the model, and `/compact` summarizes long sessions.
- **Smart Authentication (OAuth2):** Secure integrated login system via browser.
- **Modern TUI (Terminal User Interface):** A beautiful, intuitive, and responsive terminal experience featuring seamless keyboard navigation, slash-command suggestions while typing, and scrollable pickers for long model/skill lists.
- **Zero Dependencies:** Available as a standalone binary (Linux, macOS, Windows) requiring absolutely no Node.js installation!
- **Smart OS Integration:** "Run JACK Here" feature for lightning-fast access via Windows Context Menu.

---

## Installation

Choose the method that best fits your workflow:

### Method 1: Automatic Installation (Standalone Binary)
> [!TIP]
> This method is highly recommended if you prefer a hassle-free setup without installing Node.js.

#### Linux / macOS
Open your terminal and run the following installation script:
```bash
curl -fsSL https://raw.githubusercontent.com/prastya-dev/jack-agent/main/scripts/install.sh | bash
```

#### Windows (Powershell)
Open PowerShell **as Administrator**, and run:
```powershell
irm https://raw.githubusercontent.com/prastya-dev/jack-agent/main/scripts/install.ps1 | iex
```
> [!NOTE]
> The Windows installation will automatically add a **"Run JACK Here"** option when you right-click in File Explorer.

---

### Method 2: Installation via NPM
> [!IMPORTANT]
> Ensure you have **Node.js (version 18 or higher)** installed on your machine.

Open your terminal and run:
```bash
npm install -g @prastya-dev/jack-agent
```

---

## Usage Guide

Starting JACK-Agent is as easy as calling its name. Open a new terminal and type:

```bash
jack
```
*(Note: On first launch you will be asked to sign in with Google (Antigravity) or to add an OpenAI-compatible provider).*

### Launch Flags
- `jack "<tujuan>"` → start the REPL and send that task right away
- `jack -p "<tujuan>"` → one-shot: run the task, print the result, exit (script/cron friendly)
- `jack -p "<tujuan>" --allow-write` → one-shot with write commands auto-approved (destructive patterns stay blocked)
- `jack --provider <nama>` / `jack --model <nama>` → override provider/model for this session only
- `jack provider add|list|use|test|rm` → manage OpenAI-compatible providers
- `jack skill add|list|rm` → manage skills
- `jack --update` → Check and update to the latest release version automatically.

Without arguments in a non-interactive shell (pipe, cron, CI), jack reads the task from stdin and prints the plain answer.

### Slash Commands
Type `/` to see matching commands below the prompt with a scrollbar (`↑`/`↓` select, `Tab` complete, `Enter` run). Long model/provider/skill lists open in a fixed 10-row viewport instead of flooding the terminal.

Type these commands directly inside the application's prompt to access various features:

| Command | Description |
| :--- | :--- |
| `/model` | Open an interactive menu to change the active AI model. |
| `/provider` | Show/switch providers; the menu includes `+ tambah provider (base_url + api_key)` for custom OpenAI-compatible endpoints (`/provider test` to ping). |
| `/skill` | List and load a skill into the current context. |
| `/allow` | Show the allowlist (`/allow add|rm <program>`). |
| `/compact` | Summarize the session history to save tokens. |
| `/cd <path>`| Change the active working directory from within the application. |
| `/clear` | Clear the terminal screen and reset the session history. |
| `/token` | View information regarding your AI token usage limits and quota. |
| `/help` | Display the comprehensive help menu. |
| `/exit` | Exit the application. |

---

## Uninstall

If you wish to completely remove the application (including the Windows Registry Context Menu and secret session configurations):

Run the following command in any terminal:
```bash
jack --uninstall
```

---

## Contributors

Crafted with  by **[prastya-dev](https://github.com/prastya-dev)** — _Creator & Lead Developer_.

---
<div align="center">
  <i>JACK-Agent is an open-source software licensed under MIT.</i>
</div>
