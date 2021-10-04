enum ReleaseType {
  Stable = 1,
  Nightly,
  PullRequest,
}

enum ReleasePlatform {
  Windows = "Windows",
  Linux = "Linux",
  MacOS = "MacOS",
}

class ReleaseAsset {
  constructor(
    readonly url: string,
    readonly displayName: string,
    readonly additionalTags: string[], // things like 32bit, AppImage, distro names, etc
    readonly downloadCount: number
  ) {}
}

class Release {
  constructor(
    readonly version: string,
    readonly semverMajor: number,
    readonly semverMinor: number,
    readonly semverPatch: number,
    readonly description: string | undefined | null,
    readonly assets: Record<ReleasePlatform, ReleaseAsset[]>,
    readonly type: ReleaseType,
    readonly draft: boolean,
    readonly prerelease: boolean,
    readonly createdAt: Date,
    readonly publishedAt: Date | undefined | null
  ) {}
}

class PullRequest {
  constructor(
    readonly number: number,
    readonly link: string,
    readonly githubUser: string,
    readonly updatedAt: Date,
    readonly body: string,
    readonly title: string,
    readonly additions: number,
    readonly deletions: number
  ) {}
}

import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";
import { Logger } from "tslog";

Octokit.plugin(throttling);
Octokit.plugin(retry);

var devEnv = process.env.NODE_ENV || "dev";
const log: Logger = new Logger({
  name: "cache",
  type: devEnv ? "pretty" : "json",
});

const semverRegex = /v?(\d+)\.(\d+)\.(\d+)/;

const octokit = new Octokit({
  auth: process.env.GH_TOKEN,
  userAgent: "PCSX2/PCSX2.github.io",
  log: {
    debug: () => {},
    info: () => {},
    warn: console.warn,
    error: console.error,
  },
  throttle: {
    onRateLimit: (retryAfter: any, options: any) => {
      log.warn(
        `Request quota exhausted for request ${options.method} ${options.url}`
      );

      // Retry twice after hitting a rate limit error, then give up
      if (options.request.retryCount <= 2) {
        log.warn(`Retrying after ${retryAfter} seconds!`);
        return true;
      }
    },
    onAbuseLimit: (retryAfter: any, options: any) => {
      // does not retry, only logs a warning
      log.warn(`Abuse detected for request ${options.method} ${options.url}`);
    },
  },
});

// NOTE - Depends on asset naming convention:
// <os>-<arch>-<additional tags>.whatever
// In the case of macOS:
// macOS-<macOS version (ie. Mojave)>-<additional tags>.whatever
// In the case of linux:
// linux-<distro OR appimage>-<arch>-<additional tags>.whatever
function gatherReleaseAssets(
  release: any
): Record<ReleasePlatform, ReleaseAsset[]> {
  let assets: Record<ReleasePlatform, ReleaseAsset[]> = {
    Windows: [],
    Linux: [],
    MacOS: [],
  };

  if (!("assets" in release)) {
    return assets;
  }

  for (var i = 0; i < release.assets.length; i++) {
    let asset = release.assets[i];
    let assetComponents = asset.name.split(".")[0].split("-");
    let platform = assetComponents[0].toLowerCase();
    if (platform == "windows") {
      let arch = assetComponents[1];
      let additionalTags = assetComponents.slice(2);
      assets.Windows.push(
        new ReleaseAsset(
          asset.browser_download_url,
          `Windows ${arch}`,
          additionalTags,
          asset.download_count
        )
      );
    } else if (assetComponents[0].toLowerCase() == "linux") {
      let distroOrAppImage = assetComponents[1];
      let additionalTags = assetComponents.slice(2);
      assets.Linux.push(
        new ReleaseAsset(
          asset.browser_download_url,
          `Linux ${distroOrAppImage}`,
          additionalTags,
          asset.download_count
        )
      );
    } else if (assetComponents[0].toLowerCase() == "macos") {
      let osxVersion = assetComponents[1];
      let additionalTags = assetComponents.slice(2);
      assets.MacOS.push(
        new ReleaseAsset(
          asset.browser_download_url,
          `MacOS ${osxVersion}`,
          additionalTags,
          asset.download_count
        )
      );
    }
  }
  return assets;
}

