import * as vscode from 'vscode';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Constants
// Extension constants
const API_KEY_SECRET_PREFIX = 'commitAi.apiKey.';
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

    // Register command to set API Key
    const setApiKeyCommand = vscode.commands.registerCommand('commitAi.setApiKey', async () => {
        await setApiKey(context);
        await updateApiKeyContext(context);
    });

    // Register command to clear API Key
    const clearApiKeyCommand = vscode.commands.registerCommand('commitAi.clearApiKey', async () => {
        await clearApiKey(context);
        await updateApiKeyContext(context);
    });

    // Register command to select model
    const selectModelCommand = vscode.commands.registerCommand('commitAi.selectModel', async () => {
        await selectModel();
    });

    // Register command to select professionalism level
    const selectProfessionalismCommand = vscode.commands.registerCommand('commitAi.selectProfessionalism', async () => {
        await selectProfessionalismLevel();
    });

    // Register command to select AI provider
    const selectProviderCommand = vscode.commands.registerCommand('commitAi.selectProvider', async () => {
        await selectAIProvider();
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
        selectProviderCommand,
        generateCommitMessageCommand
    );
}

/**
 * Get the API key secret name for the current provider
 */
function getApiKeySecret(): string {
    const config = vscode.workspace.getConfiguration('commitAi');
    const provider = config.get<string>('provider', 'openai');
    return `${API_KEY_SECRET_PREFIX}${provider}`;
}

/**
 * Update the API key context for conditional view rendering
 */
async function updateApiKeyContext(context: vscode.ExtensionContext): Promise<void> {
    try {
        const config = vscode.workspace.getConfiguration('commitAi');
        const provider = config.get<string>('provider', 'openai');
        
        let hasApiKey = false;
        if (provider === 'ollama') {
            // Ollama doesn't need an API key
            hasApiKey = true;
        } else {
            const apiKeySecret = getApiKeySecret();
            const apiKey = await context.secrets.get(apiKeySecret);
            hasApiKey = !!apiKey;
        }
        
        await vscode.commands.executeCommand('setContext', 'commitAi.apiKeyConfigured', hasApiKey);
    } catch (error) {
        await vscode.commands.executeCommand('setContext', 'commitAi.apiKeyConfigured', false);
    }
}

/**
 * Command handler to manage (clear/update) API Key for current provider
 */
