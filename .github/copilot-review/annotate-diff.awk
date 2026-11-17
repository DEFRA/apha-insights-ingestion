# Prepare a `gh pr diff` for review:
#  - drops noisy files (lockfiles, fixtures, snapshots, build output, images, minified)
#  - prefixes each added/context line with its line number in the NEW file,
#    so findings cite real source line numbers rather than diff line numbers
#  - lists skipped files at the end
# Usage: gh pr diff N --repo R | awk -f annotate-diff.awk
BEGIN {
  skipre = "(^|/)(package-lock\\.json|yarn\\.lock|pnpm-lock\\.yaml|poetry\\.lock|Pipfile\\.lock|Cargo\\.lock|go\\.sum|composer\\.lock)$"
  skipre = skipre "|\\.(lock|min\\.js|min\\.css|map|svg|png|jpe?g|gif|ico|pdf|woff2?|ttf|zip)$"
  skipre = skipre "|(^|/)(dist|build|vendor|node_modules|coverage|fixtures|__fixtures__|__snapshots__|testdata)/"
  skipped = ""
}
/^diff --git / {
  path = $NF; sub(/^b\//, "", path)
  skip = (path ~ skipre)
  if (skip) { skipped = skipped "\n- " path; next }
  new = ""
  print ""; print "=== FILE: " path
  next
}
skip { next }
/^@@ / {
  if (match($0, /\+[0-9]+/)) new = substr($0, RSTART + 1, RLENGTH - 1) + 0
  print; next
}
new == "" { next }                     # index/---/+++ header lines: drop
/^\\/ { print; next }                  # "\ No newline at end of file"
/^-/  { printf "      %s\n", $0; next }
{ printf "%5d %s\n", new, $0; new++ }
END { if (skipped != "") print "\n=== SKIPPED (not reviewed):" skipped }