export class ReleaseCache {
  private stableReleases: Release[] = [];
  private combinedNightlyReleases: Release[] = [];
  private nightlyReleases: Release[] = [];
  private legacyNightlyReleases: Release[] = [];
  private pullRequestBuilds: PullRequest[] = [];

  private initialized: boolean;

  constructor() {
    this.initialized = false;
  }

  public isInitialized(cid: string): boolean {
    return this.initialized;
  }

  public async refreshReleaseCache(cid: string): Promise<void> {
    log.info("refreshing main release cache", { cid: cid, cacheType: "main" });
    var releases = await octokit.paginate(octokit.rest.repos.listReleases, {
      owner: "xTVaser", // TODO
      repo: "pcsx2-rr", // TODO
      per_page: 100,
    });

    let newStableReleases: Release[] = [];
    let newNightlyReleases: Release[] = [];
    for (var i = 0; i < releases.length; i++) {
      let release = releases[i];
      let releaseAssets = gatherReleaseAssets(release);
      const semverGroups = release.tag_name.match(semverRegex);
      if (semverGroups != null && semverGroups.length == 4) {
        const newRelease = new Release(
          release.tag_name,
          Number(semverGroups[1]),
          Number(semverGroups[2]),
          Number(semverGroups[3]),
          release.body,
          releaseAssets,
          release.prerelease ? ReleaseType.Nightly : ReleaseType.Stable,
          release.draft,
          release.prerelease,
          new Date(release.created_at),
          release.published_at == null
            ? undefined
            : new Date(release.published_at)
        );
        if (newRelease.type == ReleaseType.Nightly) {
          newNightlyReleases.push(newRelease);
        } else {
          newStableReleases.push(newRelease);
        }
      } else {
        log.warn("invalid semantic version", {
          cid: cid,
          cacheType: "main",
          semver: release.tag_name,
          matches: semverGroups,
        });
      }
    }
    this.stableReleases = newStableReleases;
    // Releases returned from github are not sorted by semantic version, but by published date -- this ensures consistency
    this.stableReleases.sort(
      (a, b) =>
        b.semverMajor - a.semverMajor ||
        b.semverMinor - a.semverMinor ||
        b.semverPatch - a.semverPatch
    );
    this.nightlyReleases = newNightlyReleases;
    this.nightlyReleases.sort(
      (a, b) =>
        b.semverMajor - a.semverMajor ||
        b.semverMinor - a.semverMinor ||
        b.semverPatch - a.semverPatch
    );
    this.combinedNightlyReleases = this.nightlyReleases.concat(
      this.legacyNightlyReleases
    );
    log.info("main release cache refreshed", { cid: cid, cacheType: "main" });
  }

  public async refreshLegacyReleaseCache(cid: string): Promise<void> {
    log.info("refreshing legacy release cache", {
      cid: cid,
      cacheType: "legacy",
    });
    // First pull down the legacy releases, these are OLD nightlys
    var legacyReleases = await octokit.paginate(
      octokit.rest.repos.listReleases,
      {
        owner: "PCSX2",
        repo: "archive",
        per_page: 100,
      }
    );

    let newLegacyReleases: Release[] = [];
    for (var i = 0; i < legacyReleases.length; i++) {
      let release = legacyReleases[i];
      let releaseAssets = gatherReleaseAssets(release);
      const semverGroups = release.tag_name.match(semverRegex);
      if (semverGroups != null && semverGroups.length == 4) {
        newLegacyReleases.push(
          new Release(
            release.tag_name,
            Number(semverGroups[1]),
            Number(semverGroups[2]),
            Number(semverGroups[3]),
            release.body,
            releaseAssets,
            ReleaseType.Nightly,
            release.draft,
            release.prerelease,
            new Date(release.created_at),
            release.published_at == null
              ? undefined
              : new Date(release.published_at)
          )
        );
      } else {
        log.warn("invalid semantic version", {
          cid: cid,
          cacheType: "main",
          semver: release.tag_name,
          matches: semverGroups,
        });
      }
    }
    this.legacyNightlyReleases = newLegacyReleases;
    this.legacyNightlyReleases.sort(
      (a, b) =>
        b.semverMajor - a.semverMajor ||
        b.semverMinor - a.semverMinor ||
        b.semverPatch - a.semverPatch
    );
    this.combinedNightlyReleases = this.nightlyReleases.concat(
      this.legacyNightlyReleases
    );
    log.info("legacy release cache refreshed", {
      cid: cid,
      cacheType: "legacy",
    });
  }

