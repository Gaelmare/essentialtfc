#!/usr/bin/env bash
# Merges the base pack (1.21, EssentialTFC) into the variant branch you're on (vital-1.21).
#
#   tools/sync-vital.sh [base]      start the merge (base defaults to 1.21)
#   tools/sync-vital.sh --continue  finish it after you've resolved the remaining conflicts
#
# Shared work goes on the base branch and is merged forward with this script. Never merge
# the variant into the base: that would carry its own mods (LittleTiles and so on) along.
#
# The files packwiz and build.sh generate are resolved here instead of by hand:
#   pack.toml   the base's, keeping this branch's name and description
#   index.toml  rebuilt with `packwiz refresh`
#   README.md   the mod list is regenerated; conflicts above it are left to you
# Anything else that conflicts (usually CHANGELOG.md) is yours to resolve. Then `git add` it
# and run with --continue. `git merge --abort` gives up and puts the branch back.
set -euo pipefail

die() { echo "sync-vital: $*" >&2; exit 1; }
in_merge() { git rev-parse -q --verify MERGE_HEAD >/dev/null; }
unmerged() { git ls-files -u -- "$@" | grep -q .; }

regen_mod_list() {
  sed -e '/^Mod List:$/,$ d' README.md > README.md.tmp
  echo 'Mod List:' >> README.md.tmp
  packwiz list | sed -e 's/^/- /' >> README.md.tmp
  mv README.md.tmp README.md
}

resolve_generated() {
  if unmerged pack.toml; then
    NAME=$(git show HEAD:pack.toml | grep -m1 '^name = ') \
    DESC=$(git show HEAD:pack.toml | grep -m1 '^description = ') \
    awk '/^name = /        { print ENVIRON["NAME"]; next }
         /^description = / { print ENVIRON["DESC"]; next }
                           { print }' <(git show MERGE_HEAD:pack.toml) > pack.toml
    git add pack.toml
    echo "resolved pack.toml"
  fi
  if unmerged index.toml; then
    git checkout --ours -- index.toml   # rebuilt by packwiz refresh when finishing
    git add index.toml
    echo "resolved index.toml"
  fi
  if unmerged README.md; then
    if sed -e '/^Mod List:$/,$ d' README.md | grep -qE '^(<<<<<<<|=======|>>>>>>>)( |$)'; then
      echo "README.md has conflicts above the mod list; resolve those by hand"
    else
      sed -i -e '/^Mod List:$/,$ d' README.md && echo 'Mod List:' >> README.md
      git add README.md
      echo "resolved README.md (mod list is regenerated when finishing)"
    fi
  fi
}

finish() {
  if unmerged; then
    echo "Still unresolved:" >&2
    git diff --name-only --diff-filter=U | sed -e 's/^/  /' >&2
    die "resolve these, git add them, then run: tools/sync-vital.sh --continue"
  fi
  local marked
  marked=$(git diff --cached --name-only -z | xargs -0 -r grep -IlE '^(<<<<<<<|>>>>>>>)( |$)' -- 2>/dev/null || true)
  [[ -z "$marked" ]] || die "conflict markers left in: $marked"

  packwiz refresh
  regen_mod_list
  git add pack.toml index.toml README.md
  git commit --no-edit
  echo "Merged. Check the result, then push both branches."
}

cd "$(git rev-parse --show-toplevel)"
command -v packwiz >/dev/null || die "packwiz isn't on PATH"

base=1.21
case "${1:-}" in
  -h|--help) sed -n '2,15p' "$0" | sed -e 's/^# \{0,1\}//'; exit 0 ;;
  --continue)
    in_merge || die "no merge in progress"
    finish
    exit 0 ;;
  "") ;;
  *) base=$1 ;;
esac

branch=$(git branch --show-current)
[[ -n "$branch" && "$branch" != "$base" ]] || die "check out the variant branch (vital-1.21) first, not ${branch:-a detached HEAD}"
in_merge && die "a merge is already in progress; finish it with --continue or git merge --abort"
git diff --quiet && git diff --cached --quiet || die "commit or stash your changes first"
if git merge-base --is-ancestor "$base" HEAD; then
  echo "$branch already has everything in $base"
  exit 0
fi

git merge --no-ff --no-commit "$base" || true   # conflicts are expected; handled below
in_merge || die "git merge didn't start; see its message above"

resolve_generated
finish
