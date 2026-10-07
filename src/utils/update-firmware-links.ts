import assert from "node:assert";
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { FirmwareLinks, FirmwareURL, FirmwareVariantLinks, GithubReleaseJson } from "./types.js";
import { fetchJson, metadataFromFirmwareName, metadataFromRecoveryFirmwareName } from "./utils.js";

const GITHUB_REPOS_API = "https://api.github.com/repos/";
const GITHUB_RELEASES_ENDPOINT = "/releases";

const BUILDER_REPO = "Nerivec/silabs-firmware-builder";
const RECOVERY_REPO = "Nerivec/silabs-firmware-recovery";

async function getLatestGithubRelease(repo: string): Promise<[release: GithubReleaseJson, preRelease: GithubReleaseJson | undefined]> {
    const response = await fetchJson<GithubReleaseJson[]>(GITHUB_REPOS_API + path.posix.join(repo, GITHUB_RELEASES_ENDPOINT));
    let i = 0;
    let release = response[i++];
    let preRelease: GithubReleaseJson | undefined;

    while (release.prerelease || release.draft) {
        if (!preRelease && release.prerelease && !release.draft) {
            preRelease = release;
        }

        release = response[i++];
    }

    return [release, preRelease];
}

const [release, preRelease] = await getLatestGithubRelease(BUILDER_REPO);
const [recoveryRelease] = await getLatestGithubRelease(RECOVERY_REPO);

function findFirmwares(release: GithubReleaseJson | undefined): FirmwareLinks | undefined {
    if (!release) {
        return undefined;
    }

    const record: FirmwareLinks = {};

    for (const asset of release.assets) {
        if (asset.name.includes("bootloader_")) {
            continue;
        }

        console.log("Processing", asset.name);

        try {
            const metadata = metadataFromFirmwareName(asset.name);

            record[`${metadata.name} - ${metadata.type}`] = asset.browser_download_url as FirmwareURL;
        } catch (error) {
            console.log(error);
        }
    }

    return record;
}

function findRecoveryFirmwares(release: GithubReleaseJson): FirmwareLinks {
    const record: FirmwareLinks = {};

    for (const asset of release.assets) {
        console.log("Processing", asset.name);

        try {
            const metadata = metadataFromRecoveryFirmwareName(asset.name);
            const key = metadata.nvm3Size
                ? `${metadata.chip} - ${metadata.type} (size: ${metadata.nvm3Size})`
                : `${metadata.chip} - ${metadata.type}`;

            record[key] = asset.browser_download_url as FirmwareURL;
        } catch (error) {
            console.log(error);
        }
    }

    return record;
}

assert(release);
assert(recoveryRelease);

const firmwareLinks: FirmwareVariantLinks = {
    latest: findFirmwares(release),
    pre_release: findFirmwares(preRelease),
    recovery: findRecoveryFirmwares(recoveryRelease),
};

writeFileSync("firmware-links-v6.json", JSON.stringify(firmwareLinks, undefined, 4), "utf8");
