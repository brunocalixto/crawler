import {
  Parser
} from "../parser.mjs";
import {
  log as l
} from "../../log/log.mjs";
import {
  parseDataWithSelector,
  parseDataWithZipJoinList,
  parseDataWithZip,
  parseDataWithJoin,
  getNextPages
} from "./helper.mjs";
import {
  default as Crawler
} from "headless-chrome-crawler";
import {
  default as cheerio
} from "cheerio";
import {
  userAgent,
  getUrl,
  getPrettyJson
} from "../helper.mjs";

const exposeFunction = ({
  instance,
  parg,
  domain,
  uri,
  resolve,
  reject
}) => async (html) => {
  const $ = cheerio.load(html);
  let output = {
    yield: null,
    nextPages: []
  };

  if (!$) {
    const err = `[HEADLESS] Error parsing website: without $.`;
    instance.log("ERROR", err);
    reject(err);
  } else if (instance.config.pages && Array.isArray(instance.config.pages)) {
    // Return an array of array of items
    let result = instance.config.pages;

    if (parg) {
      result = result.filter(v => v.name === parg);
    }

    result = result.map(page => {
      // Parse data
      let out = parseDataWithSelector(
        $,
        domain,
        page.data.filter(e => !!e.selector),
        instance.log
      );

      // zip join list
      out = parseDataWithZipJoinList(out, page.data.filter(e => !!e.join));

      // zip array of selectors
      out = parseDataWithZip(out);

      // Adjust the "Join" case
      out = parseDataWithJoin(out, page.data.filter(e => !!e.join));

      // Set pageUrl
      out.map(element => {
        element["pageUrl"] = uri.href;
        return element;
      });

      // Add next pages
      output.nextPages = output.nextPages.concat(
        getNextPages($, uri, page.nextPages)
      );

      return out;
    });

    instance.log(
      "INFO",
      `[HEADLESS] Completing parsing ${result.length} page(s)...`
    );
    output.yield = result;
  }

  output.nextPages = output.nextPages.length === 0 ? null : output.nextPages;
  resolve(output);
  return output;
};

class Headless extends Parser {
  constructor(config, args) {
    super();
    this.args = args;
    this.config = config;
  }

  async init() {
    this.log = l(this.args.log);
    this.parser = await Crawler.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--ignore-certificate-errors"
      ],
      headless: true,
      devtools: false,
      obeyRobotsTxt: false,
      maxConnections: 20,
      userAgent: userAgent(true),
      jQuery: true,
      retryCount: 100,
      retryDelay: 1000,
      timeout: 30000,
      ...this.config.parserOptions
    });
  }

  async close() {
    await this.parser.onIdle();
    await this.parser.close();
  }

  async reader(parg, urls) {
    if (!urls) return;

    let uris;

    if (Array.isArray(urls)) {
      uris = urls.map(url =>
        getUrl(this.config.domain, url.url || this.config.rootUrl)
      );
    } else {
      uris = [getUrl(this.config.domain, urls.url || this.config.rootUrl)];
    }

    this.log("VERBOSE", `[HEADLESS] Parsing website(s) ${uris}...`);

    // TODO: Reprocess only error page
    return await Promise.all(
      uris.map(
        uri =>
        new Promise((resolve, reject) => {
          this.parser.queue({
            url: uri,
            userAgent: userAgent(true),
            evaluatePage: async () => {
                return await window.__execAction(window.document.documentElement.outerHTML);
              },
              exposedFunctionName: "__execAction",
              exposeFunction: exposeFunction({
                instance: this,
                parg,
                domain: this.config.domain,
                uri: new URL(uri),
                resolve,
                reject
              })
          });
        }))
    );
  }
}

export {
  Headless
};