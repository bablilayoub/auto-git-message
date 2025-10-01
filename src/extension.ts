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
const COMMIT_HISTORY_KEY = 'commitAi.commitHistory';
const COMMIT_FAVORITES_KEY = 'commitAi.commitFavorites';
const MAX_HISTORY_ITEMS = 20;
const EXTENSION_NAME = 'Auto Git Message';

// Types
interface CommitMessageItem {
    message: string;
    timestamp: number;
    provider: string;
    model: string;
}

interface ChangeContext {
    fileTypes: string[];
    frameworks: string[];
    changeTypes: string[];
    hasTests: boolean;
    hasConfig: boolean;
    hasDocs: boolean;
    language: string;
    scope: string;
}

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

    // Register command to show commit history
    const showCommitHistoryCommand = vscode.commands.registerCommand('commitAi.showCommitHistory', async () => {
        await showCommitHistory(context);
    });

    // Register command to show favorite commits
    const showFavoriteCommitsCommand = vscode.commands.registerCommand('commitAi.showFavoriteCommits', async () => {
        await showFavoriteCommits(context);
    });

    // Register command to manage favorites
    const manageFavoritesCommand = vscode.commands.registerCommand('commitAi.manageFavorites', async () => {
        await manageFavorites(context);
    });

    // Add commands to extension context subscriptions
    context.subscriptions.push(
        setApiKeyCommand, 
        clearApiKeyCommand,
        selectModelCommand,
        selectProfessionalismCommand,
        selectProviderCommand,
        generateCommitMessageCommand,
        showCommitHistoryCommand,
        showFavoriteCommitsCommand,
        manageFavoritesCommand
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
 * Get commit message history from storage
 */
async function getCommitHistory(context: vscode.ExtensionContext): Promise<CommitMessageItem[]> {
    const history = context.globalState.get<CommitMessageItem[]>(COMMIT_HISTORY_KEY, []);
    return history.sort((a, b) => b.timestamp - a.timestamp); // Most recent first
}

/**
 * Add a commit message to history
 */
async function addToCommitHistory(context: vscode.ExtensionContext, message: string, provider: string, model: string): Promise<void> {
    const history = await getCommitHistory(context);
    
    // Don't add duplicates
    if (history.some(item => item.message === message)) {
        return;
    }
    
    const newItem: CommitMessageItem = {
        message,
        timestamp: Date.now(),
        provider,
        model
    };
    
    history.unshift(newItem);
    
    // Keep only the most recent items
    if (history.length > MAX_HISTORY_ITEMS) {
        history.splice(MAX_HISTORY_ITEMS);
    }
    
    await context.globalState.update(COMMIT_HISTORY_KEY, history);
}

/**
 * Get favorite commit messages from storage
 */
async function getFavoriteCommits(context: vscode.ExtensionContext): Promise<CommitMessageItem[]> {
    const favorites = context.globalState.get<CommitMessageItem[]>(COMMIT_FAVORITES_KEY, []);
    return favorites.sort((a, b) => b.timestamp - a.timestamp); // Most recent first
}

/**
 * Add a commit message to favorites
 */
async function addToFavorites(context: vscode.ExtensionContext, message: string, provider: string, model: string): Promise<void> {
    const favorites = await getFavoriteCommits(context);
    
    // Don't add duplicates
    if (favorites.some(item => item.message === message)) {
        vscode.window.showInformationMessage('This message is already in your favorites!');
        return;
    }
    
    const newItem: CommitMessageItem = {
        message,
        timestamp: Date.now(),
        provider,
        model
    };
    
    favorites.unshift(newItem);
    await context.globalState.update(COMMIT_FAVORITES_KEY, favorites);
    vscode.window.showInformationMessage('Commit message added to favorites!');
}

/**
 * Remove a commit message from favorites
 */
async function removeFromFavorites(context: vscode.ExtensionContext, message: string): Promise<void> {
    const favorites = await getFavoriteCommits(context);
    const filtered = favorites.filter(item => item.message !== message);
    await context.globalState.update(COMMIT_FAVORITES_KEY, filtered);
    vscode.window.showInformationMessage('Commit message removed from favorites!');
}

/**
 * Show commit message history
 */
async function showCommitHistory(context: vscode.ExtensionContext): Promise<void> {
    try {
        const history = await getCommitHistory(context);
        
        if (history.length === 0) {
            vscode.window.showInformationMessage('No commit message history found. Generate some commit messages first!');
            return;
        }
        
        const historyItems = history.map(item => ({
            label: `$(history) ${item.message}`,
            description: `${item.provider} (${item.model})`,
            detail: `${new Date(item.timestamp).toLocaleString()}`,
            item
        }));
        
        const selected = await vscode.window.showQuickPick(historyItems, {
            placeHolder: 'Select a commit message from history',
            title: 'Commit Message History',
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (selected) {
            const action = await vscode.window.showQuickPick([
                { label: '$(git-commit) Use this message', action: 'use' },
                { label: '$(star) Add to favorites', action: 'favorite' },
                { label: '$(copy) Copy to clipboard', action: 'copy' }
            ], {
                placeHolder: 'What would you like to do with this message?'
            });
            
            if (action?.action === 'use') {
                await insertCommitMessage(selected.item.message);
            } else if (action?.action === 'favorite') {
                await addToFavorites(context, selected.item.message, selected.item.provider, selected.item.model);
            } else if (action?.action === 'copy') {
                await vscode.env.clipboard.writeText(selected.item.message);
                vscode.window.showInformationMessage('Commit message copied to clipboard!');
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to show commit history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Show favorite commit messages
 */
async function showFavoriteCommits(context: vscode.ExtensionContext): Promise<void> {
    try {
        const favorites = await getFavoriteCommits(context);
        
        if (favorites.length === 0) {
            vscode.window.showInformationMessage('No favorite commit messages found. Add some messages to favorites first!');
            return;
        }
        
        const favoriteItems = favorites.map(item => ({
            label: `$(star) ${item.message}`,
            description: `${item.provider} (${item.model})`,
            detail: `Added ${new Date(item.timestamp).toLocaleString()}`,
            item
        }));
        
        const selected = await vscode.window.showQuickPick(favoriteItems, {
            placeHolder: 'Select a favorite commit message',
            title: 'Favorite Commit Messages',
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (selected) {
            const action = await vscode.window.showQuickPick([
                { label: '$(git-commit) Use this message', action: 'use' },
                { label: '$(copy) Copy to clipboard', action: 'copy' },
                { label: '$(trash) Remove from favorites', action: 'remove' }
            ], {
                placeHolder: 'What would you like to do with this message?'
            });
            
            if (action?.action === 'use') {
                await insertCommitMessage(selected.item.message);
            } else if (action?.action === 'copy') {
                await vscode.env.clipboard.writeText(selected.item.message);
                vscode.window.showInformationMessage('Commit message copied to clipboard!');
            } else if (action?.action === 'remove') {
                await removeFromFavorites(context, selected.item.message);
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to show favorite commits: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Manage favorites - bulk operations
 */
async function manageFavorites(context: vscode.ExtensionContext): Promise<void> {
    try {
        const action = await vscode.window.showQuickPick([
            { 
                label: '$(star) Show Favorites', 
                description: 'View and use favorite commit messages',
                action: 'show' 
            },
            { 
                label: '$(history) Show History', 
                description: 'View recent commit message history',
                action: 'history' 
            },
            { 
                label: '$(trash) Clear All Favorites', 
                description: 'Remove all favorite commit messages',
                action: 'clear-favorites' 
            },
            { 
                label: '$(clear-all) Clear History', 
                description: 'Remove all commit message history',
                action: 'clear-history' 
            }
        ], {
            placeHolder: 'Choose an action',
            title: 'Manage Commit Messages'
        });
        
        if (action?.action === 'show') {
            await showFavoriteCommits(context);
        } else if (action?.action === 'history') {
            await showCommitHistory(context);
        } else if (action?.action === 'clear-favorites') {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to clear all favorite commit messages?',
                { modal: true },
                'Yes, Clear All'
            );
            if (confirm === 'Yes, Clear All') {
                await context.globalState.update(COMMIT_FAVORITES_KEY, []);
                vscode.window.showInformationMessage('All favorite commit messages have been cleared!');
            }
        } else if (action?.action === 'clear-history') {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to clear all commit message history?',
                { modal: true },
                'Yes, Clear All'
            );
            if (confirm === 'Yes, Clear All') {
                await context.globalState.update(COMMIT_HISTORY_KEY, []);
                vscode.window.showInformationMessage('All commit message history has been cleared!');
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to manage favorites: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Analyze staged changes to provide context for better commit messages
 */
async function analyzeChangeContext(workspacePath: string): Promise<ChangeContext> {
    try {
        const { stdout } = await execAsync('git diff --staged --name-only', { cwd: workspacePath });
        const changedFiles = stdout.trim().split('\n').filter(file => file.length > 0);
        
        const context: ChangeContext = {
            fileTypes: [],
            frameworks: [],
            changeTypes: [],
            hasTests: false,
            hasConfig: false,
            hasDocs: false,
            language: 'unknown',
            scope: ''
        };
        
        // Analyze file types and patterns
        for (const file of changedFiles) {
            const extension = file.split('.').pop()?.toLowerCase() || '';
            const filename = file.toLowerCase();
            const directory = file.split('/')[0]?.toLowerCase() || '';
            
            // File types
            if (!context.fileTypes.includes(extension) && extension) {
                context.fileTypes.push(extension);
            }
            
            // Language detection
            if (['ts', 'tsx', 'js', 'jsx'].includes(extension)) {
                context.language = 'javascript/typescript';
            } else if (['py'].includes(extension)) {
                context.language = 'python';
            } else if (['java'].includes(extension)) {
                context.language = 'java';
            } else if (['cs'].includes(extension)) {
                context.language = 'csharp';
            } else if (['go'].includes(extension)) {
                context.language = 'go';
            } else if (['rs'].includes(extension)) {
                context.language = 'rust';
            } else if (['php'].includes(extension)) {
                context.language = 'php';
            }
            
            // Framework detection
            if (filename.includes('package.json') || filename.includes('package-lock.json')) {
                context.frameworks.push('node.js');
                context.hasConfig = true;
            }
            if (filename.includes('requirements.txt') || filename.includes('pyproject.toml')) {
                context.frameworks.push('python');
                context.hasConfig = true;
            }
            if (filename.includes('cargo.toml') || filename.includes('cargo.lock')) {
                context.frameworks.push('rust');
                context.hasConfig = true;
            }
            if (directory === 'src' || directory === 'lib') {
                context.scope = 'core';
            }
            if (filename.includes('test') || filename.includes('spec') || directory.includes('test')) {
                context.hasTests = true;
                context.scope = context.scope || 'test';
            }
            if (filename.includes('config') || filename.includes('.env') || extension === 'json' || extension === 'yaml' || extension === 'yml') {
                context.hasConfig = true;
                context.scope = context.scope || 'config';
            }
            if (filename.includes('readme') || filename.includes('doc') || extension === 'md') {
                context.hasDocs = true;
                context.scope = context.scope || 'docs';
            }
            
            // React/Vue/Angular detection
            if (filename.includes('component') || extension === 'vue' || extension === 'tsx' || extension === 'jsx') {
                context.frameworks.push('frontend');
            }
            
            // API/Backend detection
            if (filename.includes('api') || filename.includes('controller') || filename.includes('service') || filename.includes('model')) {
                context.frameworks.push('backend');
            }
        }
        
        // Determine change types
        if (context.hasTests) {
            context.changeTypes.push('test');
        }
        if (context.hasConfig) {
            context.changeTypes.push('config');
        }
        if (context.hasDocs) {
            context.changeTypes.push('docs');
        }
        if (context.frameworks.includes('frontend')) {
            context.changeTypes.push('ui');
        }
        if (context.frameworks.includes('backend')) {
            context.changeTypes.push('api');
        }
        
        return context;
    } catch (error) {
        // Return default context if analysis fails
        return {
            fileTypes: [],
            frameworks: [],
            changeTypes: [],
            hasTests: false,
            hasConfig: false,
            hasDocs: false,
            language: 'unknown',
            scope: ''
        };
    }
}

/**
 * Generate enhanced prompt based on change context
 */
function generateContextAwarePrompt(stagedChanges: string, context: ChangeContext, professionalism: string): string {
    let prompt = '';
    
    // Base prompt
    prompt = `Generate a commit message for the following Git changes. `;
    
    // Add context-specific instructions
    if (context.changeTypes.length > 0) {
        const types = context.changeTypes.join(', ');
        prompt += `This appears to be a ${types} change. `;
    }
    
    if (context.language !== 'unknown') {
        prompt += `The changes are primarily in ${context.language}. `;
    }
    
    if (context.frameworks.length > 0) {
        prompt += `Frameworks involved: ${context.frameworks.join(', ')}. `;
    }
    
    if (context.scope) {
        prompt += `Focus area: ${context.scope}. `;
    }
    
    // Add professionalism-specific instructions
    switch (professionalism) {
        case 'simple':
            prompt += `Generate a simple, concise commit message (no prefixes, just action and description). `;
            break;
        case 'standard':
            prompt += `Use conventional commit format (type: description). `;
            if (context.hasTests) {
                prompt += `Use 'test:' for test changes. `;
            }
            if (context.hasDocs) {
                prompt += `Use 'docs:' for documentation changes. `;
            }
            if (context.hasConfig) {
                prompt += `Use 'chore:' for configuration changes. `;
            }
            break;
        case 'professional':
            prompt += `Use conventional commit format with scope (type(scope): description). `;
            if (context.scope) {
                prompt += `Suggested scope: ${context.scope}. `;
            }
            break;
        case 'enterprise':
            prompt += `Use full conventional commit format with body and footer if needed. Include breaking change indicators if applicable. `;
            break;
    }
    
    prompt += `Here are the changes:\\n\\n${stagedChanges}\\n\\nGenerate 3 different commit message options.`;
    
    return prompt;
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

            progress.report({ message: 'Analyzing changes...' });

            // Analyze the context of changes
            const changeContext = await analyzeChangeContext(workspaceFolder.uri.fsPath);

            progress.report({ message: 'Calling AI API...' });

            // Generate commit messages using AI with context
            const commitMessages = await generateCommitMessagesWithAI(apiKey, stagedChanges, changeContext);
            if (!commitMessages || commitMessages.length === 0) {
                vscode.window.showErrorMessage('Failed to generate commit messages. Please try again.');
                return;
            }

            progress.report({ message: 'Presenting options...' });

            // Enhanced commit message selection with history and favorites
            const commitMessageItems = commitMessages.map(msg => ({
                label: msg,
                description: '$(sparkle) AI Generated',
                detail: 'Click to use this message',
                message: msg
            }));

            // Add history and favorites options
            const history = await getCommitHistory(context);
            const favorites = await getFavoriteCommits(context);
            
            const quickPickItems: any[] = [...commitMessageItems];
            
            if (history.length > 0) {
                quickPickItems.push({
                    label: '$(history) Recent Messages',
                    description: `${history.length} items`,
                    detail: 'View your recent commit messages',
                    action: 'history'
                });
            }
            
            if (favorites.length > 0) {
                quickPickItems.push({
                    label: '$(star) Favorite Messages',
                    description: `${favorites.length} items`,
                    detail: 'View your favorite commit messages',
                    action: 'favorites'
                });
            }

            const selected = await vscode.window.showQuickPick(quickPickItems, {
                placeHolder: 'Select a commit message or browse history/favorites',
                title: 'AI Generated Commit Messages'
            });

            if (selected) {
                if (selected.action === 'history') {
                    await showCommitHistory(context);
                    return;
                } else if (selected.action === 'favorites') {
                    await showFavoriteCommits(context);
                    return;
                }
                
                // Handle AI generated message selection
                const config = vscode.workspace.getConfiguration('commitAi');
                const provider = config.get<string>('provider', 'openai');
                const model = config.get<string>('model', 'gpt-4o-mini');
                
                // Add to history
                await addToCommitHistory(context, selected.message, provider, model);
                
                // Ask if user wants to add to favorites or just use the message
                const action = await vscode.window.showQuickPick([
                    { label: '$(git-commit) Use Message', description: 'Insert this message and continue', action: 'use' },
                    { label: '$(star) Add to Favorites & Use', description: 'Save to favorites and insert message', action: 'favorite-and-use' },
                    { label: '$(copy) Copy to Clipboard', description: 'Copy message without inserting', action: 'copy' }
                ], {
                    placeHolder: 'How would you like to use this commit message?',
                    title: 'Commit Message Actions'
                });
                
                if (action?.action === 'use') {
                    await insertCommitMessage(selected.message);
                } else if (action?.action === 'favorite-and-use') {
                    await addToFavorites(context, selected.message, provider, model);
                    await insertCommitMessage(selected.message);
                } else if (action?.action === 'copy') {
                    await vscode.env.clipboard.writeText(selected.message);
                    vscode.window.showInformationMessage('Commit message copied to clipboard!');
                }
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
 * Generate commit messages using AI with context awareness
 * Sends the staged changes to AI and gets commit message suggestions
 */
async function generateCommitMessagesWithAI(apiKey: string, stagedChanges: string, context?: ChangeContext): Promise<string[]> {
    try {
        const config = vscode.workspace.getConfiguration('commitAi');
        const provider = config.get<string>('provider', 'openai');
        const model = config.get<string>('model', 'gpt-4o-mini');
        const temperature = config.get<number>('temperature', 0.7);
        const professionalism = config.get<string>('professionalism', 'standard');
        const apiEndpoint = config.get<string>('apiEndpoint', '');

        // Use context-aware prompt if context is provided
        let prompt: string;
        if (context) {
            prompt = generateContextAwarePrompt(stagedChanges, context, professionalism);
        } else {
            // Fallback to original prompt format
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

            prompt = `You are a Git commit message generator. Based on the following staged changes, generate exactly 3 different commit message suggestions.

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
        }

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
