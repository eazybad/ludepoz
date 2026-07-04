const fs = require("fs");
const path = require("path");

const packageName = process.env.ANDROID_PACKAGE_NAME || "org.kampasika.app";
const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (fingerprints.length === 0) {
  console.error(
    "Set ANDROID_SHA256_FINGERPRINTS to one or more SHA-256 fingerprints. Separate multiple values with commas."
  );
  process.exit(1);
}

const assetLinks = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints,
    },
  },
];

const outputDir = path.join(__dirname, "..", "public", ".well-known");
const outputPath = path.join(outputDir, "assetlinks.json");

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(assetLinks, null, 2)}\n`);

console.log(`Wrote ${outputPath}`);
