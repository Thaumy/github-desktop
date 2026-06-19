import { revRange } from './rev-list'
import { Repository } from '../../models/repository'
import { git } from '.'

/**
 * Generate a patch representing the changes associated with a range of commits
 *
 * @param repository where to generate path from
 * @param base starting commit in range
 * @param head ending commit in rage
 * @returns patch generated
 */
export function formatPatch({ path }: Repository, base: string, head: string) {
  const range = revRange(base, head)
  const args = ['format-patch', '--unified=1', '--minimal', '--stdout', range]
  return git(args, path, 'formatPatch').then(x => x.stdout)
}

/**
 * Generate a patch (in `git format-patch` mbox format) for an arbitrary set of
 * commits.
 *
 * Each commit is formatted individually and the results are concatenated in the
 * order the SHAs are provided. This ensures a non-contiguous selection of
 * commits (e.g. cmd/ctrl-clicking commits that aren't next to each other) is
 * handled correctly.
 *
 * @param repository the repository to generate the patch from
 * @param shas the full SHAs of the commits to include in the patch
 */
export async function getCommitPatch(
  { path }: Repository,
  shas: ReadonlyArray<string>
): Promise<string> {
  const patches = new Array<string>()

  for (const sha of shas) {
    const { stdout } = await git(
      ['format-patch', '-1', '--stdout', sha],
      path,
      'getCommitPatch'
    )
    patches.push(stdout)
  }

  return patches.join('')
}
