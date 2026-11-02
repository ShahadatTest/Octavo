// Cuts a release.
//
//   npm run release                 next version computed from Conventional Commits
//   npm run release -- 0.3.0        explicit version
//   npm run release -- --dry-run    show what would happen, change nothing
//
// Steps: verify a clean tree, compute the version with git-cliff, write
// CHANGELOG.md, set the version in package.json and package-lock.json, commit as
// "chore(release): vX.Y.Z" and create an annotated tag vX.Y.Z. Pushing is left to you:
//   git push --follow-tags
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { runGitCliff } = require('git-cliff')

const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const explicit = args.find((a) => /^v?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(a))

const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
const cliff = async (cliffArgs) => (await runGitCliff(cliffArgs, { cwd: root, stdio: 'pipe' })).stdout.trim()

function setVersion(file, version) {
  const text = fs.readFileSync(file, 'utf8')
  const json = JSON.parse(text)
  json.version = version
  if (json.packages && json.packages['']) json.packages[''].version = version
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
}

async function main() {
  if (git('status', '--porcelain')) {
    console.error('The working tree has uncommitted changes. Commit or stash them first.')
    process.exit(1)
  }

  const current = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  const next = (explicit ?? (await cliff(['--bumped-version']))).replace(/^v/, '')
  const tag = `v${next}`

  if (git('tag', '--list', tag)) {
    console.error(`Tag ${tag} already exists.`)
    process.exit(1)
  }

  console.log(`Current version: ${current}`)
  console.log(`Next version:    ${next}`)
  console.log('')
  console.log(await cliff(['--unreleased', '--tag', tag, '--strip', 'all']))

  if (dryRun) {
    console.log('\nDry run: nothing was changed.')
    return
  }

  setVersion(path.join(root, 'package.json'), next)
  setVersion(path.join(root, 'package-lock.json'), next)
  await runGitCliff(['--tag', tag, '-o', 'CHANGELOG.md'], { cwd: root, stdio: 'inherit' })
  // The notices name Octavo's version and every shipped package's, so each release carries a fresh copy.
  execFileSync('node', [path.join(__dirname, 'third-party-licenses.js')], { cwd: root, stdio: 'inherit' })

  git('add', 'CHANGELOG.md', 'package.json', 'package-lock.json', 'THIRD_PARTY_LICENSES.md')
  git('commit', '-m', `chore(release): ${tag}`)
  git('tag', '-a', tag, '-m', `Octavo ${tag}`)

  console.log(`\nReleased ${tag}. Publish it with:\n\n  git push --follow-tags\n\nThe tag push makes GitHub Actions build, test and publish the release (.github/workflows/build.yml).`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
