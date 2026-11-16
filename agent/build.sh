#!/usr/bin/env bash
# Build agent.apk bang toolchain thu cong (aapt2 + javac + d8 + zipalign + apksigner).
# Mac dinh dung JDK/SDK trong ~/workspace/tools (co the ghi de bang JAVA_HOME/ANDROID_HOME).
set -euo pipefail
cd "$(dirname "$0")"

JAVA_HOME="${JAVA_HOME:-$HOME/workspace/tools/jdk}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/workspace/tools/android-sdk}"
BT="$ANDROID_HOME/build-tools/30.0.3"
AJAR="$ANDROID_HOME/platforms/android-29/android.jar"
export PATH="$JAVA_HOME/bin:$PATH"

OUT=build
rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/dex"

echo "[1/7] aapt2 compile res + link (manifest -> base.apk)"
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$AJAR" \
  --manifest AndroidManifest.xml \
  --min-sdk-version 28 --target-sdk-version 29 \
  "$OUT/res.zip"

echo "[2/7] javac"
find src -name '*.java' > "$OUT/sources.txt"
javac -source 8 -target 8 -encoding UTF-8 -classpath "$AJAR" -d "$OUT/classes" @"$OUT/sources.txt"

echo "[3/7] d8 (classes.jar -> classes.dex)"
(cd "$OUT/classes" && "$JAVA_HOME/bin/jar" cf ../classes.jar .)
"$BT/d8" --lib "$AJAR" --min-api 28 --output "$OUT/dex" "$OUT/classes.jar"

echo "[4/7] dong goi classes.dex vao apk"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
python3 - "$OUT/unsigned.apk" "$OUT/dex/classes.dex" <<'PYEOF'
import sys, zipfile
apk, dex = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(apk, 'a') as z:
    z.write(dex, 'classes.dex', zipfile.ZIP_DEFLATED)
print("added classes.dex")
PYEOF

echo "[5/7] zipalign"
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

echo "[6/7] ky apk (debug keystore)"
KS="$(pwd)/debug.keystore"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US" -noprompt
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --out agent.apk "$OUT/aligned.apk"

echo "[7/7] kiem tra"
"$BT/apksigner" verify agent.apk
"$BT/aapt2" dump badging agent.apk | head -4
echo "BUILD OK -> $(pwd)/agent.apk"