async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
    try {
        const config = vscode.workspace.getConfiguration('commitAi');
        const provider = config.get<string>('provider', 'openai');
        const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
        
        const action = await vscode.window.showQuickPick([
            {
                label: '$(key) Update API Key',
                description: `Replace current ${providerName} API key with a new one`
            },
            {
                label: '$(trash) Clear API Key', 
                description: `Remove the stored ${providerName} API key`
            }
        ], {
            placeHolder: `Choose an action for your ${providerName} API key`,
            title: 'Manage API Key'
        });
        
        if (action?.label.includes('Update')) {
            await setApiKey(context);
            await updateApiKeyContext(context);
        } else if (action?.label.includes('Clear')) {
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to clear the ${providerName} API key?`,
                { modal: true },
                'Yes, Clear'
            );
            
            if (confirm === 'Yes, Clear') {
                const apiKeySecret = getApiKeySecret();
                await context.secrets.delete(apiKeySecret);
                await updateApiKeyContext(context);
                vscode.window.showInformationMessage(`${providerName} API key cleared successfully!`);
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to manage API key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Command handler to select AI model for current provider
 */
async function selectModel(): Promise<void> {
    try {
        const config = vscode.workspace.getConfiguration('commitAi');
        const provider = config.get<string>('provider', 'openai');
        const currentModel = config.get<string>('model', 'gpt-4o-mini');
        
        let models: { label: string; description: string; detail: string; value: string; }[] = [];
        let title = '';
        
        switch (provider) {
            case 'openai':
                title = 'Select OpenAI Model';
                models = [
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
                break;
            case 'anthropic':
                title = 'Select Anthropic Model';
                models = [
                    { 
                        label: '$(star) Claude 3.5 Sonnet', 
                        description: 'Latest and most capable', 
                        detail: 'Best performance and reasoning',
                        value: 'claude-3-5-sonnet-20241022' 
                    },
                    { 
                        label: '$(zap) Claude 3 Haiku', 
                        description: 'Fast and efficient', 
                        detail: 'Lower cost, good quality',
                        value: 'claude-3-haiku-20240307' 
                    }
                ];
                break;
            case 'google':
                title = 'Select Google Gemini Model';
                models = [
                    { 
                        label: '$(star) Gemini 1.5 Flash', 
                        description: 'Fast and free', 
                        detail: 'Good balance of speed and quality',
                        value: 'gemini-1.5-flash' 
                    },
                    { 
                        label: '$(rocket) Gemini 1.5 Pro', 
                        description: 'Most capable', 
                        detail: 'Best quality, slower',
                        value: 'gemini-1.5-pro' 
                    }
                ];
                break;
            case 'ollama':
                title = 'Select Ollama Model';
                models = [
                    { 
                        label: '$(star) Llama 3.1 8B', 
                        description: 'Balanced performance', 
                        detail: 'Good quality, reasonable speed',
                        value: 'llama3.1:8b' 
                    },
                    { 
                        label: '$(rocket) Llama 3.1 70B', 
                        description: 'High quality', 
                        detail: 'Best quality, slower',
                        value: 'llama3.1:70b' 
                    },
                    { 
                        label: '$(code) CodeLlama 7B', 
                        description: 'Code-focused', 
                        detail: 'Optimized for code tasks',
                        value: 'codellama:7b' 
                    }
                ];
                break;
            case 'groq':
                title = 'Select Groq Model';
                models = [
                    { 
                        label: '$(star) Llama 3.1 8B Instant', 
                        description: 'Very fast inference', 
                        detail: 'Extremely fast, good quality',
                        value: 'llama-3.1-8b-instant' 
                    },
                    { 
                        label: '$(rocket) Mixtral 8x7B', 
                        description: 'High performance', 
                        detail: 'Better quality, slightly slower',
                        value: 'mixtral-8x7b-32768' 
                    }
                ];
                break;
            default:
                vscode.window.showErrorMessage(`Unsupported provider: ${provider}`);
                return;
        }
        
        // Mark current model
        const modelsWithCurrent = models.map(model => ({
            ...model,
            label: model.value === currentModel ? `$(check) ${model.label.replace(/\$\([^)]+\)\s*/, '')}` : model.label
        }));
        
        const selectedModel = await vscode.window.showQuickPick(modelsWithCurrent, {
            placeHolder: `Current model: ${currentModel}`,
            title,
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (selectedModel && selectedModel.value !== currentModel) {
            await config.update('model', selectedModel.value, vscode.ConfigurationTarget.Global);
            const modelName = selectedModel.label.replace(/\$\([^)]+\)\s*/, '');
            vscode.window.showInformationMessage(`Model updated to ${modelName}`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to select model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Command handler to select AI provider
 */
async function selectAIProvider(): Promise<void> {
    try {
        const config = vscode.workspace.getConfiguration('commitAi');
        const currentProvider = config.get<string>('provider', 'openai');
        
        const providers = [
            { 
                label: '$(star) OpenAI', 
                description: 'GPT models - Paid API', 
                detail: 'Most popular, high quality responses',
                value: 'openai' 
            },
            { 
                label: '$(gift) Google Gemini', 
                description: 'Free tier available', 
                detail: 'Good quality with generous free usage',
                value: 'google' 
            },
            { 
                label: '$(zap) Groq', 
                description: 'Fast inference with free tier', 
                detail: 'Very fast responses, limited free usage',
                value: 'groq' 
            },
            { 
                label: '$(home) Ollama', 
                description: 'Free local AI models', 
                detail: 'Run models locally, completely free',
                value: 'ollama' 
            },
            { 
                label: '$(mortar-board) Anthropic Claude', 
                description: 'High quality - Paid API', 
                detail: 'Excellent reasoning capabilities',
                value: 'anthropic' 
            }
        ];
        
        // Mark current provider
        const providersWithCurrent = providers.map(provider => ({
            ...provider,
            label: provider.value === currentProvider ? `$(check) ${provider.label.replace(/\$\([^)]+\)\s*/, '')}` : provider.label
        }));
        
        const selectedProvider = await vscode.window.showQuickPick(providersWithCurrent, {
            placeHolder: `Current provider: ${currentProvider}`,
            title: 'Select AI Provider',
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (selectedProvider && selectedProvider.value !== currentProvider) {
            await config.update('provider', selectedProvider.value, vscode.ConfigurationTarget.Global);
            
            // Update model and endpoint based on provider
            const defaultConfigs = {
                openai: { model: 'gpt-4o-mini', endpoint: '' },
                google: { model: 'gemini-1.5-flash', endpoint: '' },
                groq: { model: 'llama3.1:8b', endpoint: 'https://api.groq.com/openai' },
                ollama: { model: 'llama3.1:8b', endpoint: 'http://localhost:11434' },
                anthropic: { model: 'claude-3-haiku-20240307', endpoint: '' }
            };
            
            const defaultConfig = defaultConfigs[selectedProvider.value as keyof typeof defaultConfigs];
            if (defaultConfig) {
                await config.update('model', defaultConfig.model, vscode.ConfigurationTarget.Global);
                await config.update('apiEndpoint', defaultConfig.endpoint, vscode.ConfigurationTarget.Global);
            }
            
            const providerName = selectedProvider.label.replace(/\$\([^)]+\)\s*/, '');
            vscode.window.showInformationMessage(`AI provider updated to: ${providerName}`);
            
            // Show setup instructions for different providers
            if (selectedProvider.value === 'ollama') {
                vscode.window.showInformationMessage('For Ollama: Install from https://ollama.ai and run: ollama pull llama3.1:8b');
            } else if (selectedProvider.value === 'google') {
                vscode.window.showInformationMessage('For Google Gemini: Get a free API key from https://ai.google.dev');
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to select provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function setApiKey(context: vscode.ExtensionContext): Promise<void> {
    try {
        const config = vscode.workspace.getConfiguration('commitAi');
        const provider = config.get<string>('provider', 'openai');
        const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
        
        // For Ollama, no API key is needed
        if (provider === 'ollama') {
            vscode.window.showInformationMessage('Ollama runs locally and does not require an API key. Make sure Ollama is installed and running.');
            return;
        }
        
        let prompt = '';
        let placeholder = '';
        let validateInput: ((value: string) => string | null) | undefined;
        
        switch (provider) {
            case 'openai':
                prompt = 'Enter your OpenAI API Key';
                placeholder = 'sk-...';
                validateInput = (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'API key cannot be empty';
                    }
                    if (!value.startsWith('sk-')) {
                        return 'OpenAI API key should start with "sk-"';
                    }
                    return null;
                };
                break;
            case 'anthropic':
                prompt = 'Enter your Anthropic API Key';
                placeholder = 'sk-ant-...';
                validateInput = (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'API key cannot be empty';
                    }
                    if (!value.startsWith('sk-ant-')) {
                        return 'Anthropic API key should start with "sk-ant-"';
                    }
                    return null;
                };
                break;
            case 'google':
                prompt = 'Enter your Google AI API Key';
                placeholder = 'AIza...';
                validateInput = (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'API key cannot be empty';
                    }
                    return null;
                };
                break;
            case 'groq':
                prompt = 'Enter your Groq API Key';
                placeholder = 'gsk_...';
                validateInput = (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'API key cannot be empty';
                    }
                    return null;
                };
                break;
            default:
                vscode.window.showErrorMessage(`Unsupported provider: ${provider}`);
                return;
        }

        const apiKey = await vscode.window.showInputBox({
            prompt,
            password: true,
            placeHolder: placeholder,
            validateInput
        });

        if (apiKey) {
            const apiKeySecret = getApiKeySecret();
            await context.secrets.store(apiKeySecret, apiKey.trim());
            vscode.window.showInformationMessage(`${providerName} API key saved successfully!`);
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
        // Check if API key is set (except for Ollama)
        const config = vscode.workspace.getConfiguration('commitAi');
        const provider = config.get<string>('provider', 'openai');
        
        let apiKey = '';
        if (provider !== 'ollama') {
            const apiKeySecret = getApiKeySecret();
            const storedApiKey = await context.secrets.get(apiKeySecret);
            if (!storedApiKey) {
                const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
                const action = await vscode.window.showWarningMessage(
                    `${providerName} API key not found. Please set your API key first.`,
                    'Set API Key'
                );
                if (action === 'Set API Key') {
                    await setApiKey(context);
                }
                return;
            }
            apiKey = storedApiKey;
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

            progress.report({ message: 'Calling AI API...' });

            // Generate commit messages using AI
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
        const provider = config.get<string>('provider', 'openai');
        const model = config.get<string>('model', 'gpt-4o-mini');
        const temperature = config.get<number>('temperature', 0.7);
        const professionalism = config.get<string>('professionalism', 'standard');
        const apiEndpoint = config.get<string>('apiEndpoint', '');

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

        let response: string | null = null;

        // Handle different AI providers
        switch (provider) {
            case 'openai':
                response = await callOpenAI(apiKey, model, prompt, temperature);
                break;
            case 'anthropic':
                response = await callAnthropic(apiKey, model, prompt, temperature);
                break;
            case 'google':
                response = await callGoogleGemini(apiKey, model, prompt, temperature);
                break;
            case 'ollama':
                response = await callOllama(apiEndpoint, model, prompt, temperature);
                break;
            case 'groq':
                response = await callGroq(apiKey, apiEndpoint, model, prompt, temperature);
                break;
            default:
                throw new Error(`Unsupported AI provider: ${provider}`);
        }

        if (!response) {
            throw new Error('No response from AI provider');
        }

        // Split response into individual commit messages
        const messages = response
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
            throw new Error('Invalid API key. Please check your API key and try again.');
        }
        if (error instanceof Error && error.message.includes('quota')) {
            throw new Error('API quota exceeded. Please check your usage limits.');
        }
        throw new Error(`AI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
 * Call OpenAI API
 */
