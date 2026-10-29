import * as React from 'react'
import classNames from 'classnames'

import { Dispatcher } from '../dispatcher'
import { encodePathAsUrl } from '../../lib/path'
import { ConfigureGit } from './configure-git'
import { UiView } from '../ui-view'
import { getGlobalConfigValue } from '../../lib/git'

/** The steps along the Welcome flow. */
export enum WelcomeStep {
  Start = 'Start',
  SignInToDotComWithBrowser = 'SignInToDotComWithBrowser',
  SignInToEnterprise = 'SignInToEnterprise',
  ConfigureGit = 'ConfigureGit',
}

interface IWelcomeProps {
  readonly dispatcher: Dispatcher
}

interface IWelcomeState {
  /**
   * Whether the welcome wizard is terminating. Used
   * in order to delay the actual dismissal of the view
   * such that the exit animations (defined in css) have
   * time to run to completion.
   */
  readonly exiting: boolean

  readonly globalUserName?: string
  readonly globalUserEmail?: string
}

// Note that we're reusing the welcome illustrations in the crash process, any
// changes to these will have to be reflected in the crash process as well.
const WelcomeRightImageUri = encodePathAsUrl(
  __dirname,
  'static/welcome-illustration-right.svg'
)
export const WelcomeLeftTopImageUri = encodePathAsUrl(
  __dirname,
  'static/welcome-illustration-left-top.svg'
)
export const WelcomeLeftBottomImageUri = encodePathAsUrl(
  __dirname,
  'static/welcome-illustration-left-bottom.svg'
)

/** The Welcome flow. */
export class Welcome extends React.Component<IWelcomeProps, IWelcomeState> {
  public constructor(props: IWelcomeProps) {
    super(props)

    this.state = {
      exiting: false,
    }
  }

  public componentDidMount() {
    this.props.dispatcher.recordWelcomeWizardInitiated()
    this.refreshGlobalGitAuthorInfo()
  }

  public refreshGlobalGitAuthorInfo() {
    Promise.all([
      getGlobalConfigValue('user.name'),
      getGlobalConfigValue('user.email'),
    ])
      .then(([globalUserName, globalUserEmail]) => {
        this.setState({
          globalUserName: globalUserName ?? undefined,
          globalUserEmail: globalUserEmail ?? undefined,
        })
      })
      .catch(e => {
        log.error(`[Welcome] error while fetching global user config`, e)
      })
  }

  private getComponentForCurrentStep() {
    return (
      <ConfigureGit
        advance={this.advanceToStep}
        accounts={[]}
        done={this.done}
        globalUserName={this.state.globalUserName}
        globalUserEmail={this.state.globalUserEmail}
      />
    )
  }

  private advanceToStep = (_step: WelcomeStep) => this.done()

  private done = () => {
    // Add a delay so that the exit animations (defined in css)
    // have time to run to completion.
    this.setState({ exiting: true }, () => {
      setTimeout(() => {
        this.props.dispatcher.endWelcomeFlow()
      }, 250)
    })
  }

  public render() {
    const className = classNames({
      exiting: this.state.exiting,
    })
    return (
      <UiView id="welcome" className={className}>
        <div className="welcome-left">
          <div className="welcome-content">
            {this.getComponentForCurrentStep()}
            <img
              className="welcome-graphic-top"
              src={WelcomeLeftTopImageUri}
              alt=""
            />
            <img
              className="welcome-graphic-bottom"
              src={WelcomeLeftBottomImageUri}
              alt=""
            />
          </div>
        </div>

        <div className="welcome-right">
          <img className="welcome-graphic" src={WelcomeRightImageUri} alt="" />
        </div>
      </UiView>
    )
  }
}
