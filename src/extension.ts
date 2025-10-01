import * as vscode from 'vscode';
import OpenAI from 'openai';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Constants
const API_KEY_SECRET = 'commitAi.openaiApiKey';
const EXTENSION_NAME = 'Auto Git Message';

/**
 * Tree Data Provider for the Activity Bar view
 * Provides a simple tree structure for the AI Commit Message panel
 */
class AiCommitViewProvider implements vscode.TreeDataProvider<string> {
    getTreeItem(element: string): vscode.TreeItem {
        return new vscode.TreeItem(element, vscode.TreeItemCollapsibleState.None);
    }

    getChildren(element?: string): Thenable<string[]> {
        if (!element) {
            return Promise.resolve([]);
        }
        return Promise.resolve([]);
    }
}

/**
 * Extension activation function
 * Called when VS Code loads the extension
 */
export function activate(context: vscode.ExtensionContext) {
    console.log(`${EXTENSION_NAME} extension is now active!`);

    // Initialize API key context
    updateApiKeyContext(context);

    // Register the tree data provider for the Activity Bar view
    const aiCommitProvider = new AiCommitViewProvider();
    vscode.window.registerTreeDataProvider('commitAi.aiCommitView', aiCommitProvider);

    // Register command to set OpenAI API Key
    const setApiKeyCommand = vscode.commands.registerCommand('commitAi.setApiKey', async () => {
        await setOpenAIApiKey(context);
        await updateApiKeyContext(context);
    });

    // Register command to clear API Key
    const clearApiKeyCommand = vscode.commands.registerCommand('commitAi.clearApiKey', async () => {
        await clearOpenAIApiKey(context);
        await updateApiKeyContext(context);
    });

    // Register command to select model
    const selectModelCommand = vscode.commands.registerCommand('commitAi.selectModel', async () => {
        await selectOpenAIModel();
    });

    // Register command to select professionalism level
    const selectProfessionalismCommand = vscode.commands.registerCommand('commitAi.selectProfessionalism', async () => {
        await selectProfessionalismLevel();
    });

    // Register command to generate commit message
    const generateCommitMessageCommand = vscode.commands.registerCommand('commitAi.generateCommitMessage', async () => {
        await generateCommitMessage(context);
    });

    // Add commands to extension context subscriptions
    context.subscriptions.push(
        setApiKeyCommand, 
        clearApiKeyCommand,
        selectModelCommand,
        selectProfessionalismCommand,
        generateCommitMessageCommand
    );
}

/**
 * Update the API key context for conditional view rendering
 */
async function updateApiKeyContext(context: vscode.ExtensionContext): Promise<void> {
    try {
        const apiKey = await context.secrets.get(API_KEY_SECRET);
        await vscode.commands.executeCommand('setContext', 'commitAi.apiKeyConfigured', !!apiKey);
    } catch (error) {
        await vscode.commands.executeCommand('setContext', 'commitAi.apiKeyConfigured', false);
    }
}

/**
 * Command handler to manage (clear/update) OpenAI API Key
 */
