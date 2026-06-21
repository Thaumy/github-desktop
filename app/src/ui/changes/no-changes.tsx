import * as React from 'react'

import { encodePathAsUrl } from '../../lib/path'

const PaperStackImage = encodePathAsUrl(__dirname, 'static/paper-stack.svg')

/** The component to display when there are no local changes. */
export function NoChanges() {
  return (
    <div className="changes-interstitial no-changes">
      <div className="content">
        <div className="interstitial-header">
          {/* Non-breaking spaces within each sentence so the heading only
            wraps between sentences, never mid-sentence by word. */}
          <div className="text">
            <h1>Talk&nbsp;is&nbsp;cheap. Show&nbsp;me&nbsp;the&nbsp;code.</h1>
            <p>There&nbsp;are&nbsp;no&nbsp;uncommitted&nbsp;changes in&nbsp;this&nbsp;repository.</p>
          </div>
          <img src={PaperStackImage} className="blankslate-image" alt="" />
        </div>
      </div>
    </div>
  )
}
