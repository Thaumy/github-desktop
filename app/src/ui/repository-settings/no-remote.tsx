import * as React from 'react'
import { DialogContent } from '../dialog'

/** A local repository can be connected to any Git remote. */
export class NoRemote extends React.Component {
  public render() {
    return (
      <DialogContent>
        <p>
          This repository has no remote. Add one with{' '}
          <code>git remote add origin &lt;url&gt;</code> in your shell to enable
          fetch, pull, and push.
        </p>
      </DialogContent>
    )
  }
}
