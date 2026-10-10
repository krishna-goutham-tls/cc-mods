#!/bin/bash
# Status line for Claude Code. Reads the session JSON on stdin, prints one line.
# Fields: https://code.claude.com/docs/en/statusline

input=$(cat)

q='[.model.display_name, (.workspace.current_dir // .cwd), .context_window.used_percentage,
    .effort.level, .rate_limits.five_hour.used_percentage, .rate_limits.five_hour.resets_at]
   | map(if . == null then "" else tostring end) | join("\u001f")'
# The jq that macOS ships starts faster than one from Anaconda or Homebrew. Without jq, python3 reads the JSON.
jq=/usr/bin/jq
[ -x "$jq" ] || jq=$(command -v jq)
if [ -n "$jq" ]; then
  fields=$(printf '%s' "$input" | "$jq" -r "$q" 2>/dev/null)
else
  fields=$(printf '%s' "$input" | python3 -c '
import json, sys
try: d = json.load(sys.stdin)
except Exception: d = {}
def g(*p):
    v = d
    for k in p:
        v = v.get(k) if isinstance(v, dict) else None
    return "" if v is None else str(v)
print("\x1f".join([g("model", "display_name"), g("workspace", "current_dir") or g("cwd"),
    g("context_window", "used_percentage"), g("effort", "level"),
    g("rate_limits", "five_hour", "used_percentage"),
    g("rate_limits", "five_hour", "resets_at")]))' 2>/dev/null)
fi
IFS=$'\x1f' read -r model dir ctx effort five five_reset <<<"$fields"

[ -n "$dir" ] || dir=$PWD
if [ "$dir" = "$HOME" ]; then folder='~'; else folder=${dir##*/}; fi

# Read the branch from .git/HEAD. Starting git for it costs tens of milliseconds on every redraw.
branch= d=$dir
while [ -n "$d" ]; do
  if [ -f "$d/.git" ]; then
    read -r _ g <"$d/.git"
    case $g in /*) ;; *) g=$d/$g ;; esac
  else
    g=$d/.git
  fi
  if [ -r "$g/HEAD" ]; then
    read -r head <"$g/HEAD"
    case $head in
      "ref: refs/heads/"*) branch=${head#ref: refs/heads/} ;;
      *) branch=${head:0:7} ;;
    esac
    break
  fi
  d=${d%/*}
done

look=warm
[ -r "$HOME/.claude/tint/active" ] && read -r look <"$HOME/.claude/tint/active"
# The theme picked in /theme wins, so the bar and the transcript never disagree.
while IFS= read -r line; do
  case $line in
    *'"theme"'*tint-grok*) look=grok; break ;;
    *'"theme"'*tint-warm*) look=warm; break ;;
  esac
done <"$HOME/.claude/settings.json" 2>/dev/null

# The ANSI colors come from the terminal's own palette, so they follow its dark and light.
# The warm orange is not in that palette, so it needs the mode. Only macOS has `defaults`.
# Elsewhere the command fails and the bar uses the orange of the light set.
reset=$'\033[0m' dim=$'\033[90m' ok=$'\033[32m' warn=$'\033[33m'
sep=$'\033[2;90m'" │ $reset"
if [ "$look" = grok ]; then
  accent=$'\033[34m'
elif [ "$(defaults read -g AppleInterfaceStyle 2>/dev/null)" = Dark ]; then
  accent=$'\033[38;2;217;119;87m'
else
  accent=$'\033[38;2;193;95;60m'
fi

# Nerd Font glyphs: folder (U+F07B) and branch (U+E0A0).
i_folder=$'\xef\x81\xbb' i_branch=$'\xee\x82\xa0'

out=
add() { out="${out:+$out$sep}$1"; }

[ -n "$model" ] && add "${accent}✻ $model$reset"
add "$i_folder $folder"
[ -n "$branch" ] && add "$dim$i_branch $branch$reset"
if [ -n "$ctx" ]; then
  ctx=${ctx%.*}
  if [ "$ctx" -ge 80 ] 2>/dev/null; then c=$warn; else c=$ok; fi
  add "$c$ctx% context$reset"
fi
[ -n "$effort" ] && add "$dim$effort$reset"
if [ -n "$five" ]; then
  five=${five%.*}
  # Time until the 5-hour window resets. High use matters only when much time is left.
  left= mins=0
  five_reset=${five_reset%.*}
  if [ "$five_reset" -gt 0 ] 2>/dev/null; then
    mins=$(( (five_reset - $(date +%s)) / 60 ))
    if [ "$mins" -ge 60 ]; then left=" · $((mins / 60))h $((mins % 60))m left"
    elif [ "$mins" -gt 0 ]; then left=" · ${mins}m left"
    fi
  fi
  if [ "$five" -ge 80 ] 2>/dev/null && { [ -z "$left" ] || [ "$mins" -gt 30 ]; }; then c=$warn; else c=$dim; fi
  add "$c$five% of 5h$left$reset"
fi

printf '%s\n' "$out"
