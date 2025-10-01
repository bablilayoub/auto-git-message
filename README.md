# Auto Git Message

AI-powered Git commit message generator using OpenAI API for VS Code.

## Features

- **AI-Generated Commit Messages**: Generate multiple commit message suggestions based on your staged Git changes
- **Secure API Key Storage**: OpenAI API key is stored securely using VS Code's Secret Storage
- **Professionalism Levels**: Choose from 4 levels of commit message complexity (Simple to Enterprise)
- **Activity Bar Integration**: Dedicated panel in VS Code's Activity Bar for easy access
- **Source Control Integration**: Insert generated messages directly into the Source Control input box
- **Multiple Access Methods**: Activity Bar, Source Control buttons, and Command Palette
- **Configurable AI Settings**: Customize OpenAI model, temperature, and professionalism level
- **Smart UI**: Conditional interface that adapts based on setup status

## Requirements

- VS Code 1.104.0 or higher
- OpenAI API key (get one at [OpenAI Platform](https://platform.openai.com/api-keys))
- Git repository with staged changes

## Installation

1. Install the extension from VS Code Marketplace (or package the extension locally)
2. Set your OpenAI API key using the command `AI: Set OpenAI API Key`

## Usage

### Setting up API Key

1. Open Command Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Windows/Linux)
2. Run command: `AI: Set OpenAI API Key`
3. Enter your OpenAI API key when prompted

### Generating Commit Messages

1. Make some changes to your files
2. Stage the changes you want to commit (`git add` or use VS Code Source Control)
3. Generate commit messages using any of these methods:
   - **Activity Bar**: Click the Auto Git Message icon (git-commit icon) in the left Activity Bar
   - **Source Control Panel**: Click the sparkle (✨) button in the Source Control panel
   - **Command Palette**: Run command `AI: Generate Commit Message`
4. Select one of the 3 generated commit message suggestions
5. The selected message will be inserted into the Source Control input box

## Activity Bar Panel

The extension adds a dedicated panel to VS Code's Activity Bar (the leftmost vertical bar) with a git-commit icon. The panel provides:

**Setup Mode** (when API key is not configured):
- Instructions for getting started
- Direct link to set up your OpenAI API key
- Requirements checklist

**Ready Mode** (when API key is configured):
- Quick access to generate commit messages
- Configuration options (Model selection, Professionalism level)
- API key management
- Usage requirements

You can hide this panel by setting `commitAi.showActivityBar: false` in your settings if you prefer using the Source Control buttons or Command Palette.

## Configuration

Add these settings to your VS Code `settings.json`:

```json
{
  "commitAi.model": "gpt-4o-mini",
  "commitAi.temperature": 0.7,
  "commitAi.professionalism": "standard",
  "commitAi.showActivityBar": true
}
```

### Available Settings

- **`commitAi.model`** (string, default: `"gpt-4o-mini"`)
  - OpenAI model to use for generating commit messages
  - Options: `gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`

- **`commitAi.temperature`** (number, default: `0.7`)
  - Controls randomness in AI responses (0 = deterministic, 2 = very creative)
  - Range: 0.0 to 2.0

- **`commitAi.professionalism`** (string, default: `"standard"`)
  - Professionalism level for commit messages
  - Options:
    - `simple`: Basic format ("fix bug", "add feature")
    - `standard`: Conventional commits ("fix: resolve login issue") 
    - `professional`: With scopes ("fix(auth): resolve login validation issue")
    - `enterprise`: Full format with detailed body and breaking changes

- **`commitAi.showActivityBar`** (boolean, default: `true`)
  - Show/hide the Auto Git Message icon in the Activity Bar
  - Set to `false` to hide the Activity Bar panel if you prefer using other access methods

## Professionalism Levels

The extension offers 4 levels of commit message professionalism to match your project's needs:

### 🔤 Simple
Basic, clear messages without prefixes:
```
fix login bug
add user dashboard  
update documentation
```

### 📝 Standard (Default)
Conventional Commits format:
```
fix: resolve login validation issue
feat: add responsive user dashboard
docs: update API authentication guide
```

### 💼 Professional  
Conventional Commits with scopes:
```
fix(auth): resolve login validation issue
feat(ui): add responsive user dashboard
docs(api): update authentication endpoints
```

### 🏢 Enterprise
Full format with detailed descriptions and breaking changes:
```
feat(auth)!: implement OAuth2 authentication

Add comprehensive OAuth2 support with PKCE flow
for enhanced security and better user experience.

BREAKING CHANGE: removes basic authentication support.
All users must migrate to OAuth2 tokens.

Closes #123
```

## Commands

- **`AI: Set OpenAI API Key`**: Prompts to enter and securely store your OpenAI API key
- **`AI: Generate Commit Message`**: Generates commit messages based on staged changes
- **`Select OpenAI Model`**: Choose which OpenAI model to use with detailed descriptions and current model indicator
- **`Select Professionalism Level`**: Choose commit message complexity from simple to enterprise-grade
- **`Manage API Key`**: Update or remove the stored OpenAI API key

## Development

### Prerequisites

- Node.js 18+ and npm
- VS Code

### Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Open in VS Code
4. Press `F5` to launch Extension Development Host

### Building

```bash
# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Lint code
npm run lint

# Package extension
npm install -g @vscode/vsce
vsce package
```

### Testing the Extension

1. Press `F5` in VS Code to launch the Extension Development Host
2. In the new window, open a folder with a Git repository
3. Make some changes and stage them (`git add`)
4. Set your OpenAI API key: `Cmd+Shift+P` → `AI: Set OpenAI API Key`
5. Generate commit message: `Cmd+Shift+P` → `AI: Generate Commit Message`

## Error Handling

The extension handles various error scenarios:

- **No API Key**: Prompts to set API key first
- **No Staged Changes**: Warns user to stage files first
- **No Git Repository**: Shows error if not in a Git repository
- **API Errors**: Handles invalid API keys, quota limits, and network issues
- **Fallback to Clipboard**: If Source Control input box is unavailable, copies message to clipboard

## Privacy & Security

- OpenAI API key is stored securely using VS Code's Secret Storage
- Only staged changes (git diff --staged) are sent to OpenAI
- No personal information or file paths are included in API requests

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting: `npm run lint`
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Changelog

### 0.0.1
- Initial release
- Basic commit message generation with OpenAI API
- Secure API key storage
- Source Control integration
- Configurable AI settings
This is the README for your extension "y". After writing up a brief description, we recommend including the following sections.

## Features

Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

- If the Source Control input box is not available, the extension will fallback to copying the commit message to clipboard
- Very large diffs (>1MB) may cause slower API response times

## Changelog

### 0.0.1 - Initial Release

- ✨ AI-powered commit message generation using OpenAI API
- 🔐 Secure API key storage with VS Code Secret Storage
- 📊 Four professionalism levels (Simple, Standard, Professional, Enterprise)
- 🎯 Activity Bar integration with smart conditional UI
- ⚙️ Configurable OpenAI models and temperature settings
- 🔧 Multiple access methods (Activity Bar, Source Control, Command Palette)
- 📝 Source Control integration with automatic message insertion
- 🎨 Professional VS Code UI with proper icons and structure

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting: `npm run lint`
5. Submit a pull request