  private async grabPullRequestInfo(cursor: string | null): Promise<any> {
    const response: any = await octokit.graphql(
      `
      fragment pr on PullRequest {
        number
        author {
          login
        }
        updatedAt
        body
        title
        additions
        deletions
        isDraft
        permalink
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                state
              }
            }
          }
        }
      }

      query ($owner: String!, $repo: String!, $states: [PullRequestState!], $baseRefName: String, $headRefName: String, $orderField: IssueOrderField = UPDATED_AT, $orderDirection: OrderDirection = DESC, $perPage: Int!, $endCursor: String) {
        repository(owner: $owner, name: $repo) {
          pullRequests(states: $states, orderBy: {field: $orderField, direction: $orderDirection}, baseRefName: $baseRefName, headRefName: $headRefName, first: $perPage, after: $endCursor) {
            nodes {
              ...pr
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `,
      {
        owner: "PCSX2",
        repo: "pcsx2",
        states: "OPEN",
        baseRefName: "master",
        perPage: 100,
        endCursor: cursor,
      }
    );
    return response;
  }

  public async refreshPullRequestBuildCache(cid: string): Promise<void> {
    log.info("refreshing main release cache", {
      cid: cid,
      cacheType: "pullRequests",
    });

    try {
      let paginate: boolean = true;
      let cursor: string | null = null;
      let newPullRequestCache: PullRequest[] = [];
      while (paginate) {
        let resp: any = await this.grabPullRequestInfo(cursor);
        if (resp.repository.pullRequests.pageInfo.hasNextPage) {
          cursor = resp.repository.pullRequests.pageInfo.endCursor;
        } else {
          paginate = false;
        }
        for (var i = 0; i < resp.repository.pullRequests.nodes.length; i++) {
          // We only care about non-draft / successfully building PRs
          let pr = resp.repository.pullRequests.nodes[i];
          if (pr.isDraft) {
            continue;
          }
          if (pr.commits.nodes[0].commit.statusCheckRollup.state == "SUCCESS") {
            newPullRequestCache.push(
              new PullRequest(
                pr.number,
                pr.permalink,
                pr.author.login,
                new Date(pr.updatedAt),
                pr.body,
                pr.title,
                pr.additions,
                pr.deletions
              )
            );
          }
        }
      }
      this.pullRequestBuilds = newPullRequestCache;
      log.info("finished refreshing main release cache", {
        cid: cid,
        cacheType: "pullRequests",
      });
    } catch (error) {
      log.error("error occurred when refreshing main release cache", error);
    }
  }

  // Returns the first page of each release type in a single response
  // Default Page Size - 25
  public getLatestReleases(cid: string) {
    return {
      stableReleases: this.getStableReleases(cid, 0, 25),
      nightlyReleases: this.getNightlyReleases(cid, 0, 25),
      pullRequestBuilds: this.getPullRequestBuilds(cid, 0, 25),
    };
  }

  public getStableReleases(cid: string, offset: number, pageSize: number) {
    if (offset >= this.stableReleases.length) {
      return [];
    }

    let ret = [];
    for (
      var i = 0;
      i < pageSize && i + offset < this.stableReleases.length;
      i++
    ) {
      ret.push(this.stableReleases[i + offset]);
    }

    return ret;
  }

  public getNightlyReleases(cid: string, offset: number, pageSize: number) {
    if (offset >= this.combinedNightlyReleases.length) {
      return [];
    }

    let ret = [];
    for (
      var i = 0;
      i < pageSize && i + offset < this.combinedNightlyReleases.length;
      i++
    ) {
      ret.push(this.combinedNightlyReleases[i + offset]);
    }

    return ret;
  }

  public getPullRequestBuilds(cid: string, offset: number, pageSize: number) {
    if (offset >= this.pullRequestBuilds.length) {
      return [];
    }

    let ret = [];
    for (
      var i = 0;
      i < pageSize && i + offset < this.pullRequestBuilds.length;
      i++
    ) {
      ret.push(this.pullRequestBuilds[i + offset]);
    }

    return ret;
  }
}
