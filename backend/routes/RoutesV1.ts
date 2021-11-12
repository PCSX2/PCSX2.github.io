import express from "express";
import { GithubController } from "../controllers/GithubController";
import { ReleaseCacheControllerV1 } from "../controllers/ReleaseCacheControllerV1";
import { ReleaseCache } from "../models/ReleaseCache";

export class RoutesV1 {
  router: express.Router;
  private githubController: GithubController;
  private releaseCacheControllerV1: ReleaseCacheControllerV1;

  constructor(releaseCache: ReleaseCache) {
    this.router = express.Router();
    this.githubController = new GithubController(releaseCache);
    this.releaseCacheControllerV1 = new ReleaseCacheControllerV1(releaseCache);

    // Init Routes
    this.router
      .route("/latestReleasesAndPullRequests")
      .get((req, resp) =>
        this.releaseCacheControllerV1.getLatestReleasesAndPullRequests(
          req,
          resp
        )
      );
    this.router
      .route("/stableReleases")
      .get((req, resp) =>
        this.releaseCacheControllerV1.getStableReleases(req, resp)
      );
    this.router
      .route("/nightlyReleases")
      .get((req, resp) =>
        this.releaseCacheControllerV1.getNightlyReleases(req, resp)
      );
    this.router
      .route("/pullRequests")
      .get((req, resp) =>
        this.releaseCacheControllerV1.getPullRequests(req, resp)
      );

    // Other Routes
    this.router
      .route("/github-webhook")
      .post((req, resp) => this.githubController.webhookHandler(req, resp));
  }
}
