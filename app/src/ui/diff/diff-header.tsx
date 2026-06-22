import * as React from 'react'
import { PathLabel } from '../lib/path-label'
import { AppFileStatus } from '../../models/status'
import { IDiff, DiffType, DiffLineType } from '../../models/diff'
import { Octicon, iconForStatus } from '../octicons'
import { mapStatus } from '../../lib/status'
import { DiffOptions } from './diff-options'

interface IDiffHeaderProps {
  readonly path: string
  readonly status: AppFileStatus
  readonly diff: IDiff | null

  /** Whether we should display side by side diffs. */
  readonly showSideBySideDiff: boolean

  /** Called when the user changes the side by side diffs setting. */
  readonly onShowSideBySideDiffChanged: (checked: boolean) => void

  /** Whether we should hide whitespace in diffs. */
  readonly hideWhitespaceInDiff: boolean

  /** Called when the user changes the hide whitespace in diffs setting. */
  readonly onHideWhitespaceInDiffChanged: (checked: boolean) => Promise<void>

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void
}

/**
 * Counts the number of added and deleted lines in a text diff. Returns null for
 * non-text diffs (image, binary, submodule, etc.) where line counts don't apply.
 */
function getDiffLineChanges(
  diff: IDiff | null
): { readonly added: number; readonly deleted: number } | null {
  if (
    diff === null ||
    (diff.kind !== DiffType.Text && diff.kind !== DiffType.LargeText)
  ) {
    return null
  }

  let added = 0
  let deleted = 0

  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.type === DiffLineType.Add) {
        added += 1
      } else if (line.type === DiffLineType.Delete) {
        deleted += 1
      }
    }
  }

  return { added, deleted }
}

/** Displays information about a file */
export class DiffHeader extends React.Component<IDiffHeaderProps, {}> {
  public render() {
    const status = this.props.status
    const fileStatus = mapStatus(status)

    return (
      <div className="header">
        <PathLabel path={this.props.path} status={this.props.status} />

        {this.renderLineChanges()}

        {this.renderDiffOptions()}

        <Octicon
          symbol={iconForStatus(status)}
          className={'status status-' + fileStatus.toLowerCase()}
          title={fileStatus}
        />
      </div>
    )
  }

  private renderLineChanges() {
    const changes = getDiffLineChanges(this.props.diff)

    if (changes === null || (changes.added === 0 && changes.deleted === 0)) {
      return null
    }

    return (
      <div className="diff-line-changes">
        <span className="lines-added">+{changes.added}</span>
        <span className="lines-deleted">-{changes.deleted}</span>
      </div>
    )
  }

  private renderDiffOptions() {
    if (this.props.diff?.kind === DiffType.Submodule) {
      return null
    }

    return (
      <DiffOptions
        isInteractiveDiff={true}
        onHideWhitespaceChangesChanged={
          this.props.onHideWhitespaceInDiffChanged
        }
        hideWhitespaceChanges={this.props.hideWhitespaceInDiff}
        onShowSideBySideDiffChanged={this.props.onShowSideBySideDiffChanged}
        showSideBySideDiff={this.props.showSideBySideDiff}
        onDiffOptionsOpened={this.props.onDiffOptionsOpened}
      />
    )
  }
}
