import { v4 as uuidv4 } from "uuid";
import { ReleaseCache } from "../models/ReleaseCache";
import { LogFactory } from "../utils/LogFactory";
import { Request, Response } from "express";

export class ReleaseCacheControllerV1 {
  private releaseCache: ReleaseCache;
  private log = new LogFactory("release-cache").getLogger();
  private maxPageSize = 100;

  constructor(releaseCache: ReleaseCache) {
    this.releaseCache = releaseCache;
  }

  getLatestReleasesAndPullRequests(req: Request, resp: Response) {
    const cid = uuidv4();
    this.log.info("Fetching latest releases");
    resp.status(200).send(this.releaseCache.getLatestReleases(cid));
  }

  getStableReleases(req: Request, resp: Response) {
    const cid = uuidv4();
    const offset = Number(req.query.offset) || 0;
    const pageSize = Number(req.query.pageSize) || 30;
    if (offset < 0) {
      this.log.info("API error occurred - invalid offset", {
        cid: cid,
        offset: offset,
        pageSize: pageSize,
      });
      resp.status(400).send("Invalid offset value");
      return;
    }
    if (pageSize > this.maxPageSize) {
      this.log.info("API error occurred - pageSize exceeded", {
        cid: cid,
        offset: offset,
        pageSize: pageSize,
      });
      resp.status(400).send("pageSize exceeded maximum allowed '100'");
      return;
    }
    this.log.info("Fetching stable releases", {
      cid: cid,
      offset: offset,
      pageSize: pageSize,
    });
    resp
      .status(200)
      .send(this.releaseCache.getStableReleases(cid, offset, pageSize));
  }

  getNightlyReleases(req: Request, resp: Response) {
    const cid = uuidv4();
    const offset = Number(req.query.offset) || 0;
    const pageSize = Number(req.query.pageSize) || 30;
    if (offset < 0) {
      this.log.info("API error occurred - invalid offset", {
        cid: cid,
        offset: offset,
        pageSize: pageSize,
      });
      resp.status(400).send("Invalid offset value");
      return;
    }
    if (pageSize > this.maxPageSize) {
      this.log.info("API error occurred - pageSize exceeded", {
        cid: cid,
        offset: offset,
        pageSize: pageSize,
      });
      resp.status(400).send("pageSize exceeded maximum allowed '100'");
      return;
    }
    this.log.info("Fetching nightly releases", {
      cid: cid,
      offset: offset,
      pageSize: pageSize,
    });
    resp
      .status(200)
      .send(this.releaseCache.getNightlyReleases(cid, offset, pageSize));
  }

  getPullRequests(req: Request, resp: Response) {
    const cid = uuidv4();
    const offset = Number(req.query.offset) || 0;
    const pageSize = Number(req.query.pageSize) || 30;
    if (offset < 0) {
      this.log.info("API error occurred - invalid offset", {
        cid: cid,
        offset: offset,
        pageSize: pageSize,
      });
      resp.status(400).send("Invalid offset value");
      return;
    }
    if (pageSize > this.maxPageSize) {
      this.log.info("API error occurred - pageSize exceeded", {
        cid: cid,
        offset: offset,
        pageSize: pageSize,
      });
      resp.status(400).send("pageSize exceeded maximum allowed '100'");
      return;
    }
    this.log.info("Fetching current pull requests", {
      cid: cid,
      offset: offset,
      pageSize: pageSize,
    });
    resp
      .status(200)
      .send(this.releaseCache.getPullRequestBuilds(cid, offset, pageSize));
  }
}
