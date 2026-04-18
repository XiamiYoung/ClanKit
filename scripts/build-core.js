/**
 * Cross-platform Go build script for clank-core.
 *
 * Usage:
 *   node scripts/build-core.js                  # build for current platform
 *   node scripts/build-core.js --all            # build for win-x64, mac-x64, mac-arm64
 *   node scripts/build-core.js --obfuscate      # use garble for obfuscation
 */
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const CORE_DIR = path.resolve(__dirname, '..', 'core')
const RESOURCES_DIR = path.resolve(__dirname, '..', 'resources')

const TARGETS = [
  { name: 'win-x64',     goos: 'windows', goarch: 'amd64', ext: '.exe' },
  { name: 'mac-x64',     goos: 'darwin',  goarch: 'amd64', ext: '' },
  { name: 'mac-arm64',   goos: 'darwin',  goarch: 'arm64', ext: '' },
]

function currentPlatformTarget() {
  const platform = process.platform === 'win32' ? 'windows' : process.platform
  const arch = process.arch === 'x64' ? 'amd64' : process.arch
  return TARGETS.find(t => t.goos === platform && t.goarch === arch)
    || { name: `${platform}-${arch}`, goos: platform, goarch: arch, ext: platform === 'windows' ? '.exe' : '' }
}

function build(target, obfuscate) {
  const outDir = path.join(RESOURCES_DIR, target.name)
  fs.mkdirSync(outDir, { recursive: true })

  const outFile = path.join(outDir, `clank-core${target.ext}`)
  const buildCmd = obfuscate ? 'garble -tiny' : 'go'
  const buildArgs = obfuscate ? 'build' : 'build'

  const cmd = `${buildCmd} ${buildArgs} -o "${outFile}" ./cmd/clank-core`
  const env = {
    ...process.env,
    GOOS: target.goos,
    GOARCH: target.goarch,
    CGO_ENABLED: '0',
  }

  console.log(`Building ${target.name} → ${path.relative(process.cwd(), outFile)}`)
  execSync(cmd, { cwd: CORE_DIR, env, stdio: 'inherit' })
  console.log(`  done`)
}

function main() {
  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const obfuscate = args.includes('--obfuscate')

  const targets = all ? TARGETS : [currentPlatformTarget()]

  for (const target of targets) {
    build(target, obfuscate)
  }
}

main()
