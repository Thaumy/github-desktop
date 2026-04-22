import { CopilotClient } from '@github/copilot-sdk'
import { AccountsStore } from './accounts-store'
import { Account, isDotComAccount } from '../../models/account'
import {
  ICopilotCommitMessage,
  parseCopilotCommitMessage,
} from '../copilot-commit-message'
import {
  ICopilotConflictResolutionResponse,
  IFileResolution,
  parseCopilotConflictResolution,
} from '../copilot-conflict-resolution'
import {
  ICopilotConflictContext,
  IConflictCommitContext,
  IFileConflictContext,
  formatConflictContextForPrompt,
} from '../copilot-conflict-context'
import { PullRequest } from '../../models/pull-request'
import { Emitter, Disposable } from 'event-kit'
import * as ipcRenderer from '../ipc-renderer'
import { join } from 'path'

/**
 * Returns the path of the executable (Electron/Node) used to run the Copilot CLI.
 *
 * This corresponds to the value of `process.execPath` used when launching the
 * Copilot CLI via an eval-based entry point (for example, `--eval "import './index.js'"`).
 */
export async function getCopilotCLIPath(): Promise<string> {
  return ipcRenderer.invoke('get-exec-path')
}

function getCopilotCLIDir(): string {
  return join(__dirname, 'copilot')
}

/**
 * System prompt for the Copilot commit message generation session.
 */
const CommitMessageSystemPrompt = `
You're an AI assistant whose job is to concisely summarize code changes into
short, useful commit messages, with a title and a description.

A changeset is given in the git diff output format, affecting one or multiple files.

The commit title should be no longer than 50 characters and should summarize the
contents of the changeset for other developers reading the commit history.

The commit description can be longer, and should provide more context about the
changeset, including why the changeset is being made, and any other relevant
information. The commit description is optional, so you can omit it if the
changeset is small enough that it can be described in the commit title or if you
don't have enough context.

Be brief and concise.

Do NOT include a description of changes in "lock" files from dependency managers
like npm, yarn, or pip (and others), unless those are the only changes in the commit.

Your response must be a JSON object with the attributes "title" and "description"
containing the commit title and commit description. Do not use markdown to wrap
the JSON object, just return it as plain text. For example:

{
  "title": "Fix issue with login form",
  "description": "The login form was not submitting correctly. This commit fixes that issue by adding a missing \`name\` attribute to the submit button."
}
`

/**
 * System prompt for the Copilot conflict resolution session.
 */
const ConflictResolutionSystemPrompt = `
You have all the context you need below. Do NOT attempt to use tools. Respond ONLY with the JSON format specified.

You are an expert Git conflict resolver. Your task is to analyze conflicts from merge, rebase, or cherry-pick operations and produce correct, clean resolutions.

You will receive:
- Labels for both sides of the conflict (e.g., branch names or commit references)
- The conflict markers from each conflicted file (ours, theirs, and optionally base content)
- Context lines surrounding each conflict
- When available: recent commit messages from both sides explaining the intent behind changes
- When available: the pull request title and description providing higher-level context

Your job:
1. Understand the INTENT behind each side's changes using commit messages and PR context when available
2. Resolve each conflict by producing the correct merged content
3. Explain your reasoning for each resolution

Resolution guidelines:
- When both sides add complementary code (e.g., different imports, different functions), combine them
- When both sides modify the same code differently, use commit messages and PR context to determine the correct resolution
- When one side deletes code the other modifies, determine if the deletion was intentional
- Preserve code correctness: imports, types, formatting must be valid
- When in doubt, prefer the approach that maintains backward compatibility

You MUST respond with valid JSON in this exact format:
{
  "resolutions": [
    {
      "path": "relative/file/path.ts",
      "resolvedContent": "the complete resolved file content with all conflicts resolved",
      "reasoning": "explanation of how you resolved each conflict and why"
    }
  ]
}

Important:
- resolvedContent must contain the COMPLETE file content (not just the conflicted sections)
- All conflict markers must be removed in the resolved content
- Include one resolution entry per conflicted file
`

/** Progress information emitted during conflict resolution. */
export type ConflictResolutionProgress =
  | {
      readonly kind: 'analyzing'
      readonly filesTotal: number
    }
  | {
      readonly kind: 'chunk-complete'
      readonly filesResolved: number
      readonly filesTotal: number
    }
  | {
      readonly kind: 'complete'
    }

/**
 * Maximum number of files to resolve in a single prompt. When the total
 * exceeds this threshold, the engine batches files into parallel chunks.
 */
const SinglePromptFileLimit = 20

/**
 * Chunk sizes used when batching files across parallel prompts.
 * Smaller chunks for very large conflicts reduce token usage and
 * improve reliability.
 */
function getChunkSize(fileCount: number): number {
  return fileCount > 100 ? 15 : 20
}

