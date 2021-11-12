import { v4 as uuidv4 } from "uuid";
import express from "express";
import cors from "cors";
import { ReleaseCache } from "./models/ReleaseCache";
import { exit } from "process";
import { LogFactory } from "./utils/LogFactory";
import { RoutesV1 } from "./routes/RoutesV1";
import fs from "fs";
import https from "https";

const log = new LogFactory("app").getLogger();

const devEnv = process.env.NODE_ENV !== "production";

const ghWebhookSecret = process.env.GH_WEBHOOK_SECRET;
if (ghWebhookSecret == undefined) {
  exit(1);
}

const corsOptions = {
  origin: devEnv ? "http://localhost:8080" : process.env.CORS_FRONTEND_URL,
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const rateLimit = require("express-rate-limit");

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

// Enable if you're behind a reverse proxy (Heroku, Bluemix, AWS ELB, Nginx, etc)
// see https://expressjs.com/en/guide/behind-proxies.html
app.set("trust proxy", 1);

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minutes
  max: 30, // limit each IP to 30 requests per minute
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  onLimitReached: function (req: any, res: any, options: any) {
    log.warn("rate limit hit", {
      ip: req.ip,
      url: req.url,
    });
  },
});

// apply to all requests
app.use(limiter);

const releaseCache = new ReleaseCache();

(async function () {
  const cid = uuidv4();
  log.info("Initializing Server Cache", { cid: cid });
  await releaseCache.refreshReleaseCache(cid);
  await releaseCache.refreshPullRequestBuildCache(cid);
  // build up legacy releases in the background
  // releaseCache.refreshLegacyReleaseCache(cid);
  log.info("Initializing Server Cache", { cid: cid });
})();

// Init Routes
const v1Router = new RoutesV1(releaseCache);
app.use("/v1", v1Router.router);

// Default Route
app.use(function (req, res) {
  log.warn("invalid route accessed", {
    url: req.originalUrl,
  });
  res.send(404);
});

if (!devEnv) {
  const key = fs.readFileSync(__dirname + "/../certs/ssl.key");
  const cert = fs.readFileSync(__dirname + "/../certs/ssl.crt");
  const sslOptions = { key: key, cert: cert };
  const httpsServer = https.createServer(sslOptions, app);
  httpsServer.listen(Number(process.env.PORT), async () => {
    log.info("Cache Initialized, Serving...", {
      port: Number(process.env.PORT),
    });
  });
} else {
  app.listen(Number(process.env.PORT), async () => {
    log.info("Cache Initialized, Serving...", {
      port: Number(process.env.PORT),
    });
  });
}
