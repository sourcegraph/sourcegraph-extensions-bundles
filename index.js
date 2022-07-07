const fs = require("fs");
const path = require("path");
const util = require("node:util");
const https = require("https");

const exec = util.promisify(require("node:child_process").exec);

const bundlesDirPath = "./bundles";

const bundleCodeIntelExtensions = async () => {
  const tmpDirPath = "./code-intel-extensions";
  const codeIntelExtensionsRepoName = "code-intel-extensions";
  const codeIntelExtensionsRepoURL = `https://github.com/sourcegraph/${codeIntelExtensionsRepoName}`;

  const [revision] = (await exec(`git ls-remote ${codeIntelExtensionsRepoURL} HEAD`)).stdout.split("\t");
  if (!revision) {
    return;
  }

  console.log(`Cloning code-intel extensions repository... Revision: ${revision}`);
  await exec(`curl -OLs ${codeIntelExtensionsRepoURL}/archive/${revision}.zip`);
  await exec(`unzip -q ${revision}.zip`);

  await exec(`mv ${codeIntelExtensionsRepoName}-${revision} ${tmpDirPath}`);
  await exec(`rm ${revision}.zip`);

  console.log("Installing code-intel extensions dependencies...");
  await exec(`yarn --cwd ${tmpDirPath}`);

  console.log("Generating code-intel extensions...");
  await exec(`yarn --cwd ${tmpDirPath} generate`);

  console.log("Generating code-intel extensions bundles...");
  const content = await fs.readdirSync(tmpDirPath, { withFileTypes: true });
  for (const item of content) {
    if (!item.isDirectory() || !item.name.startsWith("generated-")) {
      continue;
    }

    const pathToPackageJSON = path.join(tmpDirPath, item.name, "package.json");
    const { name, publisher } = JSON.parse(fs.readFileSync(pathToPackageJSON, "utf8"));

    await exec(`yarn --cwd ${path.join(tmpDirPath, item.name)} build`);

    const extensionBundleName = `${publisher}-${name}`;
    await exec(`mkdir -p ${path.join(bundlesDirPath, extensionBundleName)}`);
    await exec(`cp -r ${pathToPackageJSON} ${path.join(bundlesDirPath, extensionBundleName)}`);
    await exec(
      `cp -r ${path.join(tmpDirPath, item.name, "dist", "extension.js")} ${path.join(
        bundlesDirPath,
        extensionBundleName,
        `${extensionBundleName}.js`
      )}`
    );
    console.log(`Successfully generated ${publisher}/${name} bundle.`);
  }

  await exec(`rm -rf ${tmpDirPath}`);
};

/**
 * Reads the list of default extension IDs to be cloned from `./default-extensions.txt`.
 */
function getDefaultExtensionIDs() {
  const rawExtensionIDs = fs.readFileSync("./default-extensions.txt", "utf-8");
  const extensionIDs = rawExtensionIDs
    .split("\n")
    .map((id) => id.trim())
    .filter(Boolean);

  return extensionIDs;
}

/**
 * Fetches extension bundles + manifests from sourcegraph.com.
 */
async function getDefaultExtensions(extensionIDs) {
  // Log errored extension downloads
  const errors = [];

  const extensions = (
    await Promise.all(
      extensionIDs.map((id) =>
        getDefaultExtension(id).catch((error) => {
          errors.push({ extensionID: id, error });
          return null;
        })
      )
    )
  ).filter(Boolean);

  for (const { extensionID, error } of errors) {
    console.error(`Failed to query extension: ${extensionID}`, error);
  }

  return extensions;
}

/**
 * Fetches extension metadata from sourcegraph.com, downloads the extension bundle, then returns
 * a Promise for data necessary to publish the extension.
 */
async function getDefaultExtension(extensionID) {
  const extensionQuery = JSON.stringify({
    query: `query Extension($extensionID: String!) {
        extensionRegistry {
            extension(extensionID: $extensionID) {
             extensionID
              manifest {
                raw
                bundleURL
              }
            }
          }
        }`,
    variables: {
      extensionID,
    },
  });

  const extensionMetadata = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "sourcegraph.com",
        path: "/.api/graphql",
        method: "POST",
        headers: {
          "User-agent":
            "Mozilla/5.0 (Linux; U; Android 4.1.1; en-gb; Build/KLP) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Safari/534.30",
        },
      },
      (res) => {
        const chunks = [];

        res.on("data", (data) => chunks.push(data));

        res.on("end", () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(Buffer.concat(chunks)));
            console.log(`Successfully loaded ${extensionID}.`);
          } else {
            console.error(`Couldn't load ${extensionID}. StatusCode: ${res.statusCode}`);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(extensionQuery);
    req.end();
  });

  const { raw: manifest } = extensionMetadata.data.extensionRegistry.extension.manifest;

  if (!manifest) {
    throw new Error(`Could not find raw manifest for ${extensionID}`);
  }

  const { bundleURL } = extensionMetadata.data.extensionRegistry.extension.manifest;

  if (!bundleURL) {
    throw new Error(`Could not find bundleURL for ${extensionID}`);
  }

  // Download extension bundle.
  const bundle = await new Promise((resolve, reject) => {
    const req = https.get(bundleURL, (res) => {
      const chunks = [];

      res.on("data", (data) => chunks.push(data));

      res.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });

    req.on("error", reject);
    req.end();
  });

  return { extensionID, manifest, bundle };
}

const bundleDefaultExtensions = async () => {
  const extensionIDs = getDefaultExtensionIDs();
  const extensions = await getDefaultExtensions(extensionIDs);

  for (const { extensionID, manifest, bundle } of extensions) {
    const extensionBundleName = extensionID.replace("/", "-");
    await exec(`mkdir -p ${path.join(bundlesDirPath, extensionBundleName)}`);

    fs.writeFileSync(`${bundlesDirPath}/${extensionBundleName}/${extensionBundleName}.js`, bundle, "utf8");
    fs.writeFileSync(`${bundlesDirPath}/${extensionBundleName}/package.json`, manifest, "utf8");
  }
};

(async () => {
  const codeIntelExtensions = await bundleCodeIntelExtensions();
  const defaultExtensions = await bundleDefaultExtensions();
})().catch((error) => {
  console.log(error);
  process.exit(1);
});
