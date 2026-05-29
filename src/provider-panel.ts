import * as vscode from 'vscode';
import { createClientForModelListing, createOpenAIClient } from './api-utils';
import { createAnthropicClient } from './anthropic-utils';
import {
  ConfigKeys,
  ConfigurationManager,
  getConfigurationTargetForResource,
  normalizeString
} from './config';
import {
  PROVIDER_CATALOG,
  createDefaultProfileDraft,
  getProviderCatalogEntry,
  getProviderLabel,
  supportsModelListing,
  validateProviderProfile
} from './provider-registry';
import { createGeminiAPIClient } from './gemini-utils';
import { ProviderProfile, ProviderProfileInput, ResolvedProviderProfile } from './provider-types';

type PanelOptions = {
  resourceUri?: vscode.Uri;
  selectedProfileId?: string;
  preloadModelsForProfileId?: string;
};

type ProviderDraftPayload = {
  id?: string;
  name?: string;
  providerId?: string;
  model?: string;
  apiKey?: string;
  connection?: {
    baseURL?: string;
    endpoint?: string;
    deployment?: string;
    apiVersion?: string;
  };
  inference?: {
    temperature?: number | string;
  };
};

function getCurrentResourceUri(): vscode.Uri | undefined {
  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
  if (activeEditorUri) {
    return vscode.workspace.getWorkspaceFolder(activeEditorUri)?.uri ?? activeEditorUri;
  }

  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

function normalizeTemperature(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

function hydrateProfileInput(payload: ProviderDraftPayload): ProviderProfileInput {
  const providerId = normalizeString(payload.providerId);
  if (!providerId) {
    throw new Error('Provider is required.');
  }

  const defaults = createDefaultProfileDraft(providerId as any);
  const connection = stripUndefined({
    ...defaults.connection,
    baseURL: normalizeString(payload.connection?.baseURL) ?? defaults.connection.baseURL,
    endpoint: normalizeString(payload.connection?.endpoint),
    deployment: normalizeString(payload.connection?.deployment),
    apiVersion: normalizeString(payload.connection?.apiVersion)
  });
  const inference = stripUndefined({
    temperature: normalizeTemperature(payload.inference?.temperature) ?? defaults.inference.temperature
  });

  return {
    id: normalizeString(payload.id),
    name: normalizeString(payload.name) ?? '',
    providerId: providerId as ProviderProfile['providerId'],
    driverKind: defaults.driverKind,
    model: normalizeString(payload.model) ?? defaults.model ?? '',
    auth: {
      scheme: defaults.authScheme
    },
    connection: Object.keys(connection).length ? connection : undefined,
    inference: Object.keys(inference).length ? inference : undefined
  };
}

async function resolveDraftApiKey(
  configManager: ConfigurationManager,
  draft: ProviderDraftPayload,
  profile?: ProviderProfile
) {
  const typedApiKey = normalizeString(draft.apiKey);
  if (typedApiKey) {
    return typedApiKey;
  }

  if (profile) {
    return configManager.getProviderProfileApiKey(profile.id);
  }

  return undefined;
}

function getWorkspaceProfileId(configManager: ConfigurationManager, resourceUri?: vscode.Uri) {
  if (!resourceUri) {
    return undefined;
  }

  return configManager.getConfig<string>(
    ConfigKeys.ACTIVE_PROVIDER_PROFILE_ID,
    undefined,
    resourceUri
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class ProviderManagementPanel {
  private static currentPanel: ProviderManagementPanel | undefined;

  static createOrShow(
    context: vscode.ExtensionContext,
    options: PanelOptions = {}
  ): ProviderManagementPanel {
    const resourceUri = options.resourceUri ?? getCurrentResourceUri();

    if (this.currentPanel) {
      this.currentPanel.resourceUri = resourceUri;
      this.currentPanel.panel.reveal(vscode.ViewColumn.One);
      void this.currentPanel.refresh(options.selectedProfileId, options.preloadModelsForProfileId);
      return this.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'commitflow.providerProfiles',
      'CommitFlow Provider Profiles',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.currentPanel = new ProviderManagementPanel(context, panel, resourceUri);
    void this.currentPanel.refresh(options.selectedProfileId, options.preloadModelsForProfileId);
    return this.currentPanel;
  }

  private readonly configManager: ConfigurationManager;
  private readonly panel: vscode.WebviewPanel;
  private resourceUri?: vscode.Uri;
  private selectedProfileId?: string;
  private availableModels: string[] = [];

  private constructor(
    private readonly context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel,
    resourceUri?: vscode.Uri
  ) {
    this.configManager = ConfigurationManager.getInstance();
    this.panel = panel;
    this.resourceUri = resourceUri;
    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(() => {
      if (ProviderManagementPanel.currentPanel === this) {
        ProviderManagementPanel.currentPanel = undefined;
      }
    });

    this.panel.webview.onDidReceiveMessage(async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        vscode.window.showErrorMessage(
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  }

  private async handleMessage(message: any) {
    switch (message?.type) {
      case 'ready':
        await this.refresh(message.selectedProfileId);
        return;
      case 'save-profile':
        await this.saveProfile(message.payload);
        return;
      case 'delete-profile':
        await this.deleteProfile(String(message.profileId));
        return;
      case 'duplicate-profile':
        await this.duplicateProfile(String(message.profileId));
        return;
      case 'set-active':
        await this.setActiveProfile(String(message.profileId));
        return;
      case 'set-workspace':
        await this.setWorkspaceProfile(String(message.profileId));
        return;
      case 'clear-workspace':
        await this.clearWorkspaceProfile();
        return;
      case 'load-models':
        await this.loadModels(String(message.profileId));
        return;
      case 'test-connection':
        await this.testConnection(message.payload);
        return;
    }
  }

  private async refresh(selectedProfileId?: string, preloadModelsForProfileId?: string) {
    const profiles = this.configManager.getProviderProfiles();
    this.selectedProfileId =
      selectedProfileId ??
      this.selectedProfileId ??
      profiles[0]?.id;

    if (preloadModelsForProfileId) {
      this.selectedProfileId = preloadModelsForProfileId;
      await this.loadModels(preloadModelsForProfileId, { silent: true });
    }

    const workspaceProfileId = getWorkspaceProfileId(this.configManager, this.resourceUri);
    const activeProfileId = this.configManager.getActiveProviderProfileId(this.resourceUri);
    const selectedProfile =
      profiles.find((profile) => profile.id === this.selectedProfileId) ?? profiles[0];

    this.selectedProfileId = selectedProfile?.id;

    const profileSummaries = await Promise.all(
      profiles.map(async (profile) => ({
        id: profile.id,
        name: profile.name,
        providerId: profile.providerId,
        providerLabel: getProviderLabel(profile.providerId),
        model: profile.model,
        driverKind: profile.driverKind,
        connection: profile.connection,
        inference: profile.inference,
        hasApiKey:
          profile.auth.scheme === 'none'
            ? false
            : Boolean(await this.configManager.getProviderProfileApiKey(profile.id)),
        supportsModelListing: supportsModelListing(profile)
      }))
    );

    this.panel.webview.postMessage({
      type: 'state',
      payload: {
        profiles: profileSummaries,
        selectedProfileId: this.selectedProfileId,
        activeProfileId,
        workspaceProfileId,
        resourceLabel: this.resourceUri?.fsPath,
        availableModels: this.availableModels,
        catalog: PROVIDER_CATALOG.map((entry) => ({
          id: entry.id,
          label: entry.label,
          description: entry.description,
          group: entry.group,
          driverKind: entry.driverKind,
          authScheme: entry.authScheme,
          supportsModelListing: entry.supportsModelListing,
          defaults: createDefaultProfileDraft(entry.id),
          requiredFields: entry.requiredFields
        }))
      }
    });
  }

  private async saveProfile(payload: ProviderDraftPayload) {
    const profileInput = hydrateProfileInput(payload);
    const errors = validateProviderProfile({
      ...profileInput,
      id: profileInput.id ?? 'draft'
    } as ProviderProfile);
    if (errors.length) {
      throw new Error(errors[0]);
    }

    if (profileInput.auth.scheme !== 'none') {
      const existingProfile = profileInput.id
        ? this.configManager.getProviderProfiles().find((item) => item.id === profileInput.id)
        : undefined;
      const apiKey = await resolveDraftApiKey(this.configManager, payload, existingProfile);
      if (!apiKey) {
        throw new Error('API key is required for this provider.');
      }
    }

    const savedProfile = await this.configManager.upsertProviderProfile(
      profileInput,
      normalizeString(payload.apiKey),
      profileInput.id
    );

    if (!this.configManager.getActiveProviderProfileId()) {
      await this.configManager.setActiveProviderProfileId(
        savedProfile.id,
        vscode.ConfigurationTarget.Global
      );
    }

    this.selectedProfileId = savedProfile.id;
    await vscode.commands.executeCommand('commitflow.refreshStatusBar');
    vscode.window.showInformationMessage(`Provider profile "${savedProfile.name}" saved.`);
    await this.refresh(savedProfile.id);
  }

  private async deleteProfile(profileId: string) {
    const profile = this.configManager.getProviderProfiles().find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    await this.configManager.deleteProviderProfile(profileId);
    await vscode.commands.executeCommand('commitflow.refreshStatusBar');
    this.availableModels = [];
    this.selectedProfileId = this.configManager.getProviderProfiles()[0]?.id;
    vscode.window.showInformationMessage(`Provider profile "${profile.name}" deleted.`);
    await this.refresh(this.selectedProfileId);
  }

  private async duplicateProfile(profileId: string) {
    const profile = this.configManager.getProviderProfiles().find((item) => item.id === profileId);
    if (!profile) {
      throw new Error('Provider profile not found.');
    }

    const apiKey = await this.configManager.getProviderProfileApiKey(profile.id);
    const copiedProfile = await this.configManager.upsertProviderProfile(
      {
        ...profile,
        id: undefined,
        name: `${profile.name} Copy`
      },
      apiKey
    );

    this.selectedProfileId = copiedProfile.id;
    await vscode.commands.executeCommand('commitflow.refreshStatusBar');
    vscode.window.showInformationMessage(`Provider profile "${copiedProfile.name}" copied.`);
    await this.refresh(copiedProfile.id);
  }

  private async setActiveProfile(profileId: string) {
    await this.configManager.setActiveProviderProfileId(
      profileId,
      vscode.ConfigurationTarget.Global
    );
    await vscode.commands.executeCommand('commitflow.refreshStatusBar');
    await this.refresh(profileId);
  }

  private async setWorkspaceProfile(profileId: string) {
    if (!this.resourceUri) {
      throw new Error('No active workspace is available for repository override.');
    }

    await this.configManager.setActiveProviderProfileId(
      profileId,
      getConfigurationTargetForResource(this.resourceUri),
      this.resourceUri
    );
    await vscode.commands.executeCommand('commitflow.refreshStatusBar');
    await this.refresh(profileId);
  }

  private async clearWorkspaceProfile() {
    if (!this.resourceUri) {
      return;
    }

    await this.configManager.setActiveProviderProfileId(
      undefined,
      getConfigurationTargetForResource(this.resourceUri),
      this.resourceUri
    );
    await vscode.commands.executeCommand('commitflow.refreshStatusBar');
    await this.refresh(this.selectedProfileId);
  }

  private async loadModels(profileId: string, options: { silent?: boolean } = {}) {
    const profile = this.configManager.getProviderProfiles().find((item) => item.id === profileId);
    if (!profile) {
      throw new Error('Provider profile not found.');
    }

    if (!supportsModelListing(profile)) {
      throw new Error(`Provider "${profile.name}" does not support model listing.`);
    }

    this.availableModels = await this.configManager.getAvailableModelsForProfile(profile.id);
    this.selectedProfileId = profile.id;
    if (!options.silent) {
      vscode.window.showInformationMessage(`Loaded ${this.availableModels.length} models.`);
    }
    await this.refresh(profile.id);
  }

  private async testConnection(payload: ProviderDraftPayload) {
    const profileInput = hydrateProfileInput(payload);
    const profile: ProviderProfile = {
      ...profileInput,
      id: profileInput.id ?? 'draft'
    };
    const errors = validateProviderProfile(profile);
    if (errors.length) {
      throw new Error(errors[0]);
    }

    const existingProfile = profileInput.id
      ? this.configManager.getProviderProfiles().find((item) => item.id === profileInput.id)
      : undefined;
    const apiKey = profile.auth.scheme === 'none'
      ? undefined
      : await resolveDraftApiKey(this.configManager, payload, existingProfile);

    if (profile.auth.scheme !== 'none' && !apiKey) {
      throw new Error('API key is required for this provider.');
    }

    const resolvedProfile: ResolvedProviderProfile = { profile, apiKey };

    switch (profile.driverKind) {
      case 'openai':
        await createClientForModelListing(profile, apiKey).models.list();
        break;
      case 'azure-openai':
        await createOpenAIClient(profile, apiKey).chat.completions.create({
          model: profile.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1
        });
        break;
      case 'anthropic':
        await createAnthropicClient(resolvedProfile).messages.create({
          model: profile.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }]
        });
        break;
      case 'gemini':
        await createGeminiAPIClient(resolvedProfile).models.generateContent({
          model: profile.model,
          contents: 'ping'
        });
        break;
    }

    vscode.window.showInformationMessage(`Connection to "${profile.name}" succeeded.`);
  }

  private getHtml() {
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.panel.webview.cspSource} https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CommitFlow Provider Profiles</title>
  <style>
    :root {
      --bg: #f4efe7;
      --panel: #fbf8f3;
      --ink: #1d1a17;
      --muted: #6e6258;
      --line: #d8c8b4;
      --accent: #9b3d20;
      --accent-soft: #f3d6c8;
      --good: #0d6b4c;
      --shadow: 0 18px 50px rgba(73, 44, 26, 0.12);
      --radius: 18px;
      --mono: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
      --sans: "Avenir Next", "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--sans);
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(255,255,255,0.8), transparent 36%),
        linear-gradient(135deg, #efe3d2 0%, #f8f4ed 55%, #eee0d6 100%);
    }
    .app {
      display: grid;
      grid-template-columns: 320px 1fr;
      min-height: 100vh;
      gap: 20px;
      padding: 20px;
    }
    .sidebar, .main {
      background: rgba(251, 248, 243, 0.92);
      border: 1px solid rgba(216, 200, 180, 0.8);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
    .sidebar {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .sidebar-header, .main-header {
      padding: 18px 20px;
      border-bottom: 1px solid var(--line);
    }
    .sidebar-header h1, .main-header h2 {
      margin: 0;
      font-size: 18px;
    }
    .sidebar-header p, .main-header p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .sidebar-actions, .action-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .sidebar-actions {
      padding: 14px 20px;
      border-bottom: 1px solid var(--line);
    }
    .profile-list {
      padding: 10px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .profile-item {
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 14px;
      padding: 12px;
      cursor: pointer;
      text-align: left;
    }
    .profile-item.active {
      border-color: var(--accent);
      background: linear-gradient(180deg, #fffaf5 0%, #f7eadf 100%);
    }
    .profile-item strong {
      display: block;
      font-size: 14px;
    }
    .profile-item span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-top: 3px;
    }
    .badges {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .badge {
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      background: #efe4d8;
      color: var(--muted);
    }
    .badge.accent {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .badge.good {
      background: #dcefe6;
      color: var(--good);
    }
    button {
      border: 0;
      border-radius: 999px;
      padding: 10px 14px;
      font: inherit;
      cursor: pointer;
      background: #ede0d1;
      color: var(--ink);
    }
    button.primary {
      background: var(--accent);
      color: #fff;
    }
    button.ghost {
      background: transparent;
      border: 1px solid var(--line);
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .main {
      overflow: hidden;
    }
    .main-content {
      padding: 20px;
      display: grid;
      gap: 18px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .field-hint {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.45;
    }
    .field.full {
      grid-column: 1 / -1;
    }
    label {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    input, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px 14px;
      font: inherit;
      background: #fff;
      color: var(--ink);
    }
    .section {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      background: rgba(255,255,255,0.75);
    }
    .section h3 {
      margin: 0 0 6px;
      font-size: 14px;
    }
    .section p {
      margin: 0 0 14px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .model-list {
      margin-top: 10px;
      display: none;
      gap: 8px;
      flex-wrap: wrap;
    }
    .model-pill {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 6px 10px;
      font-family: var(--mono);
      font-size: 11px;
      cursor: pointer;
      background: #fff;
    }
    .empty {
      padding: 40px 20px;
      text-align: center;
      color: var(--muted);
    }
    dialog {
      border: none;
      border-radius: 22px;
      padding: 0;
      width: min(860px, calc(100vw - 40px));
      box-shadow: var(--shadow);
      background: #fffaf4;
    }
    dialog::backdrop {
      background: rgba(20, 15, 11, 0.38);
    }
    .catalog {
      padding: 20px;
      display: grid;
      gap: 16px;
    }
    .catalog-group h4 {
      margin: 0 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 11px;
      color: var(--muted);
    }
    .catalog-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
      gap: 10px;
    }
    .catalog-item {
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: #fff;
      cursor: pointer;
    }
    .catalog-item strong {
      display: block;
      margin-bottom: 6px;
    }
    .catalog-item span {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.5;
      display: block;
    }
    @media (max-width: 960px) {
      .app {
        grid-template-columns: 1fr;
      }
      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>Provider Profiles</h1>
        <p>Specific provider first, runtime driver behind it. Hosted, local, and custom endpoints all share one manager.</p>
      </div>
      <div class="sidebar-actions">
        <button class="primary" id="newProfileButton">Add Provider</button>
        <button class="ghost" id="duplicateProfileButton">Duplicate</button>
        <button class="ghost" id="deleteProfileButton">Delete</button>
      </div>
      <div class="profile-list" id="profileList"></div>
    </aside>
    <main class="main">
      <div class="main-header">
        <h2 id="formTitle">Provider Details</h2>
        <p id="formSubtitle">Choose a provider and keep connection details separate from generation settings.</p>
      </div>
      <div class="main-content" id="mainContent"></div>
    </main>
  </div>

  <dialog id="catalogDialog">
    <div class="catalog">
      <div class="action-row" style="justify-content: space-between; align-items: center;">
        <div>
          <strong>Add Provider</strong>
          <p style="margin: 6px 0 0; color: var(--muted);">Pick a concrete provider preset. You can still adjust the details afterwards.</p>
        </div>
        <button class="ghost" id="closeCatalogButton">Close</button>
      </div>
      <div id="catalogBody"></div>
    </div>
  </dialog>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = {
      profiles: [],
      catalog: [],
      selectedProfileId: undefined,
      activeProfileId: undefined,
      workspaceProfileId: undefined,
      resourceLabel: undefined,
      availableModels: []
    };

    const els = {
      profileList: document.getElementById('profileList'),
      mainContent: document.getElementById('mainContent'),
      formTitle: document.getElementById('formTitle'),
      formSubtitle: document.getElementById('formSubtitle'),
      newProfileButton: document.getElementById('newProfileButton'),
      duplicateProfileButton: document.getElementById('duplicateProfileButton'),
      deleteProfileButton: document.getElementById('deleteProfileButton'),
      catalogDialog: document.getElementById('catalogDialog'),
      catalogBody: document.getElementById('catalogBody'),
      closeCatalogButton: document.getElementById('closeCatalogButton')
    };

    let draft = null;

    function getCatalogEntry(providerId) {
      return state.catalog.find((entry) => entry.id === providerId);
    }

    function getSelectedProfile() {
      return state.profiles.find((profile) => profile.id === state.selectedProfileId);
    }

    function defaultDraftFromCatalog(providerId) {
      const entry = getCatalogEntry(providerId);
      if (!entry) {
        return null;
      }

      return {
        id: undefined,
        name: entry.label,
        providerId: entry.id,
        model: entry.defaults.model || '',
        apiKey: '',
        connection: {
          baseURL: entry.defaults.connection.baseURL || '',
          endpoint: '',
          deployment: '',
          apiVersion: ''
        },
        inference: {
          temperature: entry.defaults.inference.temperature
        }
      };
    }

    function draftFromProfile(profile) {
      return {
        id: profile.id,
        name: profile.name,
        providerId: profile.providerId,
        model: profile.model,
        apiKey: '',
        connection: {
          baseURL: profile.connection && profile.connection.baseURL || '',
          endpoint: profile.connection && profile.connection.endpoint || '',
          deployment: profile.connection && profile.connection.deployment || '',
          apiVersion: profile.connection && profile.connection.apiVersion || ''
        },
        inference: {
          temperature: profile.inference && profile.inference.temperature !== undefined
            ? profile.inference.temperature
            : 0.7
        }
      };
    }

    function initializeDraft() {
      if (draft) {
        return;
      }

      const selected = getSelectedProfile();
      draft = selected ? draftFromProfile(selected) : defaultDraftFromCatalog('openai');
    }

    function renderProfiles() {
      els.profileList.innerHTML = '';
      if (!state.profiles.length) {
        els.profileList.innerHTML = '<div class="empty">No provider profiles yet. Add one from the catalog to get started.</div>';
        return;
      }

      state.profiles.forEach((profile) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'profile-item' + (profile.id === state.selectedProfileId ? ' active' : '');
        button.innerHTML = '<strong>' + escapeHtml(profile.name) + '</strong>' +
          '<span>' + escapeHtml(profile.providerLabel) + '</span>' +
          '<span>' + escapeHtml(profile.model || 'No model selected') + '</span>';

        const badgeWrap = document.createElement('div');
        badgeWrap.className = 'badges';
        if (profile.id === state.activeProfileId) {
          const activeBadge = document.createElement('span');
          activeBadge.className = 'badge accent';
          activeBadge.textContent = 'Global Active';
          badgeWrap.appendChild(activeBadge);
        }
        if (profile.id === state.workspaceProfileId) {
          const workspaceBadge = document.createElement('span');
          workspaceBadge.className = 'badge good';
          workspaceBadge.textContent = 'Workspace Override';
          badgeWrap.appendChild(workspaceBadge);
        }
        if (!profile.hasApiKey && profile.driverKind !== 'openai' && profile.providerId !== 'ollama' && profile.providerId !== 'lmstudio') {
          const keyBadge = document.createElement('span');
          keyBadge.className = 'badge';
          keyBadge.textContent = 'Missing key';
          badgeWrap.appendChild(keyBadge);
        }
        button.appendChild(badgeWrap);
        button.addEventListener('click', () => {
          state.selectedProfileId = profile.id;
          draft = draftFromProfile(profile);
          render();
        });
        els.profileList.appendChild(button);
      });
    }

    function renderCatalog() {
      const groups = ['Hosted', 'Local', 'Custom'];
      els.catalogBody.innerHTML = groups.map((group) => {
        const entries = state.catalog.filter((entry) => entry.group === group);
        if (!entries.length) {
          return '';
        }
        return '<section class="catalog-group">' +
          '<h4>' + group + '</h4>' +
          '<div class="catalog-grid">' +
          entries.map((entry) =>
            '<button type="button" class="catalog-item" data-provider-id="' + escapeHtml(entry.id) + '">' +
              '<strong>' + escapeHtml(entry.label) + '</strong>' +
              '<span>' + escapeHtml(entry.description) + '</span>' +
            '</button>'
          ).join('') +
          '</div>' +
        '</section>';
      }).join('');

      Array.from(els.catalogBody.querySelectorAll('[data-provider-id]')).forEach((button) => {
        button.addEventListener('click', () => {
          const providerId = button.getAttribute('data-provider-id');
          draft = defaultDraftFromCatalog(providerId);
          state.selectedProfileId = undefined;
          render();
          els.catalogDialog.close();
        });
      });
    }

    function field(label, id, value, options = {}) {
      const type = options.type || 'text';
      const placeholder = options.placeholder || '';
      const full = options.full ? ' full' : '';
      const hint = options.hint || '';
      return '<div class="field' + full + '">' +
        '<label for="' + id + '">' + label + '</label>' +
        '<input id="' + id + '" type="' + type + '" value="' + escapeHtml(String(value || '')) + '" placeholder="' + escapeHtml(placeholder) + '" />' +
        (hint ? '<span class="field-hint">' + escapeHtml(hint) + '</span>' : '') +
      '</div>';
    }

    function selectField(label, id, value, groups) {
      return '<div class="field full">' +
        '<label for="' + id + '">' + label + '</label>' +
        '<select id="' + id + '">' +
        groups.map((group) =>
          '<optgroup label="' + escapeHtml(group.group) + '">' +
          group.entries.map((entry) =>
            '<option value="' + escapeHtml(entry.id) + '"' + (entry.id === value ? ' selected' : '') + '>' +
              escapeHtml(entry.label) +
            '</option>'
          ).join('') +
          '</optgroup>'
        ).join('') +
        '</select>' +
      '</div>';
    }

    function renderForm() {
      initializeDraft();
      const providerEntry = getCatalogEntry(draft.providerId);
      const selected = getSelectedProfile();
      const groupedCatalog = ['Hosted', 'Local', 'Custom'].map((group) => ({
        group,
        entries: state.catalog.filter((entry) => entry.group === group)
      })).filter((group) => group.entries.length > 0);

      els.formTitle.textContent = draft.name || providerEntry.label;
      els.formSubtitle.textContent = providerEntry.description + (state.resourceLabel ? ' Workspace target: ' + state.resourceLabel : '');

      const showBaseUrl = draft.providerId !== 'azure-openai';
      const showEndpoint = draft.providerId === 'azure-openai';
      const showApiVersion = draft.providerId === 'azure-openai';
      const showDeployment = draft.providerId === 'azure-openai';
      const showApiKey = providerEntry.authScheme !== 'none';
      const baseUrlHint =
        draft.providerId === 'openai'
          ? 'Leave blank to use the OpenAI SDK default endpoint.'
          : draft.providerId === 'anthropic'
            ? 'Leave blank to use the Anthropic SDK default endpoint.'
            : draft.providerId === 'gemini'
              ? 'Leave blank to use the Google GenAI SDK default Gemini endpoint.'
              : draft.providerId === 'openai-compatible'
                ? 'Required. Enter the full base URL for your compatible endpoint.'
                : 'Prefilled with the provider default endpoint. Change it only if you use a proxy or custom gateway.';
      const loadModelsDisabled = !selected || !selected.supportsModelListing;
      const clearWorkspaceDisabled = !state.workspaceProfileId;

      els.mainContent.innerHTML = [
        '<section class="section">',
          '<h3>Identity</h3>',
          '<p>Choose the concrete provider first. Runtime driver and auth scheme follow automatically from the provider registry.</p>',
          '<div class="grid">',
            field('Profile Name', 'profileName', draft.name, { full: true, placeholder: 'My provider profile' }),
            selectField('Provider', 'providerId', draft.providerId, groupedCatalog),
            field('Model', 'model', draft.model, {
              placeholder:
                providerEntry.recommendedModel ||
                (draft.providerId === 'azure-openai' ? 'Deployment or model name' : 'Model name')
            }),
          '</div>',
        '</section>',
        '<section class="section">',
          '<h3>Credentials & Connection</h3>',
          '<p>Provider-specific connection details stay separate from generation settings.</p>',
          '<div class="grid">',
            showApiKey ? field('API Key', 'apiKey', '', { type: 'password', placeholder: selected && selected.hasApiKey ? 'Leave blank to keep the stored key' : 'Enter API key' }) : '',
            showBaseUrl ? field('Base URL', 'baseURL', draft.connection.baseURL, {
              full: !showApiKey,
              placeholder: 'https://...',
              hint: baseUrlHint
            }) : '',
            showEndpoint ? field('Endpoint', 'endpoint', draft.connection.endpoint, { placeholder: 'https://your-resource.openai.azure.com' }) : '',
            showDeployment ? field('Deployment', 'deployment', draft.connection.deployment, { placeholder: providerEntry.recommendedModel || 'Deployment name' }) : '',
            showApiVersion ? field('API Version', 'apiVersion', draft.connection.apiVersion, { placeholder: '2024-10-21' }) : '',
          '</div>',
        '</section>',
        '<section class="section">',
          '<h3>Inference</h3>',
          '<p>These settings affect generation behavior, not connectivity.</p>',
          '<div class="grid">',
            field('Temperature', 'temperature', draft.inference.temperature, { type: 'number', placeholder: '0.7' }),
          '</div>',
        '</section>',
        '<section class="section">',
          '<h3>Actions</h3>',
          '<p>Save the profile, validate the connection, and manage activation or workspace override from one place.</p>',
          '<div class="action-row">',
            '<button type="button" class="primary" id="saveButton">Save Profile</button>',
            '<button type="button" class="ghost" id="testButton">Test Connection</button>',
            '<button type="button" class="ghost" id="loadModelsButton"' + (loadModelsDisabled ? ' disabled' : '') + '>Load Models</button>',
            '<button type="button" class="ghost" id="setActiveButton"' + (!selected ? ' disabled' : '') + '>Set Active</button>',
            '<button type="button" class="ghost" id="setWorkspaceButton"' + (!selected ? ' disabled' : '') + '>Set for Workspace</button>',
            '<button type="button" class="ghost" id="clearWorkspaceButton"' + (clearWorkspaceDisabled ? ' disabled' : '') + '>Clear Workspace Override</button>',
          '</div>',
          '<div class="model-list" id="modelList"></div>',
        '</section>'
      ].join('');

      document.getElementById('providerId').addEventListener('change', (event) => {
        const currentProviderEntry = getCatalogEntry(draft.providerId);
        const nextProviderId = event.target.value;
        const nextDraft = defaultDraftFromCatalog(nextProviderId);
        const keepCustomName =
          draft.name &&
          draft.name !== currentProviderEntry.label;
        const keepCustomModel =
          draft.model &&
          draft.model !== currentProviderEntry.recommendedModel;

        draft = {
          ...nextDraft,
          id: draft.id,
          name: keepCustomName ? draft.name : nextDraft.name,
          model: keepCustomModel ? draft.model : nextDraft.model,
          inference: {
            temperature:
              draft.inference && draft.inference.temperature !== undefined
                ? draft.inference.temperature
                : nextDraft.inference.temperature
          }
        };
        render();
      });

      document.getElementById('saveButton').addEventListener('click', () => {
        vscode.postMessage({ type: 'save-profile', payload: collectDraft() });
      });
      document.getElementById('testButton').addEventListener('click', () => {
        vscode.postMessage({ type: 'test-connection', payload: collectDraft() });
      });
      document.getElementById('loadModelsButton').addEventListener('click', () => {
        if (selected) {
          vscode.postMessage({ type: 'load-models', profileId: selected.id });
        }
      });
      document.getElementById('setActiveButton').addEventListener('click', () => {
        if (selected) {
          vscode.postMessage({ type: 'set-active', profileId: selected.id });
        }
      });
      document.getElementById('setWorkspaceButton').addEventListener('click', () => {
        if (selected) {
          vscode.postMessage({ type: 'set-workspace', profileId: selected.id });
        }
      });
      document.getElementById('clearWorkspaceButton').addEventListener('click', () => {
        vscode.postMessage({ type: 'clear-workspace' });
      });

      renderModelList();
    }

    function renderModelList() {
      const modelList = document.getElementById('modelList');
      if (!modelList) {
        return;
      }

      if (!state.availableModels.length) {
        modelList.style.display = 'none';
        modelList.innerHTML = '';
        return;
      }

      modelList.style.display = 'flex';
      modelList.innerHTML = state.availableModels.map((model) =>
        '<button type="button" class="model-pill" data-model="' + escapeHtml(model) + '">' + escapeHtml(model) + '</button>'
      ).join('');

      Array.from(modelList.querySelectorAll('[data-model]')).forEach((button) => {
        button.addEventListener('click', () => {
          const nextModel = button.getAttribute('data-model');
          const modelInput = document.getElementById('model');
          modelInput.value = nextModel;
        });
      });
    }

    function collectDraft() {
      return {
        id: draft.id,
        name: document.getElementById('profileName').value,
        providerId: document.getElementById('providerId').value,
        model: document.getElementById('model').value,
        apiKey: document.getElementById('apiKey') ? document.getElementById('apiKey').value : '',
        connection: {
          baseURL: document.getElementById('baseURL') ? document.getElementById('baseURL').value : '',
          endpoint: document.getElementById('endpoint') ? document.getElementById('endpoint').value : '',
          deployment: document.getElementById('deployment') ? document.getElementById('deployment').value : '',
          apiVersion: document.getElementById('apiVersion') ? document.getElementById('apiVersion').value : ''
        },
        inference: {
          temperature: document.getElementById('temperature').value
        }
      };
    }

    function render() {
      renderProfiles();
      renderCatalog();
      renderForm();
      els.duplicateProfileButton.disabled = !getSelectedProfile();
      els.deleteProfileButton.disabled = !getSelectedProfile();
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type !== 'state') {
        return;
      }

      Object.assign(state, message.payload);
      const selected = getSelectedProfile();
      draft =
        selected && (!draft || draft.id === undefined || draft.id === selected.id)
          ? draftFromProfile(selected)
          : draft;
      render();
    });

    els.newProfileButton.addEventListener('click', () => els.catalogDialog.showModal());
    els.closeCatalogButton.addEventListener('click', () => els.catalogDialog.close());
    els.duplicateProfileButton.addEventListener('click', () => {
      const selected = getSelectedProfile();
      if (selected) {
        vscode.postMessage({ type: 'duplicate-profile', profileId: selected.id });
      }
    });
    els.deleteProfileButton.addEventListener('click', () => {
      const selected = getSelectedProfile();
      if (selected && confirm('Delete provider profile "' + selected.name + '"?')) {
        vscode.postMessage({ type: 'delete-profile', profileId: selected.id });
      }
    });

    vscode.postMessage({ type: 'ready' });

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  </script>
</body>
</html>`;
  }
}
