import { v4 as uuidv4 } from "uuid";
import { ReleaseCache } from "../models/ReleaseCache";
import { LogFactory } from "../utils/LogFactory";
import { Request, Response } from "express";
import crypto from "crypto";

export class GithubController {
  private releaseCache: ReleaseCache;
  private log = new LogFactory("gh-listener").getLogger();
  private readonly webhookSecret;

  constructor(releaseCache: ReleaseCache) {
    this.releaseCache = releaseCache;
    const secret = process.env.GH_WEBHOOK_SECRET;
    if (secret == undefined) {
      this.log.error("GH_WEBHOOK_SECRET isn't set. Aborting");
      throw new Error("GH_WEBHOOK_SECRET isn't set. Aborting");
    } else {
      this.webhookSecret = secret;
    }
  }

  // in the future, might change it from instead of listing all releases it just uses the content of the webhook to evict the cache
  // for the foreseeable future though, this is fine
  webhookHandler(req: Request, resp: Response) {
    const cid = uuidv4();
    this.log.info("Received request", req.headers);
    const ghDigestRaw = req.header("x-hub-signature-256");
    if (ghDigestRaw == undefined) {
      resp.send(403);
      return;
    }
    const ghDigest = Buffer.from(ghDigestRaw, "utf8");
    const digest = Buffer.from(
      `sha256=${crypto
        .createHmac("sha256", this.webhookSecret)
        .update(JSON.stringify(req.body))
        .digest("hex")}`,
      "utf8"
    );
    if (crypto.timingSafeEqual(digest, ghDigest)) {
      // Valid webhook from github, proceed
      const body = req.body;
      if (
        "action" in body &&
        body.action == "published" &&
        "release" in body &&
        body.release.draft == true
      ) {
        // Release event
        if (
          "repository" in body &&
          body.repository.full_name == "PCSX2/pcsx2"
        ) {
          this.releaseCache.refreshReleaseCache(cid);
        } else if (
          "repository" in body &&
          body.repository.full_name == "PCSX2/archive"
        ) {
          this.releaseCache.refreshLegacyReleaseCache(cid);
        }
      } else if (
        "action" in body &&
        body.action == "completed" &&
        "check_suite" in body &&
        body.check_suite.status == "completed" &&
        body.check_suite.conclusion == "success"
      ) {
        this.releaseCache.refreshPullRequestBuildCache(cid);
      }
    } else {
      resp.send(403);
      return;
    }
    resp.send(204);
  }
}
