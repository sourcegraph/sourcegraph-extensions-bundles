const fs = require("fs");
const path = require("path");
const util = require("node:util");

const { revision } = require("./config");

const exec = util.promisify(require("node:child_process").exec);

const tmpDirPath = path.join(process.cwd(), "code-intel-extensions");
const bundlesDirPath = path.join(process.cwd(), "bundles");
const bundlesRevisionFilePath = path.join(process.cwd(), "bundles", "revision.txt");
const codeIntelExtensionsRepoName = "code-intel-extensions";
const codeIntelExtensionsRepoURL = `https://github.com/sourcegraph/${codeIntelExtensionsRepoName}`;

(async () => {
  if (fs.existsSync(bundlesRevisionFilePath) && fs.readFileSync(bundlesRevisionFilePath).toString() === revision) {
    console.log("Code-intel extensions bundles of the given revision are already in the 'bundles' directory.");
    return;
  }

  console.log("Cloning code-intel-extensions repo...");
  await exec(`curl -OLs ${codeIntelExtensionsRepoURL}/archive/${revision}.zip`);
  await exec(`unzip -q ${revision}.zip`);
  await exec(`mv ${codeIntelExtensionsRepoName}-${revision} ${tmpDirPath}`);
  await exec(`rm ${revision}.zip`);

  console.log("Installing code-intel-extensions dependencies...");
  await exec(`yarn --cwd ${tmpDirPath}`);

  console.log("Generating code-intel-extensions...");
  await exec(`yarn --cwd ${tmpDirPath} generate`);

  console.log("Generating code-intel-extensions bundles...");
  const content = await fs.promises.readdir(tmpDirPath, { withFileTypes: true });
  for (const item of content) {
    if (!item.isDirectory() || !item.name.startsWith("generated-")) {
      continue;
    }

    const pathToPackageJSON = path.join(tmpDirPath, item.name, "package.json");
    const { name, publisher } = JSON.parse(await fs.promises.readFile(pathToPackageJSON, "utf8"));

    console.log(`Generating "${publisher}/${name}" bundle...`);
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
  }

  await exec(`rm -rf ${tmpDirPath}`);
  await fs.promises.writeFile(bundlesRevisionFilePath, revision);
})().catch((error) => {
  console.log(error);
  process.exit(1);
});
