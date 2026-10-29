import * as React from 'react'
import { About } from './about'
import { getName, getVersion } from '../lib/app-proxy'

interface IAboutTestDialogProps {
  readonly onDismissed: () => void
  readonly onShowAcknowledgements: () => void
}

export class AboutTestDialog extends React.Component<IAboutTestDialogProps> {
  public render() {
    const version = __DEV__ ? __SHA__.substring(0, 10) : getVersion()

    return (
      <About
        key="about"
        onDismissed={this.props.onDismissed}
        applicationName={getName()}
        applicationVersion={version}
        applicationArchitecture={process.arch}
        onShowAcknowledgements={this.props.onShowAcknowledgements}
      />
    )
  }
}
