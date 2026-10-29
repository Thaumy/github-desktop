import * as Path from 'path'
import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { getDefaultDir, setDefaultDir } from '../lib/default-dir'
import { FoldoutType } from '../../lib/app-state'
import { IRepositoryIdentifier, parseRemote } from '../../lib/remote-parsing'
import { Dialog, DialogError, DialogFooter } from '../dialog'
import { CloneGenericRepository } from './clone-generic-repository'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { showOpenDialog, showSaveDialog } from '../main-process-proxy'
import { readdir } from 'fs/promises'
import { isTopMostDialog } from '../dialog/is-top-most'

interface ICloneRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly initialURL: string | null
  readonly isTopMost: boolean
}

interface ICloneRepositoryState {
  readonly initialPath: string | null
  readonly loading: boolean
  readonly error: Error | null
  readonly lastParsedIdentifier: IRepositoryIdentifier | null
  readonly path: string | null
  readonly url: string
}

/** Clone any Git remote without a hosting-provider account. */
export class CloneRepository extends React.Component<
  ICloneRepositoryProps,
  ICloneRepositoryState
> {
  private checkIsTopMostDialog = isTopMostDialog(
    () => {
      this.validatePath()
      window.addEventListener('focus', this.onWindowFocus)
    },
    () => window.removeEventListener('focus', this.onWindowFocus)
  )

  public constructor(props: ICloneRepositoryProps) {
    super(props)
    this.state = {
      initialPath: null,
      loading: false,
      error: null,
      lastParsedIdentifier: null,
      path: null,
      url: props.initialURL ?? '',
    }
  }

  public componentDidMount() {
    this.initializePath().catch(error => {
      log.error('Unable to initialize clone directory', error)
      this.setState({ error })
    })
    this.checkIsTopMostDialog(this.props.isTopMost)
  }

  public componentDidUpdate(prevProps: ICloneRepositoryProps) {
    if (prevProps.initialURL !== this.props.initialURL) {
      this.updateUrl(this.props.initialURL ?? '')
    }
    this.checkIsTopMostDialog(this.props.isTopMost)
  }

  public componentWillUnmount() {
    this.checkIsTopMostDialog(false)
  }

  private async initializePath() {
    const path = await getDefaultDir()
    this.setState({ initialPath: path, path }, () =>
      this.updateUrl(this.state.url)
    )
  }

  public render() {
    const { error, loading, path, url } = this.state
    return (
      <Dialog
        className="clone-repository"
        title={__DARWIN__ ? 'Clone a Repository' : 'Clone a repository'}
        onSubmit={this.clone}
        onDismissed={this.props.onDismissed}
        loading={loading}
      >
        {error && <DialogError>{error.message}</DialogError>}
        <CloneGenericRepository
          path={path ?? ''}
          url={url}
          onPathChanged={this.onPathChanged}
          onUrlChanged={this.updateUrl}
          onChooseDirectory={this.onChooseDirectory}
        />
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Clone"
            okButtonDisabled={loading || error !== null || !path || !url.trim()}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private getSelectedTabState = () => this.state

  private setSelectedTabState<K extends keyof ICloneRepositoryState>(
    state: Pick<ICloneRepositoryState, K>,
    callback?: () => void
  ) {
    this.setState(state, callback)
  }

  private onPathChanged = (path: string) => {
    this.setState({ path }, this.validatePath)
  }

  private validatePath = async () => {
    const tabState = this.getSelectedTabState()
    const { path, url, error } = tabState
    const { initialPath } = this.state
    const isDefaultPath = initialPath === path
    const isURLNotEntered = url === ''

    if (isDefaultPath && isURLNotEntered) {
      if (error) {
        this.setSelectedTabState({ error: null })
      }
    } else {
      const pathValidation = await this.validateEmptyFolder(path)

      // We only care about the result if the path hasn't
      // changed since we went async
      const newTabState = this.getSelectedTabState()
      if (newTabState.path === path) {
        this.setSelectedTabState({ error: pathValidation, path })
      }
    }
  }

  private onChooseDirectory = async () => {
    // We received feedback (#12812) that using the save dialog is confusing on
    // windows due to appearing to require a file selection. This is not the case
    // on mac where it more clearly shows directory creation.
    if (__DARWIN__) {
      return this.onChooseWithSaveDialog()
    }

    return this.onChooseWithOpenDialog()
  }

  private onChooseWithOpenDialog = async (): Promise<string | undefined> => {
    const path = await showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })

    if (path === null) {
      return
    }

    const lastParsedIdentifier = this.state.lastParsedIdentifier
    const directory = lastParsedIdentifier
      ? Path.join(path, lastParsedIdentifier.name)
      : path

    this.setSelectedTabState(
      { path: directory, error: null },
      this.validatePath
    )

    return directory
  }

  private onChooseWithSaveDialog = async (): Promise<string | undefined> => {
    const tabState = this.getSelectedTabState()

    const path = await showSaveDialog({
      buttonLabel: 'Select',
      nameFieldLabel: 'Clone As:',
      showsTagField: false,
      defaultPath: tabState.path ?? '',
      properties: ['createDirectory'],
    })

    if (path == null) {
      return
    }

    this.setSelectedTabState({ path, error: null }, this.validatePath)

    return path
  }

  private updateUrl = async (url: string) => {
    const parsed = parseRemote(url)
    const lastParsedIdentifier = this.state.lastParsedIdentifier

    // If there is no path yet, just update the url
    if (this.state.path === null) {
      this.setSelectedTabState({ url }, this.validatePath)
      return
    }

    let newPath: string

    const dirPath = this.state.path
    if (lastParsedIdentifier) {
      if (parsed) {
        newPath = Path.join(Path.dirname(dirPath), parsed.name)
      } else {
        newPath = Path.dirname(dirPath)
      }
    } else if (parsed) {
      newPath = Path.join(dirPath, parsed.name)
    } else {
      newPath = dirPath
    }

    this.setSelectedTabState(
      {
        url,
        lastParsedIdentifier: parsed,
        path: newPath,
      },
      this.validatePath
    )
  }

  private async validateEmptyFolder(
    path: string | null
  ): Promise<null | Error> {
    if (path === null) {
      return new Error(
        'Unable to read path on disk. Please check the path and try again.'
      )
    }

    try {
      const directoryFiles = await readdir(path)

      if (directoryFiles.length === 0) {
        return null
      } else {
        return new Error(
          'This folder contains files. Git can only clone to empty folders.'
        )
      }
    } catch (error) {
      if (error.code === 'ENOTDIR') {
        // path refers to a file or other file system entry
        return new Error(
          'There is already a file with this name. Git can only clone to a folder.'
        )
      }

      if (error.code === 'ENOENT') {
        // Folder does not exist
        return null
      }

      log.error(
        'CloneRepository: Path validation failed. Error: ' + error.message
      )
      return new Error(
        'Unable to read path on disk. Please check the path and try again.'
      )
    }
  }

  private clone = async () => {
    this.setState({ loading: true })

    const { url } = this.state
    const { path } = this.getSelectedTabState()

    if (path == null) {
      const error = new Error(`Directory could not be created at this path.`)
      this.setState({ loading: false })
      this.setSelectedTabState({ error })
      return
    }

    if (url.trim().length === 0) {
      const error = new Error('Enter a Git remote URL.')
      this.setState({ loading: false })
      this.setSelectedTabState({ error })
      return
    }

    this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    try {
      this.cloneImpl(url.trim(), path)
    } catch (e) {
      log.error(`CloneRepository: clone failed to complete to ${path}`, e)
      this.setState({ loading: false })
      this.setSelectedTabState({ error: e })
    }
  }

  private cloneImpl(url: string, path: string, defaultBranch?: string) {
    this.props.dispatcher.clone(url, path, { defaultBranch })
    this.props.onDismissed()

    setDefaultDir(Path.resolve(path, '..'))
  }

  private onWindowFocus = () => {
    // Verify the path after focus has been regained in
    // case the directory or directory contents has been
    // created/removed/altered while the user wasn't in-app.
    this.validatePath()
  }
}
