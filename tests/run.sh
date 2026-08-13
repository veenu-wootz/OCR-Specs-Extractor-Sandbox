#!/bin/bash
# Re-runnable test suite for the draft-persistence / resumable-submit work.
# Usage: ./run.sh [path-to-index.html]
set -uo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
SRC="${1:-$D/../frontend/index.html}"
python3 "$D/extract.py" "$SRC" "$D" || exit 1
node --check "$D/all.js" && echo "syntax: OK" || { echo "syntax: FAIL"; exit 1; }
rc=0
run(){ echo; echo "───── $1"; shift; cat "$@" > "$D/.run.js"; node "$D/.run.js" 2>&1 \
  | grep -vE '^(📊|📄|✅|⚠️|🔍|  Base|  Calculated|  Total|Error sending|    at )' ; \
  [ "${PIPESTATUS[0]}" -ne 0 ] && rc=1; return 0; }
run "suite 1: draft core"      "$D/stubs.js" "$D/s1-draftcore.js" "$D/draftcore.js" "$D/s1-tests.js"
for m in session windowname memory; do
  cat "$D/stubs.js" "$D/s2-fallback.js" "$D/draftcore.js" "$D/s2-tests.js" > "$D/.run.js"
  echo; echo "───── suite 2: fallback ($m)"; MODE=$m node "$D/.run.js" 2>/dev/null || rc=1
done
run "suite 3: payload build"   "$D/stubs.js" "$D/s3-submitenv.js" "$D/submitcore.js" "$D/s3-tests.js"
run "suite 4: staged submit"   "$D/stubs.js" "$D/s4-e2eenv.js" "$D/draftcore.js" "$D/s4-glue.js" "$D/submitcore.js" "$D/sendfn.js" "$D/s4-tests.js"
run "suite 5: notif priority"  "$D/stubs.js" "$D/s5-notifenv.js" "$D/notif.js" "$D/s5-tests.js"
rm -f "$D/.run.js"
echo; [ $rc -eq 0 ] && echo "ALL SUITES PASSED" || echo "SOME SUITES FAILED"
exit $rc