/** Maximum number of chunks to resolve concurrently. */
const MaxConcurrentChunks = 5

/**
 * This store manages the Copilot client lifecycle based on the user's
 * GitHub.com account. It tracks account changes and creates the client
 * lazily when a Copilot feature is used.
 *
 * Currently, Copilot is only available for GitHub.com accounts.
 */
export class CopilotStore {
  private readonly emitter = new Emitter()
  private currentAccount: Account | null = null

  public constructor(private readonly accountsStore: AccountsStore) {
    this.accountsStore.onDidUpdate(this.onAccountsUpdated)
    this.initializeFromAccounts()
  }

  /**
   * Initialize the account from the current accounts.
   */
  private async initializeFromAccounts(): Promise<void> {
    const accounts = await this.accountsStore.getAll()
    this.onAccountsUpdated(accounts)
  }

  /**
   * Handler for account updates. Updates the stored account reference.
   */
  private onAccountsUpdated = (accounts: ReadonlyArray<Account>): void => {
    // Copilot is only available on GitHub.com, so we look for a dotcom account
    const dotComAccount = accounts.find(isDotComAccount) ?? null
    this.currentAccount = dotComAccount

    if (dotComAccount === null) {
      log.debug('CopilotStore: No GitHub.com account available')
    } else {
      log.debug(`CopilotStore: Account updated for '${dotComAccount.login}'`)
    }
  }