async function callOpenAI(apiKey: string, model: string, prompt: string, temperature: number): Promise<string | null> {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: 200
    });
    return response.choices[0]?.message?.content?.trim() || null;
}

/**
 * Call Anthropic Claude API
 */
async function callAnthropic(apiKey: string, model: string, prompt: string, temperature: number): Promise<string | null> {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
        model,
        max_tokens: 200,
        temperature,
        messages: [{ role: 'user', content: prompt }]
    });
    
    const content = response.content[0];
    return content.type === 'text' ? content.text : null;
}

/**
 * Call Google Gemini API
 */
async function callGoogleGemini(apiKey: string, model: string, prompt: string, temperature: number): Promise<string | null> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ 
        model,
        generationConfig: { temperature, maxOutputTokens: 200 }
    });
    
    const result = await geminiModel.generateContent(prompt);
    return result.response.text();
}

/**
 * Call Ollama API (local)
 */
async function callOllama(endpoint: string, model: string, prompt: string, temperature: number): Promise<string | null> {
    const ollamaEndpoint = endpoint || 'http://localhost:11434';
    
    const response = await fetch(`${ollamaEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            prompt,
            stream: false,
            options: { temperature }
        })
    });
    
    if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
    }
    
    const data = await response.json() as { response?: string };
    return data.response || null;
}

/**
 * Call Groq API (OpenAI-compatible)
 */
async function callGroq(apiKey: string, endpoint: string, model: string, prompt: string, temperature: number): Promise<string | null> {
    const groqEndpoint = endpoint || 'https://api.groq.com/openai';
    
    const openai = new OpenAI({
        apiKey,
        baseURL: `${groqEndpoint}/v1`
    });
    
    const response = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: 200
    });
    
    return response.choices[0]?.message?.content?.trim() || null;
}

/**
 * Extension deactivation function
 * Called when VS Code unloads the extension
 */
export function deactivate() {
    console.log(`${EXTENSION_NAME} extension is now deactivated.`);
}
