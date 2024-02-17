import {
  Repository,
  ILocalRepositoryState,
  nameOf,
} from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { caseInsensitiveCompare } from '../../lib/compare'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IAheadBehind } from '../../models/branch'
import { Owner } from '../../models/owner'

export type RepositoryListGroup =
  | {
      kind: 'recent' | 'other'
    }
  | {
      kind: 'dotcom'
      owner: Owner
    }
  | {
      kind: 'enterprise'
      host: string
    }

export type Repositoryish = Repository | CloningRepository

export interface IRepositoryListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly repository: Repositoryish
  readonly needsDisambiguation: boolean
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
}

// Returns the display title for a repository, which is either the alias
// (if available) or the name.
const getDisplayTitle = (r: Repositoryish) =>
  r instanceof Repository && r.alias != null ? r.alias : r.name

/**
 * Builds the list of repositories shown in the repository list.
 *
 * The repository list is intentionally flat: every repository is returned in a
 * single, ungrouped list sorted alphabetically by display title. There is no
 * owner/host/"Recent" grouping.
 */
export function groupRepositories(
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  _recentRepositories: ReadonlyArray<number>
): ReadonlyArray<IFilterListGroup<IRepositoryListItem, RepositoryListGroup>> {
  // Count display titles so repositories that share a name can be disambiguated
  // (by showing their full name) within the flat list.
  const titleCounts = new Map<string, number>()
  for (const repo of repositories) {
    const title = getDisplayTitle(repo)
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1)
  }

  const items = repositories
    .map(repo => {
      const repoState = localRepositoryStateLookup.get(repo.id)
      const title = getDisplayTitle(repo)

      return {
        text: repo instanceof Repository ? [title, nameOf(repo)] : [title],
        id: repo.id.toString(),
        repository: repo,
        needsDisambiguation: (titleCounts.get(title) ?? 0) > 1,
        aheadBehind: repoState?.aheadBehind ?? null,
        changedFilesCount: repoState?.changedFilesCount ?? 0,
      }
    })
    .sort((x, y) =>
      caseInsensitiveCompare(
        getDisplayTitle(x.repository),
        getDisplayTitle(y.repository)
      )
    )

  return [{ identifier: { kind: 'other' }, items }]
}
