import { appendFile, rm, writeFile } from 'fs/promises'
import { getCommits, revRange } from '.'
import { Commit } from '../../models/commit'
import { IMultiCommitOperationProgress } from '../../models/progress'
import { Repository } from '../../models/repository'
import { getTempFilePath } from '../file-system'
import { rebaseInteractive, RebaseResult } from './rebase'

/**
 * Rewords the message of a single commit by calling interactive rebase.
 *
 * All commits from (but not including) `lastRetainedCommitRef` up to `HEAD` are
 * replayed. The `commitToReword` is marked with the `reword` action so git stops
 * and lets us replace its message with `newMessage`; every other commit is
 * replayed unchanged with `pick`.
 *
 * Because the trees of all replayed commits are identical to before, this can
 * not realistically result in conflicts.
 *
 * @param commitToReword - the commit whose message should be replaced
 * @param lastRetainedCommitRef - sha of the commit before `commitToReword` or
 * null if `commitToReword` is the root (first in history) of the branch
 * @param newMessage - the first line of the string provided will be the summary
 * and the rest the body (similar to commit implementation)
 */
export async function reword(
  repository: Repository,
  commitToReword: Commit,
  lastRetainedCommitRef: string | null,
  newMessage: string,
  progressCallback?: (progress: IMultiCommitOperationProgress) => void
): Promise<RebaseResult> {
  let messagePath, todoPath
  let result: RebaseResult

  try {
    const commits = await getCommits(
      repository,
      lastRetainedCommitRef === null
        ? undefined
        : revRange(lastRetainedCommitRef, 'HEAD')
    )

    if (commits.length === 0) {
      throw new Error(
        '[reword] Could not find commits in log for last retained commit ref.'
      )
    }

    todoPath = await getTempFilePath('rewordTodo')
    let foundRewordCommitInLog = false

    // Traversed in reverse so we do oldest to newest (replay commits)
    for (let i = commits.length - 1; i >= 0; i--) {
      const commit = commits[i]
      const action = commit.sha === commitToReword.sha ? 'reword' : 'pick'

      if (action === 'reword') {
        foundRewordCommitInLog = true
      }

      await appendFile(todoPath, `${action} ${commit.sha} ${commit.summary}\n`)
    }

    if (!foundRewordCommitInLog) {
      throw new Error(
        '[reword] The commit to reword was not found in the log. Continuing would not reword anything.'
      )
    }

    if (newMessage.trim() !== '') {
      messagePath = await getTempFilePath('rewordCommitMessage')
      await writeFile(messagePath, newMessage)
    }

    // if no commit message provided, accept default editor
    const gitEditor =
      messagePath !== undefined ? `cat "${messagePath}" >` : undefined

    result = await rebaseInteractive(
      repository,
      todoPath,
      lastRetainedCommitRef,
      {
        action: 'reword',
        gitEditor,
        progressCallback,
        commits: commits.toReversed(),
      }
    )
  } catch (e) {
    log.error(e)
    return RebaseResult.Error
  } finally {
    if (todoPath !== undefined) {
      await rm(todoPath, { recursive: true, force: true })
    }

    if (messagePath !== undefined) {
      await rm(messagePath, { recursive: true, force: true })
    }
  }

  return result
}
