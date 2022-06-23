const fs = require("fs");
const path = require("path");
const util = require("node:util");
const { readdir, readFile } = require("node:fs/promises");

const exec = util.promisify(require("node:child_process").exec);

const tmpDirPath = path.join(process.cwd(), "code-intel-extensions");
const bundlesDirPath = path.join(process.cwd(), "bundles");
const revisionFilePath = path.join(process.cwd(), "revision.txt");
const codeIntelExtensionsRepoName = "code-intel-extensions";
const codeIntelExtensionsRepoURL = `https://github.com/sourcegraph/${codeIntelExtensionsRepoName}`;

(async () => {
  const codeIntelExtensionsRepoRevision = (await readFile(revisionFilePath, "utf8")).trim();

  console.log("Cloning code-intel-extensions repo...");
  await exec(`curl -OLs ${codeIntelExtensionsRepoURL}/archive/${codeIntelExtensionsRepoRevision}.zip`);
  await exec(`unzip -q ${codeIntelExtensionsRepoRevision}.zip`);
  await exec(`mv ${codeIntelExtensionsRepoName}-${codeIntelExtensionsRepoRevision} ${tmpDirPath}`);
  await exec(`rm ${codeIntelExtensionsRepoRevision}.zip`);

  console.log("Installing code-intel-extensions dependencies...");
  await exec(`yarn --cwd ${tmpDirPath}`);

  console.log("Generating code-intel-extensions...");
  await exec(`yarn --cwd ${tmpDirPath} generate`);

  console.log("Generating code-intel-extensions bundles...");
  const content = await readdir(tmpDirPath, { withFileTypes: true });
  for (const item of content) {
    if (!item.isDirectory() || !item.name.startsWith("generated-")) {
      continue;
    }

    const pathToPackageJSON = path.join(tmpDirPath, item.name, "package.json");
    const { name, publisher } = JSON.parse(await readFile(pathToPackageJSON, "utf8"));

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
})().catch((error) => {
  console.log(error);
  process.exit(1);
});
