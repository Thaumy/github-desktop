import { describe, it } from 'node:test'
import assert from 'node:assert'
import { groupRepositories } from '../../src/ui/repositories-list/group-repositories'
import { Repository, ILocalRepositoryState } from '../../src/models/repository'
import { CloningRepository } from '../../src/models/cloning-repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

describe('repository list grouping', () => {
  const repositories: Array<Repository | CloningRepository> = [
    new Repository('repo1', 1, null, false),
    new Repository(
      'repo2',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'my-repo2' }),
      false
    ),
    new Repository(
      'repo3',
      3,
      gitHubRepoFixture({
        owner: '',
        name: 'my-repo3',
        endpoint: 'https://github.big-corp.com/api/v3',
      }),
      false
    ),
  ]

  const cache = new Map<number, ILocalRepositoryState>()

  it('returns a single, ungrouped list containing every repository', () => {
    const grouped = groupRepositories(repositories, cache, [])

    assert.equal(grouped.length, 1)
    assert.equal(grouped[0].identifier.kind, 'other')
    assert.equal(grouped[0].items.length, 3)
  })

  it('sorts all repositories alphabetically', () => {
    const repoA = new Repository('a', 1, null, false)
    const repoB = new Repository(
      'b',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'b' }),
      false
    )
    const repoC = new Repository('c', 3, null, false)
    const repoD = new Repository(
      'd',
      4,
      gitHubRepoFixture({ owner: 'me', name: 'd' }),
      false
    )
    const repoZ = new Repository('z', 5, null, false)

    const grouped = groupRepositories(
      [repoC, repoB, repoZ, repoD, repoA],
      cache,
      []
    )
    assert.equal(grouped.length, 1)

    const items = grouped[0].items
    assert.equal(items.length, 5)
    assert.equal(items[0].repository.path, 'a')
    assert.equal(items[1].repository.path, 'b')
    assert.equal(items[2].repository.path, 'c')
    assert.equal(items[3].repository.path, 'd')
    assert.equal(items[4].repository.path, 'z')
  })

  it('disambiguates repositories that share a name', () => {
    const repoA = new Repository(
      'repo',
      1,
      gitHubRepoFixture({ owner: 'user1', name: 'repo' }),
      false
    )
    const repoB = new Repository(
      'repo',
      2,
      gitHubRepoFixture({ owner: 'user2', name: 'repo' }),
      false
    )
    const repoC = new Repository('unique', 3, null, false)

    const grouped = groupRepositories([repoA, repoB, repoC], cache, [])
    assert.equal(grouped.length, 1)

    const items = grouped[0].items
    assert.equal(items.length, 3)

    // The two repositories named "repo" need disambiguation; the unique one
    // does not.
    const repoItems = items.filter(i => i.text[0] === 'repo')
    assert.equal(repoItems.length, 2)
    assert(repoItems[0].needsDisambiguation)
    assert(repoItems[1].needsDisambiguation)

    const uniqueItem = items.find(i => i.text[0] === 'unique')
    assert(uniqueItem !== undefined)
    assert(!uniqueItem.needsDisambiguation)
  })
})
