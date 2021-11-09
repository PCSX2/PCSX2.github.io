import dotenv from "dotenv";
dotenv.config();
var devEnv = process.env.NODE_ENV !== "production";

import { v4 as uuidv4 } from "uuid";

import crypto from "crypto";

const LokiTransport = require("winston-loki");
import winston from "winston";
const log = winston.createLogger({
  defaultMeta: { service: "main" },
});
log.add(
  new winston.transports.Console({
    format: winston.format.simple(),
  })
);

if (!devEnv) {
  console.log("Piping logs to Grafana as well");
  const lokiTransport = new LokiTransport({
    host: `https://logs-prod-us-central1.grafana.net`,
    batching: true,
    basicAuth: `${process.env.GRAFANA_LOKI_USER}:${process.env.GRAFANA_LOKI_PASS}`,
    labels: { app: "pcsx2-backend", env: devEnv ? "dev" : "prod" },
    // remove color from log level label - loki really doesn't like it
    format: winston.format.uncolorize({
      message: false,
      raw: false,
    }),
  });
  log.add(lokiTransport);
}

const ghWebhookSecret = process.env.GH_WEBHOOK_SECRET;
if (ghWebhookSecret == undefined) {
  exit(1);
}

import express from "express";
import cors from "cors";

var corsOptions = {
  origin: devEnv ? "http://localhost:8080" : process.env.CORS_FRONTEND_URL,
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};

import { ReleaseCache } from "./models/ReleaseCache";
import { exit } from "process";

const rateLimit = require("express-rate-limit");

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

// Enable if you're behind a reverse proxy (Heroku, Bluemix, AWS ELB, Nginx, etc)
// see https://expressjs.com/en/guide/behind-proxies.html
// app.set("trust proxy", 1);

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minutes
  max: 30, // limit each IP to 30 requests per minute
  onLimitReached: function (req: any, res: any, options: any) {
    log.warn("rate limit hit", {
      ip: req.ip,
      url: req.url,
    });
  },
});

//  apply to all requests
app.use(limiter);

const maxPageSize = 100;

const releaseCache = new ReleaseCache();

// in the future, might change it from instead of listing all releases it just uses the content of the webhook to evict the cache
// for the foreseeable future though, this is fine
app.post("/github-webhook", (req, res) => {
  const cid = uuidv4();
  log.info("Received request", req.headers);
  let ghDigestRaw = req.header("x-hub-signature-256");
  if (ghDigestRaw == undefined) {
    res.send(403);
    return;
  }
  const ghDigest = Buffer.from(ghDigestRaw, "utf8");
  const digest = Buffer.from(
    `sha256=${crypto
      .createHmac("sha256", ghWebhookSecret)
      .update(JSON.stringify(req.body))
      .digest("hex")}`,
    "utf8"
  );
  if (crypto.timingSafeEqual(digest, ghDigest)) {
    // Valid webhook from github, proceed
    let body = req.body;
    if (
      "action" in body &&
      body.action == "published" &&
      "release" in body &&
      body.release.draft == true
    ) {
      // Release event
      if (
        "repository" in body &&
        body.repository.full_name == "PCSX2/pcsx2" // TODO
      ) {
        releaseCache.refreshReleaseCache(cid);
      } else if (
        "repository" in body &&
        body.repository.full_name == "PCSX2/archive"
      ) {
        releaseCache.refreshLegacyReleaseCache(cid);
      }
    } else if (
      "action" in body &&
      body.action == "completed" &&
      "check_suite" in body &&
      body.check_suite.status == "completed" &&
      body.check_suite.conclusion == "success"
    ) {
      releaseCache.refreshPullRequestBuildCache(cid);
    }
  } else {
    res.send(403);
    return;
  }
  res.send(204);
});

// Returns the first page of the caches, minimize calls on initial page load to 1
app.get("/latestReleasesAndPullRequests", (req, res) => {
  const cid = uuidv4();
  log.info("Fetching latest releases");
  res.status(200).send(releaseCache.getLatestReleases(cid));
});

// Drill down for specific pagination support
app.get("/stableReleases", (req, res) => {
  const cid = uuidv4();
  let offset = Number(req.query.offset) || 0;
  let pageSize = Number(req.query.pageSize) || 30;
  if (offset < 0) {
    log.info("API error occurred - invalid offset", {
      cid: cid,
      offset: offset,
      pageSize: pageSize,
    });
    res.status(400).send("Invalid offset value");
    return;
  }
  if (pageSize > maxPageSize) {
    log.info("API error occurred - pageSize exceeded", {
      cid: cid,
      offset: offset,
      pageSize: pageSize,
    });
    res.status(400).send("pageSize exceeded maximum allowed '100'");
    return;
  }
  log.info("Fetching stable releases", {
    cid: cid,
    offset: offset,
    pageSize: pageSize,
  });
  res.status(200).send(releaseCache.getStableReleases(cid, offset, pageSize));
});

app.get("/nightlyReleases", (req, res) => {
  const cid = uuidv4();
  let offset = Number(req.query.offset) || 0;
  let pageSize = Number(req.query.pageSize) || 30;
  if (offset < 0) {
    log.info("API error occurred - invalid offset", {
      cid: cid,
      offset: offset,
      pageSize: pageSize,
    });
    res.status(400).send("Invalid offset value");
    return;
  }
  if (pageSize > maxPageSize) {
    log.info("API error occurred - pageSize exceeded", {
      cid: cid,
      offset: offset,
      pageSize: pageSize,
    });
    res.status(400).send("pageSize exceeded maximum allowed '100'");
    return;
  }
  log.info("Fetching nightly releases", {
    cid: cid,
    offset: offset,
    pageSize: pageSize,
  });
  res.status(200).send(releaseCache.getNightlyReleases(cid, offset, pageSize));
});

app.get("/pullRequests", (req, res) => {
  const cid = uuidv4();
  let offset = Number(req.query.offset) || 0;
  let pageSize = Number(req.query.pageSize) || 30;
  if (offset < 0) {
    log.info("API error occurred - invalid offset", {
      cid: cid,
      offset: offset,
      pageSize: pageSize,
    });
    res.status(400).send("Invalid offset value");
    return;
  }
  if (pageSize > maxPageSize) {
    log.info("API error occurred - pageSize exceeded", {
      cid: cid,
      offset: offset,
      pageSize: pageSize,
    });
    res.status(400).send("pageSize exceeded maximum allowed '100'");
    return;
  }
  log.info("Fetching current pull requests", {
    cid: cid,
    offset: offset,
    pageSize: pageSize,
  });
  res
    .status(200)
    .send(releaseCache.getPullRequestBuilds(cid, offset, pageSize));
});

// Default Route
app.use(function (req, res) {
  log.error("invalid route accessed", {
    url: req.originalUrl,
  });
  res.send(404);
});

app.listen(Number(process.env.PORT), async () => {
  const cid = uuidv4();
  log.info("Initializing Server Cache", { cid: cid });
  await releaseCache.refreshReleaseCache(cid);
  await releaseCache.refreshPullRequestBuildCache(cid);
  // build up legacy releases in the background
  releaseCache.refreshLegacyReleaseCache(cid);
  log.info("Cache Initialized, Serving...", {
    port: Number(process.env.PORT),
  });
});
