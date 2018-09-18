import { Database } from "./db/database.mjs";
import { Crawler } from "./bot/crawler.mjs";
import { Rss } from "./parser/rss/rss.mjs";
import { Html } from "./parser/html/html.mjs";
import { Headless } from "./parser/html/headless.mjs";
import { getUrl } from "./parser/helper.mjs";
import { log as l } from "./log/log.mjs";
import { default as colors } from "colors";
import { default as yargs } from "yargs";
import { default as dotenv } from "dotenv";
import { default as r2 } from "r2";
import { default as path } from "path";
import fs from "fs";

dotenv.config();

yargs
  .option("website", {
    alias: "w",
    describe: "Ordered array of websites to run first."
  })
  .option("type", {
    alias: "t",
    describe: "Crawler page type to run."
  })
  .option("page", {
    alias: "p",
    describe: "Crawler page to run."
  })
  .option("environment", {
    alias: "e",
    describe: "Environment to run."
  })
  .option("log", {
    alias: "l",
    describe: "Log level."
  })
  .option("cpu", {
    alias: "c",
    describe: "Cpu quantity to fork."
  })
  .option("file", {
    alias: "f",
    describe: "File config to load."
  })
  .option("restart", {
    alias: "r",
    describe: "Clean processedAt and startedAt."
  })
  .demandOption(["environment", "page", "type", "cpu"])
  .default("environment", "development")
  .default("restart", false)
  .default("file", "config.json")
  .boolean("restart")
  .array("website")
  .array("page");

colors.setTheme({
  silly: "rainbow",
  input: "grey",
  verbose: "cyan",
  prompt: "grey",
  info: "green",
  data: "grey",
  help: "cyan",
  warn: "yellow",
  debug: "blue",
  error: "red"
});

const log = l(yargs.argv.log);
let runners = 0;
let configuration;

const run = async cfg => {
  let crawl;

  switch (cfg.config.type) {
    case "html":
      const html = new Html(cfg.config, cfg.args);
      await html.init();
      crawl = new Crawler(cfg.db, html, cfg.args);
      break;
    case "rss":
      const rss = new Rss(cfg.config, cfg.args);
      await rss.init();
      crawl = new Crawler(cfg.db, rss, cfg.args);
      break;
    case "headless":
      const headless = new Headless(cfg.config, cfg.args);
      await headless.init();
      crawl = new Crawler(cfg.db, headless, cfg.args);
      break;
  }

  if (cfg.args.restart) {
    await crawl.restartProccess(cfg.args.website);
  }

  if (
    (crawl && cfg.args.type && crawl.type === cfg.args.type) ||
    (crawl && !cfg.args.type)
  ) {
    log(
      "INFO",
      `Starting proccess for ${getUrl(
        cfg.config.domain,
        cfg.config.rootUrl
      )}...`
    );

    try {
      runners += 1;
      await crawl.start();
    } catch (err) {
      log("ERROR", `Closing ${err}`);

      runners -= 1;
      if (runners === 0) {
        cfg.db.sequelize.close();
        crawl.close();
        process.exit(0);
      }
    }
  }
};

const getRemoteConfig = async config => {
  if (config && config.remote && config.remote.url) {
    try {
      return await r2(config.remote.url).json;
    } catch (e) {}
  }
  return null;
};

const start = async () => {
  const file = path.join("config", yargs.argv.file);
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  const remote = await getRemoteConfig(config);
  configuration = remote ? remote.data : config;

  const database = new Database(configuration.database, yargs.argv.environment);
  await database.sync();

  let websites = configuration["websites"].slice(0);
  let websitesArg = yargs.argv.website ? yargs.argv.website.slice(0) : [];
  let pagesArg = yargs.argv.page ? yargs.argv.page.slice(0) : [];

  websites
    .filter(
      v =>
        v.type === yargs.argv.type &&
        ((websitesArg.length > 0 && websitesArg.indexOf(v.name) > -1) ||
          websitesArg.length === 0)
    )
    .forEach(w => {
      pagesArg.forEach(p => {
        run({
          db: database,
          config: w,
          args: {
            page: p,
            type: yargs.argv.type,
            env: yargs.argv.environment,
            website: w.name,
            restart: yargs.argv.restart,
            log: yargs.argv.log
          }
        });
      });
    });
};

export { start };
