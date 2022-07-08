const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");

const PUBLISHER = process.env.PUBLISHER;
if (!PUBLISHER) {
  throw new Error("Must set PUBLISHER environment variable.");
}
const SRC_ACCESS_TOKEN = process.env.SRC_ACCESS_TOKEN;
if (!SRC_ACCESS_TOKEN) {
  throw new Error("Must set SRC_ACCESS_TOKEN environment variable.");
}
const SRC_ENDPOINT = process.env.SRC_ENDPOINT;
if (!SRC_ENDPOINT) {
  throw new Error("Must set SRC_ENDPOINT environment variable.");
}

const sgurl = new URL(SRC_ENDPOINT);

(async function main() {
  const extensionDirectories = determineExtensionDirectories();
  await publishExtensions(extensionDirectories);
})();

function determineExtensionDirectories() {
  const content = fs.readdirSync(__dirname, { withFileTypes: true });

  return content
    .filter((item) => {
      if (item.isDirectory()) {
        const items = fs.readdirSync(path.join(__dirname, item.name));
        return items.includes("package.json") && items.includes(`${item.name}.js`);
      }

      return false;
    })
    .map((item) => item.name);
}

async function publishExtensions(extensionDirectories) {
  const errors = [];

  await Promise.all(
    extensionDirectories.map((directory) =>
      publishExtension(directory).catch((error) => {
        errors.push({ directory, error });
      })
    )
  );

  for (const { directory, error } of errors) {
    console.error(`Failed to publish extension in directory: ${directory}`, error);
  }
}

async function publishExtension(extensionDirectory) {
  const fullPathToExtensions = path.join(__dirname, extensionDirectory);
  // Read data from extension directory.
  const manifest = await fs.promises.readFile(path.join(fullPathToExtensions, `package.json`), "utf-8");
  const bundle = await fs.promises.readFile(path.join(fullPathToExtensions, `${extensionDirectory}.js`), "utf-8");

  // Parse manifest to find extension name.
  const { name } = JSON.parse(manifest);
  const extensionID = `${PUBLISHER}/${name}`;

  // Make POST request to publish extension to registry.
  const publishExtensionMutation = JSON.stringify({
    query: `mutation PublishExtension(
          $extensionID: String!,
          $manifest: String!,
          $bundle: String
      ) {
          extensionRegistry {
              publishExtension(
                  extensionID: $extensionID,
                  manifest: $manifest,
                  bundle: $bundle
              ) {
                  extension {
                      extensionID
                      url
                  }
              }
          }
      }`,
    variables: {
      extensionID,
      manifest,
      bundle,
    },
  });

  const result = await new Promise((resolve, reject) => {
    const adapter = sgurl.protocol == "https:" ? https : http;
    const req = adapter.request(
      {
        hostname: sgurl.hostname,
        port: sgurl.port || undefined,
        path: "/.api/graphql",
        method: "POST",
        headers: {
          Authorization: `token ${SRC_ACCESS_TOKEN}`,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (data) => chunks.push(data));
        res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks))));
      }
    );

    req.on("error", reject);
    req.write(publishExtensionMutation);
    req.end();
  });

  try {
    if (Array.isArray(result?.errors) && result.errors.length > 0) {
      console.log(result.errors[0].message);
    } else {
      console.log(`Published extension ${extensionID} from directory: ${extensionDirectory}`);
    }
  } catch {
    // noop
  }
}
