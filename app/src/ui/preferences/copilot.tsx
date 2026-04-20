import * as React from 'react'
import { DialogContent } from '../dialog'
import { Select } from '../lib/select'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import type { ModelInfo } from '@github/copilot-sdk'
import {
  DefaultCopilotModel,
  type CopilotFeature,
  type CopilotModelSelections,
} from '../../lib/stores/copilot-store'
import {
  IBYOKProvider,
  encodeModelKey,
  parseModelKey,
} from '../../lib/copilot/byok'

const DefaultSelectionValue = '__default__'

interface ICopilotPreferencesProps {
  readonly selectedCopilotModels: CopilotModelSelections
  readonly copilotModels: ReadonlyArray<ModelInfo> | null
  readonly copilotAvailable: boolean
  readonly byokProviders: ReadonlyArray<IBYOKProvider>
  readonly showBYOKSettings: boolean
  readonly onSelectedCopilotModelChanged: (
    feature: CopilotFeature,
    model: string | null
  ) => void
  readonly onAddBYOKProvider: () => void
  readonly onEditBYOKProvider: (provider: IBYOKProvider) => void
  readonly onDeleteBYOKProvider: (provider: IBYOKProvider) => void
}

export class CopilotPreferences extends React.Component<ICopilotPreferencesProps> {
  private onCommitMessageModelChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = event.currentTarget.value
    this.props.onSelectedCopilotModelChanged(
      'commit-message-generation',
      value === DefaultSelectionValue ? null : value
    )
  }

  private onAddBYOKProviderClick = () => this.props.onAddBYOKProvider()

  private onEditBYOKProviderClick = (provider: IBYOKProvider) => () =>
    this.props.onEditBYOKProvider(provider)

  private onDeleteBYOKProviderClick = (provider: IBYOKProvider) => () =>
    this.props.onDeleteBYOKProvider(provider)

  public render() {
    const showBYOK = this.props.showBYOKSettings && this.props.copilotAvailable
    return (
      <DialogContent>
        <div className="copilot-section">
          <h2 id="copilot-model-heading">
            {__DARWIN__ ? 'Language Models' : 'Language models'}
          </h2>
          {this.renderModelPicker()}
        </div>
        {showBYOK && (
          <div className="copilot-section">
            <h2>{__DARWIN__ ? 'Custom Providers' : 'Custom providers'}</h2>
            {this.renderBYOKProviders()}
          </div>
        )}
      </DialogContent>
    )
  }

  private renderModelPicker() {
    if (!this.props.copilotAvailable) {
      return (
        <p>
          Sign in to a GitHub.com account in the Accounts tab to configure
          Copilot settings.
        </p>
      )
    }

    const { copilotModels, byokProviders, selectedCopilotModels } = this.props
    const rawSelection =
      selectedCopilotModels['commit-message-generation'] ?? null
    const value = this.resolveSelectionValue(rawSelection)

    if (copilotModels === null) {
      return <p>Loading available models…</p>
    }

    if (copilotModels.length === 0 && byokProviders.length === 0) {
      return <p>No models available. Check your Copilot subscription.</p>
    }

    return (
      <Select
        label={
          __DARWIN__ ? 'Commit Message Generation' : 'Commit message generation'
        }
        value={value}
        onChange={this.onCommitMessageModelChanged}
      >
        <option value={DefaultSelectionValue}>Default</option>
        {copilotModels.length > 0 && (
          <optgroup label="GitHub Copilot">
            {copilotModels.map(m => (
              <option
                key={m.id}
                value={encodeModelKey({ kind: 'copilot', modelId: m.id })}
              >
                {m.id === DefaultCopilotModel ? `${m.name} (default)` : m.name}
              </option>
            ))}
          </optgroup>
        )}
        {byokProviders.map(p => (
          <optgroup key={p.id} label={p.name}>
            {p.models.map(m => (
              <option
                key={m.id}
                value={encodeModelKey({
                  kind: 'byok',
                  providerId: p.id,
                  modelId: m.id,
                })}
              >
                {m.name}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    )
  }

  private resolveSelectionValue(raw: string | null): string {
    if (raw === null) {
      return DefaultSelectionValue
    }
    const key = parseModelKey(raw)
    if (key.kind === 'byok') {
      const provider = this.props.byokProviders.find(
        p => p.id === key.providerId
      )
      if (provider && provider.models.some(m => m.id === key.modelId)) {
        return encodeModelKey(key)
      }
      return DefaultSelectionValue
    }
    if (
      key.modelId !== '' &&
      this.props.copilotModels?.some(m => m.id === key.modelId)
    ) {
      return encodeModelKey({ kind: 'copilot', modelId: key.modelId })
    }
    return DefaultSelectionValue
  }

  private renderBYOKProviders() {
    return (
      <>
        {this.props.byokProviders.length === 0 ? (
          <p>
            Add a custom provider to use your own API keys with
            OpenAI-compatible endpoints, Azure, Anthropic, or local providers
            like Ollama.
          </p>
        ) : (
          <ul className="copilot-byok-providers">
            {this.props.byokProviders.map(p => (
              <li key={p.id}>
                <div className="copilot-byok-provider-info">
                  <span className="copilot-byok-provider-name">{p.name}</span>
                  <span className="copilot-byok-provider-meta">
                    {p.type} · {p.baseUrl}
                  </span>
                </div>
                <Button
                  onClick={this.onEditBYOKProviderClick(p)}
                  ariaLabel={`Edit ${p.name}`}
                >
                  Edit
                </Button>
                <Button
                  onClick={this.onDeleteBYOKProviderClick(p)}
                  ariaLabel={`Remove ${p.name}`}
                >
                  <Octicon symbol={octicons.trash} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button onClick={this.onAddBYOKProviderClick}>
          {__DARWIN__ ? 'Add Provider…' : 'Add provider…'}
        </Button>
      </>
    )
  }
}