  /**
   * Creates a new Copilot client for the current account.
   *
   * @throws Error if no GitHub.com account is available
   */
  private async createClient(repositoryPath: string): Promise<CopilotClient> {
    if (this.currentAccount === null || !this.currentAccount.token) {
      throw new Error(
        'Cannot create Copilot client: No GitHub.com account available'
      )
    }

    // This relies on the fact that Copilot CLI is bundled with the app, but not
    // as a "single executable application", but the files from the npm package.
    // That means Desktop will use its own executable to run as Copilot CLI's
    // index.js as node.
    // However, when trying to do this directly without the --eval flag, Copilot
    // CLI fails to parse the arguments correctly, so we ended up using --eval
    // and just importing the index.js from the CLI as a workaround.
    const cliDir = getCopilotCLIDir()
    return new CopilotClient({
      cliPath: await getCopilotCLIPath(),
      cliArgs: ['--eval', `import '${join(cliDir, 'index.js')}'`, '--'],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
      },
      cwd: repositoryPath,
      autoStart: true,
      githubToken: this.currentAccount.token,
    })
  }

  /**
   * Stops the given Copilot client.
   */
  private async stopClient(client: CopilotClient): Promise<void> {
    try {
      await client.stop()
    } catch (e) {
      log.error('CopilotStore: Error stopping client', e)
    }
  }

  /**
   * Generates a commit message for the given diff using Copilot.
   *
   * @param diff The diff of changes to be committed, in git format
   * @returns Commit details (title and description) generated by Copilot
   * @throws Error if no GitHub.com account is available or if generation fails
   */
  public async generateCommitMessage(
    diff: string,
    repositoryPath: string
  ): Promise<ICopilotCommitMessage> {
    const client = await this.createClient(repositoryPath)
    let session: Awaited<ReturnType<CopilotClient['createSession']>> | null =
      null

    try {
      // Create a session for commit message generation
      session = await client.createSession({
        model: 'gpt-5-mini',
        reasoningEffort: 'low',
        systemMessage: {
          // It's important to 'append' the system prompt so that it doesn't
          // override any instructions, like copilot-instructions.md (in which
          // we rely for custom commit message generation instructions).
          mode: 'append',
          content: CommitMessageSystemPrompt,
        },
        onPermissionRequest: async () => ({
          kind: 'denied-interactively-by-user',
        }),
      })

      // Send the diff and wait for response
      const response = await session.sendAndWait({ prompt: diff }, 30000)

      if (!response || !response.data.content) {
        throw new Error('No response from Copilot')
      }

      return parseCopilotCommitMessage(response.data.content)
    } catch (e) {
      log.warn('CopilotStore: Failed to generate commit message', e)
      throw e
    } finally {
      // Clean up the session
      await session?.destroy().catch(() => {})

      // Stop the client after use
      await this.stopClient(client)
    }
  }

  /**
   * Use the Copilot SDK to analyze conflicts and suggest resolutions.
   *
   * For small conflict sets (≤20 files) a single prompt is sent. Larger sets
   * are automatically batched into parallel chunks with up to 5 concurrent
   * requests. Each chunk is retried once on parse failure.
   *
   * @param context - The structured conflict context (files with hunks)
   * @param commitContext - Optional commit history from both sides
   * @param pullRequest - Optional pull request for enrichment
   * @param repositoryPath - Path to the repository working directory
   * @param onProgress - Optional callback for streaming progress to the UI
   * @returns The parsed conflict resolution response
   * @throws Error if no GitHub.com account is available or if resolution fails
   */
  public async resolveConflicts(
    context: ICopilotConflictContext,
    commitContext: IConflictCommitContext | null,
    pullRequest: PullRequest | null,
    repositoryPath: string,
    onProgress?: (progress: ConflictResolutionProgress) => void
  ): Promise<ICopilotConflictResolutionResponse> {
    const resolvableFiles = context.files.filter(f => !f.skippedReason)
    const filesTotal = resolvableFiles.length

    if (filesTotal === 0) {
      throw new Error('No resolvable conflicted files')
    }

    onProgress?.({ kind: 'analyzing', filesTotal })

    const client = await this.createClient(repositoryPath)

    try {
      if (filesTotal <= SinglePromptFileLimit) {
        const prompt = formatConflictContextForPrompt(
          context,
          commitContext,
          pullRequest
        )
        const resolutions = await this.resolveChunk(
          client,
          prompt,
          resolvableFiles
        )
        onProgress?.({ kind: 'complete' })
        return { resolutions }
      }

      // Batch into chunks and resolve concurrently
      const chunkSize = getChunkSize(filesTotal)
      const chunks = createChunks(resolvableFiles, chunkSize)
      const allResolutions: Array<IFileResolution> = []
      let filesResolved = 0

      // Process chunks with bounded concurrency
      for (let i = 0; i < chunks.length; i += MaxConcurrentChunks) {
        const batch = chunks.slice(i, i + MaxConcurrentChunks)
        const batchResults = await Promise.all(
          batch.map(chunkFiles => {
            const chunkContext: ICopilotConflictContext = {
              ourLabel: context.ourLabel,
              theirLabel: context.theirLabel,
              files: chunkFiles,
            }
            const prompt = formatConflictContextForPrompt(
              chunkContext,
              commitContext,
              pullRequest
            )
            return this.resolveChunk(client, prompt, chunkFiles)
          })
        )

        for (const resolutions of batchResults) {
          allResolutions.push(...resolutions)
          filesResolved += resolutions.length
          onProgress?.({
            kind: 'chunk-complete',
            filesResolved,
            filesTotal,
          })
        }
      }

      onProgress?.({ kind: 'complete' })
      return { resolutions: allResolutions }
    } finally {
      await this.stopClient(client)
    }
  }

  /**
   * Resolve a single chunk of files. Retries once on parse failure.
   * Validates that returned paths match the requested files.
   */
  private async resolveChunk(
    client: CopilotClient,
    prompt: string,
    expectedFiles: ReadonlyArray<IFileConflictContext>
  ): Promise<ReadonlyArray<IFileResolution>> {
    const expectedPaths = new Set(expectedFiles.map(f => f.path))
    let lastError: Error | undefined

    for (let attempt = 0; attempt < 2; attempt++) {
      let session: Awaited<ReturnType<CopilotClient['createSession']>> | null =
        null

      try {
        session = await client.createSession({
          model: 'gpt-5-mini',
          reasoningEffort: 'medium',
          availableTools: [],
          systemMessage: {
            mode: 'append',
            content: ConflictResolutionSystemPrompt,
          },
          onPermissionRequest: async () => ({
            kind: 'denied-interactively-by-user',
          }),
        })

        const response = await session.sendAndWait({ prompt }, 60000)

        if (!response || !response.data.content) {
          throw new Error('No response from Copilot')
        }

        const parsed = parseCopilotConflictResolution(response.data.content)

        // Validate returned paths match requested files
        const returnedPaths = new Set(parsed.resolutions.map(r => r.path))
        for (const path of returnedPaths) {
          if (!expectedPaths.has(path)) {
            throw new Error(
              `Copilot returned resolution for unexpected file: ${path}`
            )
          }
        }

        // Check for duplicate paths
        if (returnedPaths.size !== parsed.resolutions.length) {
          throw new Error(
            'Copilot returned duplicate file paths in resolutions'
          )
        }

        return parsed.resolutions
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        if (attempt === 0) {
          log.warn(
            'CopilotStore: Conflict resolution attempt failed, retrying',
            e
          )
        }
      } finally {
        await session?.destroy().catch(() => {})
      }
    }

    log.warn('CopilotStore: Failed to resolve conflicts after retry', lastError)
    throw lastError ?? new Error('Conflict resolution failed')
  }

  /**
   * Register a function to be called when an error occurs.
   */
  public onDidError(fn: (e: Error) => void): Disposable {
    return this.emitter.on('did-error', fn)
  }

  /**
   * Emits an error event.
   */
  protected emitError(error: Error): void {
    this.emitter.emit('did-error', error)
  }
}

/** Split an array into chunks of the given size. */
function createChunks<T>(
  items: ReadonlyArray<T>,
  size: number
): ReadonlyArray<ReadonlyArray<T>> {
  const chunks: Array<ReadonlyArray<T>> = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}