async function clearOpenAIApiKey(context: vscode.ExtensionContext): Promise<void> {
    try {
        const action = await vscode.window.showQuickPick([
            {
                label: '$(key) Update API Key',
                description: 'Replace current API key with a new one'
            },
            {
                label: '$(trash) Clear API Key', 
                description: 'Remove the stored API key'
            }
        ], {
            placeHolder: 'Choose an action for your OpenAI API key',
            title: 'Manage API Key'
        });
        
        if (action?.label.includes('Update')) {
            await setOpenAIApiKey(context);
            await updateApiKeyContext(context);
        } else if (action?.label.includes('Clear')) {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to clear the OpenAI API key?',
                { modal: true },
                'Yes, Clear'
            );
            
            if (confirm === 'Yes, Clear') {
                await context.secrets.delete(API_KEY_SECRET);
                await updateApiKeyContext(context);
                vscode.window.showInformationMessage('OpenAI API key cleared successfully!');
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to manage API key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Command handler to select OpenAI model
 */
async function selectOpenAIModel(): Promise<void> {
    try {
        const config = vscode.workspace.getConfiguration('commitAi');
        const currentModel = config.get<string>('model', 'gpt-4o-mini');
        
        const models = [
            { 
                label: '$(star) GPT-4o Mini', 
                description: 'Fast and cost-effective', 
                detail: 'Recommended for most use cases',
                value: 'gpt-4o-mini' 
            },
            { 
                label: '$(rocket) GPT-4o', 
                description: 'Most capable model', 
                detail: 'Best quality, higher cost',
                value: 'gpt-4o' 
            },
            { 
                label: '$(zap) GPT-4 Turbo', 
                description: 'High performance', 
                detail: 'Fast with good quality',
                value: 'gpt-4-turbo' 
            },
            { 
                label: '$(history) GPT-3.5 Turbo', 
                description: 'Legacy model', 
                detail: 'Lower cost, basic quality',
                value: 'gpt-3.5-turbo' 
            }
        ];
        
        // Mark current model
        const modelsWithCurrent = models.map(model => ({
            ...model,
            label: model.value === currentModel ? `$(check) ${model.label.replace('$(star) ', '').replace('$(rocket) ', '').replace('$(zap) ', '').replace('$(history) ', '')}` : model.label
        }));
        
        const selectedModel = await vscode.window.showQuickPick(modelsWithCurrent, {
            placeHolder: `Current model: ${currentModel}`,
            title: 'Select OpenAI Model',
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (selectedModel && selectedModel.value !== currentModel) {
            await config.update('model', selectedModel.value, vscode.ConfigurationTarget.Global);
            const modelName = selectedModel.label.replace(/\$\([^)]+\)\s*/, '');
            vscode.window.showInformationMessage(`OpenAI model updated to: ${modelName}`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to select model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
async function setOpenAIApiKey(context: vscode.ExtensionContext): Promise<void> {
    try {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your OpenAI API Key',
            password: true,
            placeHolder: 'sk-...',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'API key cannot be empty';
                }
                if (!value.startsWith('sk-')) {
                    return 'OpenAI API key should start with "sk-"';
                }
                return null;
            }
        });

        if (apiKey) {
            await context.secrets.store(API_KEY_SECRET, apiKey.trim());
            vscode.window.showInformationMessage('OpenAI API key saved successfully!');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to save API key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Command handler to generate commit message
 * Main function that orchestrates the commit message generation process
 */
async function generateCommitMessage(context: vscode.ExtensionContext): Promise<void> {
    try {
        // Check if API key is set
        const apiKey = await context.secrets.get(API_KEY_SECRET);
        if (!apiKey) {
            const action = await vscode.window.showWarningMessage(
                'OpenAI API key not found. Please set your API key first.',
                'Set API Key'
            );
            if (action === 'Set API Key') {
                await setOpenAIApiKey(context);
            }
            return;
        }

        // Check if we're in a Git repository
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found. Please open a folder with a Git repository.');
            return;
        }

        // Show progress indicator
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Generating commit message...',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Reading staged changes...' });

            // Get staged changes
            const stagedChanges = await getStagedChanges(workspaceFolder.uri.fsPath);
            if (!stagedChanges || stagedChanges.trim().length === 0) {
                vscode.window.showWarningMessage('No staged changes found. Please stage some files first using "git add".');
                return;
            }

            progress.report({ message: 'Calling OpenAI API...' });

            // Generate commit messages using OpenAI
            const commitMessages = await generateCommitMessagesWithAI(apiKey, stagedChanges);
            if (!commitMessages || commitMessages.length === 0) {
                vscode.window.showErrorMessage('Failed to generate commit messages. Please try again.');
                return;
            }

            progress.report({ message: 'Presenting options...' });

            // Show commit message options to user
            const selectedMessage = await vscode.window.showQuickPick(commitMessages, {
                placeHolder: 'Select a commit message',
                title: 'AI Generated Commit Messages'
            });

            if (selectedMessage) {
                await insertCommitMessage(selectedMessage);
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Error generating commit message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Command handler to select professionalism level
 */
async function selectProfessionalismLevel(): Promise<void> {
    try {
        const config = vscode.workspace.getConfiguration('commitAi');
        const currentLevel = config.get<string>('professionalism', 'standard');
        
        const levels = [
            { 
                label: '$(symbol-text) Simple', 
                description: 'Basic format', 
                detail: 'fix bug, add feature, update docs',
                value: 'simple' 
            },
            { 
                label: '$(symbol-method) Standard', 
                description: 'Conventional commits', 
                detail: 'fix: resolve login issue, feat: add user dashboard',
                value: 'standard' 
            },
            { 
                label: '$(briefcase) Professional', 
                description: 'With scopes and details', 
                detail: 'fix(auth): resolve login validation issue',
                value: 'professional' 
            },
            { 
                label: '$(organization) Enterprise', 
                description: 'Full format with breaking changes', 
                detail: 'feat(api)!: add new authentication system\n\nBREAKING CHANGE: requires migration',
                value: 'enterprise' 
            }
        ];
        
        // Mark current level
        const levelsWithCurrent = levels.map(level => ({
            ...level,
            label: level.value === currentLevel ? `$(check) ${level.label.replace(/\$\([^)]+\)\s*/, '')}` : level.label
        }));
        
        const selectedLevel = await vscode.window.showQuickPick(levelsWithCurrent, {
            placeHolder: `Current level: ${currentLevel}`,
            title: 'Select Commit Message Professionalism Level',
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (selectedLevel && selectedLevel.value !== currentLevel) {
            await config.update('professionalism', selectedLevel.value, vscode.ConfigurationTarget.Global);
            const levelName = selectedLevel.label.replace(/\$\([^)]+\)\s*/, '');
            vscode.window.showInformationMessage(`Professionalism level updated to: ${levelName}`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to select professionalism level: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
async function getStagedChanges(workspaceRoot: string): Promise<string> {
    try {
        const { stdout, stderr } = await execAsync('git diff --staged', { 
            cwd: workspaceRoot,
            maxBuffer: 1024 * 1024 // 1MB buffer for large diffs
        });

        if (stderr && stderr.trim().length > 0) {
            console.warn('Git diff stderr:', stderr);
        }

        return stdout;
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 128) {
            throw new Error('Not a Git repository or Git is not installed');
        }
        throw new Error(`Failed to get staged changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Generate commit messages using OpenAI API
 * Sends the staged changes to OpenAI and gets commit message suggestions
 */
async function generateCommitMessagesWithAI(apiKey: string, stagedChanges: string): Promise<string[]> {
    try {
        const config = vscode.workspace.getConfiguration('commitAi');
        const model = config.get<string>('model', 'gpt-4o-mini');
        const temperature = config.get<number>('temperature', 0.7);
        const professionalism = config.get<string>('professionalism', 'standard');

        const openai = new OpenAI({
            apiKey: apiKey
        });

        // Create professionalism-specific prompts
        const professionalismPrompts = {
            simple: {
                description: 'Create simple, clear commit messages without prefixes',
                format: 'Examples: "fix login bug", "add user dashboard", "update documentation"',
                rules: '• Use imperative mood\n• Keep under 50 characters\n• No type prefixes or special formatting'
            },
            standard: {
                description: 'Follow standard Conventional Commits format',
                format: 'Examples: "fix: resolve login issue", "feat: add user dashboard", "docs: update API guide"',
                rules: '• Use conventional commit types (feat, fix, docs, style, refactor, test, chore)\n• Format: type: description\n• Keep under 50 characters for subject line'
            },
            professional: {
                description: 'Use professional Conventional Commits with scopes',
                format: 'Examples: "fix(auth): resolve login validation issue", "feat(ui): add responsive user dashboard", "docs(api): update authentication endpoints"',
                rules: '• Include relevant scope in parentheses\n• Format: type(scope): description\n• Be specific about the component/area affected\n• Keep under 72 characters total'
            },
            enterprise: {
                description: 'Full enterprise-grade commit messages with detailed descriptions',
                format: 'Examples: "feat(auth)!: implement OAuth2 authentication\n\nAdd comprehensive OAuth2 support with PKCE\n\nBREAKING CHANGE: removes basic auth support"',
                rules: '• Include scope and breaking change indicators (!)\n• Add detailed body explaining the change\n• Include BREAKING CHANGE footer if applicable\n• Reference issues/tickets when relevant\n• Multiple lines allowed for complex changes'
            }
        };

        const currentStyle = professionalismPrompts[professionalism as keyof typeof professionalismPrompts] || professionalismPrompts.standard;

        const prompt = `You are a Git commit message generator. Based on the following staged changes, generate exactly 3 different commit message suggestions.

Professionalism Level: ${professionalism.toUpperCase()}
${currentStyle.description}

Format Requirements:
${currentStyle.format}

Rules:
${currentStyle.rules}

Additional Guidelines:
• Focus on what was changed, not how
• Use imperative mood (e.g., "Add feature" not "Added feature")
• Each message should be on a separate line
• Do not include any explanations or additional text
• Ensure messages are clear and descriptive

Staged changes:
\`\`\`
${stagedChanges}
\`\`\`

Generate 3 commit messages:`;

        const response = await openai.chat.completions.create({
            model: model,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: temperature,
            max_tokens: 200
        });

        const content = response.choices[0]?.message?.content?.trim();
        if (!content) {
            throw new Error('No response from OpenAI');
        }

        // Split response into individual commit messages
        const messages = content
            .split('\n')
            .map(msg => msg.trim())
            .filter(msg => msg.length > 0)
            .slice(0, 3); // Ensure we only take 3 messages

        if (messages.length === 0) {
            throw new Error('No valid commit messages generated');
        }

        return messages;

    } catch (error) {
        if (error instanceof Error && error.message.includes('401')) {
            throw new Error('Invalid OpenAI API key. Please check your API key and try again.');
        }
        if (error instanceof Error && error.message.includes('quota')) {
            throw new Error('OpenAI API quota exceeded. Please check your usage limits.');
        }
        throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Insert the selected commit message into the Source Control input box
 * Falls back to copying to clipboard if input box is not available
 */
async function insertCommitMessage(message: string): Promise<void> {
    try {
        // Try to find the Git source control
        const gitExtension = vscode.extensions.getExtension('vscode.git');
        if (!gitExtension) {
            throw new Error('Git extension not found');
        }

        const git = gitExtension.exports;
        const repositories = git.getRepositories();
        
        if (repositories.length === 0) {
            throw new Error('No Git repositories found');
        }

        // Use the first repository (usually the current workspace)
        const repository = repositories[0];
        
        if (repository.inputBox) {
            repository.inputBox.value = message;
            vscode.window.showInformationMessage('Commit message inserted into Source Control input box');
        } else {
            // Fallback: copy to clipboard
            await vscode.env.clipboard.writeText(message);
            vscode.window.showInformationMessage('Commit message copied to clipboard (Source Control input box not available)');
        }

    } catch (error) {
        console.warn('Failed to insert into Source Control input box:', error);
        
        // Fallback: copy to clipboard
        try {
            await vscode.env.clipboard.writeText(message);
            vscode.window.showInformationMessage('Commit message copied to clipboard');
        } catch (clipboardError) {
            vscode.window.showErrorMessage(`Failed to copy to clipboard: ${clipboardError instanceof Error ? clipboardError.message : 'Unknown error'}`);
        }
    }
}

/**
 * Extension deactivation function
 * Called when VS Code unloads the extension
 */
export function deactivate() {
    console.log(`${EXTENSION_NAME} extension is now deactivated.`);
}
