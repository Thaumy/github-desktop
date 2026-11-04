import { constants } from 'fs'
import { link, lstat, mkdir, open, rename, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { dirname, isAbsolute, join, resolve } from 'path'
import { parse, stringify } from 'smol-toml'
import { z } from 'zod'

const maxConfigBytes = 1024 * 1024
const repositoryPathSchema = z
  .string()
  .min(1)
  .max(32768)
  .refine(path => !path.includes('\0'))
  .refine(path => !/(^|[\\/])\.\.([\\/]|$)/.test(path))
  .transform(path =>
    path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
  )
  .refine(isAbsolute)
  .transform(path => resolve(path))
const repositorySchema = z
  .object({
    alias: z
      .string()
      .max(32768)
      .refine(alias => !alias.includes('\0'))
      .default(''),
    path: repositoryPathSchema,
  })
  .strict()
type ConfiguredRepository = Readonly<z.infer<typeof repositorySchema>>
const configSchema = z
  .object({
    repo: z
      .array(repositorySchema)
      .max(10000)
      .refine(
        repositories =>
          new Set(repositories.map(repository => repository.path)).size ===
          repositories.length
      ),
  })
  .strict()

/** The user-editable repository list. Other repository metadata stays in IndexedDB. */
export class RepositoryConfig {
  private repositories: ReadonlyArray<ConfiguredRepository> = []
  private pendingUpdate: Promise<void> = Promise.resolve()

  public constructor(
    private readonly path = join(
      process.env.XDG_CONFIG_HOME && isAbsolute(process.env.XDG_CONFIG_HOME)
        ? process.env.XDG_CONFIG_HOME
        : join(homedir(), '.config'),
      'github-desktop',
      'config.toml'
    )
  ) {}

  public getRepositories(): ReadonlyArray<ConfiguredRepository> {
    return this.repositories
  }

  /** Load once on startup, migrating the existing list only when no file exists. */
  public async load(existingRepositories: ReadonlyArray<ConfiguredRepository>) {
    try {
      const repositories = await this.read()
      if (repositories !== null) {
        this.repositories = repositories
      } else {
        const migratedRepositories = configSchema.parse({
          repo: existingRepositories,
        }).repo
        try {
          await this.write(migratedRepositories, true)
          this.repositories = migratedRepositories
        } catch (error) {
          if (error.code !== 'EEXIST') {
            throw error
          }
          // Another window may have created the config during migration.
          const repositories = await this.read()
          if (repositories === null) {
            throw new Error(
              'Repository configuration disappeared during migration'
            )
          }
          this.repositories = repositories
        }
      }
      return this.repositories
    } catch {
      // Parser and filesystem errors can contain repository paths or file contents.
      throw new Error(
        'Unable to load GitHub Desktop config.toml. Check its permissions and [[repo]] entries with unique absolute paths and optional string aliases.'
      )
    }
  }

  public addPath(path: string, alias: string | null) {
    path = resolve(path)
    return this.update(repositories =>
      repositories.some(repository => repository.path === path)
        ? repositories
        : [...repositories, { path, alias: alias ?? '' }]
    )
  }

  public removePath(path: string) {
    return this.update(repositories =>
      repositories.filter(repository => repository.path !== resolve(path))
    )
  }

  public replacePath(oldPath: string, newPath: string) {
    return this.update(repositories =>
      repositories.map(repository =>
        repository.path === resolve(oldPath)
          ? { ...repository, path: resolve(newPath) }
          : repository
      )
    )
  }

  public setAlias(path: string, alias: string | null) {
    return this.update(repositories =>
      repositories.map(repository =>
        repository.path === resolve(path)
          ? { ...repository, alias: alias ?? '' }
          : repository
      )
    )
  }

  private update(
    change: (
      repositories: ReadonlyArray<ConfiguredRepository>
    ) => ReadonlyArray<ConfiguredRepository>
  ) {
    const update = this.pendingUpdate.then(async () => {
      try {
        const validated = configSchema.parse({
          repo: change(this.repositories),
        })
        await this.write(validated.repo)
        this.repositories = validated.repo
      } catch {
        throw new Error('Unable to save GitHub Desktop config.toml.')
      }
    })
    // Keep later updates usable after a failed write; callers still receive the error.
    this.pendingUpdate = update.catch(() => {})
    return update
  }

  private async read(): Promise<ReadonlyArray<ConfiguredRepository> | null> {
    let file
    try {
      if (!(await lstat(dirname(this.path))).isDirectory()) {
        throw new Error('Invalid repository configuration directory')
      }
      // Do not follow a symlink supplied in place of the config file.
      file = await open(
        this.path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      )
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null
      }
      throw error
    }

    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > maxConfigBytes) {
        throw new Error('Invalid repository configuration file')
      }
      // Bound the read even if the file grows after stat().
      const buffer = Buffer.alloc(maxConfigBytes + 1)
      let length = 0
      while (length < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          length,
          buffer.length - length
        )
        if (bytesRead === 0) {
          break
        }
        length += bytesRead
      }
      if (length > maxConfigBytes) {
        throw new Error('Repository configuration is too large')
      }
      return configSchema.parse(parse(buffer.toString('utf8', 0, length))).repo
    } finally {
      await file.close()
    }
  }

  private async write(
    repositories: ReadonlyArray<ConfiguredRepository>,
    createOnly = false
  ) {
    const contents = stringify({ repo: [...repositories] })
    if (Buffer.byteLength(contents) > maxConfigBytes) {
      throw new Error('Repository configuration is too large')
    }

    const directory = dirname(this.path)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    if (!(await lstat(directory)).isDirectory()) {
      throw new Error('Invalid repository configuration directory')
    }
    const temporaryPath = join(directory, `.repo-${randomUUID()}.tmp`)
    const file = await open(temporaryPath, 'wx', 0o600)
    try {
      try {
        await file.writeFile(contents, 'utf8')
        await file.sync()
      } finally {
        await file.close()
      }
      if (createOnly) {
        // Exclusive creation avoids overwriting a config created during migration.
        await link(temporaryPath, this.path)
      } else {
        await rename(temporaryPath, this.path)
      }
    } finally {
      await unlink(temporaryPath).catch(error => {
        if (error.code !== 'ENOENT') {
          throw error
        }
      })
    }
  }
}
