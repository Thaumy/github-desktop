import * as React from 'react'
import { UiView } from '../ui-view'
import { Button } from '../lib/button'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  WelcomeLeftTopImageUri,
  WelcomeLeftBottomImageUri,
} from '../welcome/welcome'

interface INoRepositoriesProps {
  readonly onCreate: () => void
  readonly onClone: (cloneURL?: string) => void
  readonly onAdd: () => void
}

/** The local Git repository start screen. */
export class NoRepositoriesView extends React.Component<INoRepositoriesProps> {
  public render() {
    return (
      <UiView id="no-repositories">
        <section aria-label="Let's get started!">
          <header>
            <h1>Let's get started!</h1>
            <p>Create, clone, or add a Git repository to get started</p>
          </header>

          <div className="content">{this.renderGetStartedActions()}</div>

          <img
            className="no-repositories-graphic-top"
            src={WelcomeLeftTopImageUri}
            alt=""
          />
          <img
            className="no-repositories-graphic-bottom"
            src={WelcomeLeftBottomImageUri}
            alt=""
          />
        </section>
      </UiView>
    )
  }

  // Note: this wrapper is necessary in order to ensure
  // `onClone` does not get passed a click event
  // and accidentally interpret that as a url
  // See https://github.com/desktop/desktop/issues/8394
  private onShowClone = () => this.props.onClone()

  private renderButtonGroupButton(
    symbol: OcticonSymbol,
    title: string,
    onClick: () => void,
    type?: 'submit',
    autoFocus?: boolean
  ) {
    return (
      <span>
        <Button onClick={onClick} type={type} autoFocus={autoFocus}>
          <Octicon symbol={symbol} />
          <div>{title}</div>
        </Button>
      </span>
    )
  }

  private renderCloneButton() {
    return this.renderButtonGroupButton(
      octicons.repoClone,
      __DARWIN__
        ? 'Clone a Repository from the Internet…'
        : 'Clone a repository from the Internet…',
      this.onShowClone,
      undefined,
      true
    )
  }

  private renderCreateRepositoryButton() {
    return this.renderButtonGroupButton(
      octicons.plus,
      __DARWIN__
        ? 'Create a New Repository on your Local Drive…'
        : 'Create a New Repository on your local drive…',
      this.props.onCreate
    )
  }

  private renderAddExistingRepositoryButton() {
    return this.renderButtonGroupButton(
      octicons.fileDirectory,
      __DARWIN__
        ? 'Add an Existing Repository from your Local Drive…'
        : 'Add an Existing Repository from your local drive…',
      this.props.onAdd
    )
  }

  private renderGetStartedActions() {
    return (
      <div className="content-pane">
        <div className="button-group">
          {this.renderCloneButton()}
          {this.renderCreateRepositoryButton()}
          {this.renderAddExistingRepositoryButton()}
        </div>

        <div className="drag-drop-info">
          <Octicon symbol={octicons.lightBulb} />
          <div>
            <strong>ProTip!</strong> You can drag &amp; drop an existing
            repository folder here to add it to Desktop
          </div>
        </div>
      </div>
    )
  }
}
