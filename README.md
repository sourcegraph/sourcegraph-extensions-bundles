# Code intel extension bundles

Contains a directory with Sourcegraph code intelligence extensions bundles for customers to publish to their private registries and a script to update that bundles.

### Steps

#### Publish the Extension Bundles
1. (Optional) If the publish step will be performed by another user, simply provide them with the `bundles` folder.
2. From the `bundles` folder, run `npm run publish`.
   - This runs the `publish.js` script in the `bundles` folder.
   - The script requires the following environment variables:
     |Environment Variable|Description|
     |--------------------|-----------|
     | `SRC_ENDPOINT` | See `src-cli`'s [README](https://github.com/sourcegraph/src-cli#log-into-your-sourcegraph-instance) for more information. |
     | `SRC_ACCESS_TOKEN` | See `src-cli`'s [README](https://github.com/sourcegraph/src-cli#log-into-your-sourcegraph-instance) for more information. |
     | `PUBLISHER` | The name of the [publisher](https://docs.sourcegraph.com/extensions/authoring/manifest#fields) |

   - NOTE: You do _not_ need to have `src-cli` installed for this script to work.

#### Update the Extension Bundles
1. Update the `revision.txt` file with the target revision of [code-intel-extensions repo](https://github.com/sourcegraph/code-intel-extensions]).
2. Run `npm run build`.
